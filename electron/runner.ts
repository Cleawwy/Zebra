import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { spawn, ChildProcess, exec, execSync } from 'child_process';
import pidusage from 'pidusage';
import { ServerInstance, ServerConfig, AppSettings } from './types';
import { NbtManager } from './nbt';
import { UpnpManager } from './upnp';
import { ModFilter } from './modfilter';
import { ServerJarDownloader } from './downloader';
import { P2PHostEngine } from './p2pHost';

interface ServerSession {
  server: ServerInstance;
  process: ChildProcess;
  monitorInterval?: NodeJS.Timeout;
  heartbeatInterval?: NodeJS.Timeout;
  stopTimer?: NodeJS.Timeout;
}

export class ServerRunner {
  private sessions: Map<string, ServerSession> = new Map();
  private p2pEngines: Map<string, P2PHostEngine> = new Map();
  private upnpManager: UpnpManager = new UpnpManager();
  private onLogCallback: ((line: string, serverId?: string) => void) | null = null;
  private onStatusChangeCallback: ((server: ServerInstance) => void) | null = null;
  private appDataDir: string;
  private hostId: string = '';
  private appSettings: AppSettings | null = null;

  constructor() {
    this.appDataDir = path.join(os.homedir(), '.zebra');
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true });
    }
  }

  public setSettings(settings: AppSettings) {
    this.appSettings = settings;
    if (settings.hostInstanceId) {
      this.hostId = settings.hostInstanceId;
    }
  }

  public setHostId(id: string) {
    this.hostId = id;
  }

  public getHostId(): string {
    return this.hostId;
  }

  public setCallbacks(
    onLog: (line: string, serverId?: string) => void,
    onStatusChange: (server: ServerInstance) => void
  ) {
    this.onLogCallback = onLog;
    this.onStatusChangeCallback = onStatusChange;
  }

  public getActiveServer(serverId?: string): ServerInstance | null {
    if (serverId) {
      const sess = this.sessions.get(serverId);
      return sess ? { ...sess.server } : null;
    }
    const first = this.sessions.values().next().value;
    return first ? { ...first.server } : null;
  }

  public getActiveServers(): ServerInstance[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s.server }));
  }

  public isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => {
        srv.close(() => resolve(true));
      });
      srv.listen(port, '0.0.0.0');
    });
  }

  public async findAvailablePort(startPort: number = 25565): Promise<number> {
    let port = startPort;
    const occupiedBySessions = new Set(
      Array.from(this.sessions.values())
        .filter((s) => s.server.status === 'online' || s.server.status === 'starting')
        .map((s) => s.server.port)
    );

    while (port < startPort + 100) {
      if (!occupiedBySessions.has(port)) {
        const avail = await this.isPortAvailable(port);
        if (avail) return port;
      }
      port++;
    }
    return startPort;
  }

  private writeSessionFile(server: ServerInstance, pid: number) {
    try {
      const sessionData = {
        serverId: server.id,
        pid,
        port: server.port,
        roomCode: server.roomCode,
        e4mcDomain: server.e4mcDomain,
        directIp: server.directIp,
        startedAt: Date.now(),
      };
      fs.writeFileSync(path.join(server.path, '.zebra_session.json'), JSON.stringify(sessionData, null, 2), 'utf8');
    } catch (e) {
      console.warn('[Zebra] Could not write .zebra_session.json:', e);
    }
  }

  private clearSessionFile(serverPath: string) {
    try {
      const p = path.join(serverPath, '.zebra_session.json');
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }

  public isPidAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err.code === 'EPERM';
    }
  }

  public findRunningProcessForServer(serverPath: string): number | null {
    // 1. Check .zebra_session.json first
    try {
      const sessionFile = path.join(serverPath, '.zebra_session.json');
      if (fs.existsSync(sessionFile)) {
        const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        if (data && typeof data.pid === 'number' && this.isPidAlive(data.pid)) {
          return data.pid;
        }
      }
    } catch {}

    // 2. Query OS for active Java processes matching this directory
    if (process.platform === 'win32') {
      try {
        const escaped = serverPath.replace(/\\/g, '\\\\').replace(/"/g, '`"');
        const ps = `(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'java' -and $_.CommandLine -like '*${escaped}*' } | Select-Object -First 1).ProcessId`;
        const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8', timeout: 3000 }).trim();
        const pid = parseInt(out, 10);
        if (!isNaN(pid) && pid > 0 && this.isPidAlive(pid)) {
          return pid;
        }
      } catch {}
    } else {
      try {
        const out = execSync(`pgrep -f "${serverPath}"`, { encoding: 'utf8', timeout: 3000 }).trim();
        const pids = out.split('\n').map((p) => parseInt(p.trim(), 10)).filter(Boolean);
        for (const p of pids) {
          if (this.isPidAlive(p)) return p;
        }
      } catch {}
    }

    return null;
  }

  public adoptRunningProcess(server: ServerInstance, pid: number): void {
    const runningServer: ServerInstance = {
      ...server,
      status: 'online',
    };

    // If session file exists, read any cached metadata
    try {
      const sessFile = path.join(server.path, '.zebra_session.json');
      if (fs.existsSync(sessFile)) {
        const data = JSON.parse(fs.readFileSync(sessFile, 'utf8'));
        if (data.e4mcDomain) runningServer.e4mcDomain = data.e4mcDomain;
        if (data.directIp) runningServer.directIp = data.directIp;
        if (data.port) runningServer.port = data.port;
      }
    } catch {}

    const session: ServerSession = {
      server: runningServer,
      process: { pid } as any,
    };
    this.sessions.set(server.id, session);
    this.writeSessionFile(runningServer, pid);
    this.notifyStatus(runningServer);
    this.startResourceMonitoring(server.id, pid);

    // Launch Zebra P2P UDP Hole-Punching Host Engine for adopted server
    const room = runningServer.roomCode || runningServer.name;
    const port = runningServer.port || 25565;
    if (room && !this.p2pEngines.has(server.id)) {
      try {
        const effectiveStunPort = (this.appSettings?.stunPort && this.appSettings.stunPort !== 19302) ? this.appSettings.stunPort : 3478;
        const p2pEngine = new P2PHostEngine(
          this.appSettings?.signalingHost || '163.245.213.207',
          this.appSettings?.signalingPort || 9090,
          effectiveStunPort,
          this.appSettings?.signalingHost || '163.245.213.207'
        );
        this.p2pEngines.set(server.id, p2pEngine);
        if (runningServer.e4mcDomain) {
          p2pEngine.setE4mcDomain(runningServer.e4mcDomain);
        }
        p2pEngine.setOnNetworkRecovered(() => {
          const freshRefIp = p2pEngine.getReflexiveIp();
          const freshHostTarget = freshRefIp || (runningServer.directIp ? runningServer.directIp.split(':')[0] : '') || runningServer.e4mcDomain || '';
          this.broadcastRoom(room, freshHostTarget, 'online', port, runningServer.e4mcDomain, p2pEngine.getReflexivePort() || undefined);
          if (runningServer.enableUpnp && this.upnpManager) {
            this.upnpManager.openPort(port).catch(() => {});
          }
        });
        p2pEngine.start(room, port, (msg) => this.log(msg, server.id)).then(() => {
          const refIp = p2pEngine.getReflexiveIp();
          const hostTarget = refIp || (runningServer.directIp ? runningServer.directIp.split(':')[0] : '') || runningServer.e4mcDomain || '';
          this.broadcastRoom(room, hostTarget, 'online', port, runningServer.e4mcDomain, p2pEngine.getReflexivePort() || undefined);
        });
        this.log(`[Zebra Network] P2P network ready for adopted room [${room}].`, server.id);
      } catch (err: any) {
        console.warn('[Zebra P2P] Failed to adopt P2P Host Engine:', err.message);
      }
    }
  }

  public async reconnectRunningServers(servers: ServerInstance[]): Promise<void> {
    for (const server of servers) {
      if (this.sessions.has(server.id)) continue;
      const pid = this.findRunningProcessForServer(server.path);
      if (pid) {
        this.log(`[Zebra] Reconnected to running background server (PID ${pid}).`, server.id);
        this.adoptRunningProcess(server, pid);
      }
    }
  }

  public async checkRoomConflict(roomCode?: string, serverId?: string): Promise<boolean> {
    if (!roomCode) return false;
    const cleanRoom = roomCode.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!cleanRoom) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`https://dweet.cc/get/latest/dweet/for/zebra-${cleanRoom}`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) return false;
      const data: any = await res.json();
      if (data && data.this === 'succeeded' && Array.isArray(data.with) && data.with.length > 0) {
        const latest = data.with[0];
        const content = latest.content || {};
        if (content.status === 'online') {
          const ageMs = Date.now() - new Date(latest.created).getTime();
          if (ageMs < 3 * 60 * 1000) {
            const myHostId = this.getHostId();
            if (content.hostId && myHostId && content.hostId !== myHostId) {
              return true;
            }
            if (content.serverId && serverId && content.serverId !== serverId && (!content.hostId || content.hostId === myHostId)) {
              return true;
            }
          }
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  /**
   * Starts running a Minecraft server instance (supports multiple instances concurrently)
   */
  public async start(server: ServerInstance): Promise<ServerInstance> {
    // If this server is already starting or running, return it
    const existing = this.sessions.get(server.id);
    if (existing && (existing.server.status === 'online' || existing.server.status === 'starting')) {
      return existing.server;
    }

    // Check if a background Java process is already alive for this server
    const runningPid = this.findRunningProcessForServer(server.path);
    if (runningPid) {
      this.log(`[Zebra] Server is already running in background (PID ${runningPid}). Reconnected to live instance.`, server.id);
      this.adoptRunningProcess(server, runningPid);
      return this.sessions.get(server.id)!.server;
    }

    // Collision guard: Ensure room code is not actively occupied by another server
    if (server.roomCode) {
      const hasConflict = await this.checkRoomConflict(server.roomCode, server.id);
      if (hasConflict) {
        this.log(`[Network] Conflict detected: Room code '${server.roomCode}' is already being hosted by another active server.`, server.id);
        throw new Error(`Room code '${server.roomCode}' is already in use by another active server online. Please choose a different room code in the Config tab before starting.`);
      }
    }

    // Immediately mark as starting and notify UI (zero latency response)
    const runningServer: ServerInstance = {
      ...server,
      enableE4mc: server.enableE4mc ?? true,
      enableUpnp: server.enableUpnp ?? true,
      status: 'starting',
      activePlayers: [],
      cpuPercent: 0,
      memoryUsedMb: 0,
    };
    this.sessions.set(server.id, {
      server: runningServer,
      process: null as any,
    });
    this.notifyStatus(runningServer);

    // Launch the preparation and Java server process asynchronously without blocking the Electron event loop
    setImmediate(() => {
      this.launchServerProcess(runningServer).catch((err) => {
        this.log(`[Error] Failed to start server: ${err?.message || err}`, server.id);
        this.cleanupSession(server.id);
      });
    });

    return runningServer;
  }

  private async launchServerProcess(runningServer: ServerInstance): Promise<void> {
    const serverId = runningServer.id;
    const workDir = runningServer.path;
    const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

    // Abort if session was stopped or cleared before launch began
    if (!this.sessions.has(serverId) || this.sessions.get(serverId)?.server.status === 'stopping') {
      return;
    }

    // 0. Clean up any zombie or lingering Java process from a previous crashed/hung run
    const activePid = this.findRunningProcessForServer(workDir);
    if (activePid) {
      this.log(`[Prep] Terminating lingering background Java process (PID ${activePid})...`, serverId);
      if (process.platform === 'win32') {
        try { execSync(`taskkill /F /T /PID ${activePid}`, { stdio: 'ignore' }); } catch {}
      } else {
        try { process.kill(activePid, 'SIGKILL'); } catch {}
      }
      await new Promise((r) => setTimeout(r, 600));
    }

    // Clean stale world session.lock if left over
    const sessionLock = path.join(workDir, 'world', 'session.lock');
    if (fs.existsSync(sessionLock)) {
      try {
        fs.unlinkSync(sessionLock);
        this.log('[Prep] Cleaned up stale world session.lock.', serverId);
      } catch (lockErr) {
        // If locked by a zombie java process on Windows, terminate it to release lock
        if (process.platform === 'win32') {
          try {
            const escapedDir = workDir.replace(/\\/g, '\\\\');
            execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'java' -and $_.CommandLine -like '*${escapedDir}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: 'ignore' });
            await new Promise((r) => setTimeout(r, 600));
            if (fs.existsSync(sessionLock)) {
              fs.unlinkSync(sessionLock);
            }
            this.log('[Prep] Released zombie process lock on world session.', serverId);
          } catch {}
        }
      }
    }

    await yieldToLoop();

    // 1. Auto port jump if desired port is already occupied
    const desiredPort = runningServer.port || 25565;
    const availablePort = await this.findAvailablePort(desiredPort);
    if (availablePort !== desiredPort) {
      this.log(`[Network] Port ${desiredPort} is in use. Auto-jumping to port ${availablePort}.`, serverId);
      runningServer.port = availablePort;
      this.notifyStatus(runningServer);
    }

    await yieldToLoop();

    // 2. Auto EULA
    fs.writeFileSync(path.join(workDir, 'eula.txt'), 'eula=true\n');

    // 3. Write server.properties
    this.writeServerProperties(workDir, runningServer);

    await yieldToLoop();

    // 4. Handle Singleplayer World Source Linking (if imported)
    const targetWorldDir = path.join(workDir, 'world');
    if (runningServer.worldSourcePath && fs.existsSync(runningServer.worldSourcePath)) {
      if (!fs.existsSync(targetWorldDir)) {
        this.prepareWorldSymlink(runningServer.worldSourcePath, targetWorldDir);
      }
      const corruptLoop = path.join(targetWorldDir, 'world');
      if (fs.existsSync(corruptLoop)) {
        try { fs.rmSync(corruptLoop, { recursive: true, force: true }); } catch {}
      }
      const hostUuid = '00000000-0000-0000-0000-000000000000';
      await NbtManager.syncPlayerToDedicated(targetWorldDir, hostUuid);
      this.syncHostWaypoints(runningServer);
    }

    await yieldToLoop();

    // 5. Mod handling & sanitization
    const serverMods = path.join(workDir, 'mods');
    if (!fs.existsSync(serverMods)) {
      fs.mkdirSync(serverMods, { recursive: true });
    }

    if (runningServer.loader === 'Fabric') {
      await ServerJarDownloader.ensureFabricApi(serverMods, runningServer.version, (msg) => this.log(`[Prep] ${msg}`, serverId));

      // Automatically deploy zebra-relay mod to server
      const zebraCandidates = [
        path.join(__dirname, '../assets/mods/zebra-relay-1.0.0.jar'),
        path.join(__dirname, '../../assets/mods/zebra-relay-1.0.0.jar'),
        path.join(process.cwd(), 'assets/mods/zebra-relay-1.0.0.jar'),
        path.join((process as any).resourcesPath || '', 'assets/mods/zebra-relay-1.0.0.jar'),
      ];
      const zebraSource = zebraCandidates.find((p) => fs.existsSync(p));
      const zebraTarget = path.join(serverMods, 'zebra-relay-1.0.0.jar');
      if (zebraSource) {
        try {
          fs.copyFileSync(zebraSource, zebraTarget);
          this.log(`[Prep] Injected high-performance Zebra Relay companion mod.`, serverId);
        } catch (err) {
          console.warn('Could not copy zebra-relay mod:', err);
        }
      }

      // Auto-configure zebra_relay.json (uses VPS host if configured in settings)
      try {
        const configuredVps = this.appSettings?.signalingHost?.trim() || '';
        const relayConfig = JSON.stringify({
          room: runningServer.roomCode || '',
          localProxyPort: 45565,
          vpsHost: configuredVps,
        }, null, 2);
        const configTargets = [
          path.join(workDir, 'config', 'zebra_relay.json'),
        ];
        if (runningServer.sourceInstance) {
          configTargets.push(path.join(runningServer.sourceInstance, 'config', 'zebra_relay.json'));
        }
        for (const target of configTargets) {
          const cfgDir = path.dirname(target);
          if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
          fs.writeFileSync(target, relayConfig, 'utf8');
        }
      } catch {}

      // Deploy e4mc tunnel mod by default to allow friends to connect through NAT/CGNAT
      if (runningServer.enableE4mc ?? true) {
        const e4mcCandidates = [
          path.join(__dirname, '../assets/mods/e4mc-fabric.jar'),
          path.join(__dirname, '../../assets/mods/e4mc-fabric.jar'),
          path.join(process.cwd(), 'assets/mods/e4mc-fabric.jar'),
          path.join((process as any).resourcesPath || '', 'assets/mods/e4mc-fabric.jar'),
        ];
        const e4mcSource = e4mcCandidates.find((p) => fs.existsSync(p));
        const e4mcTarget = path.join(serverMods, 'e4mc-fabric.jar');
        if (e4mcSource && !fs.existsSync(e4mcTarget)) {
          try {
            fs.copyFileSync(e4mcSource, e4mcTarget);
            this.log(`[Network] Injected e4mc global tunnel mod for zero-portforward friends connectivity.`, serverId);
          } catch (err) {
            console.warn('Could not copy e4mc mod:', err);
          }
        }

        // Krypton and e4mc both hook ServerLoginNetworkHandlerMixin and crash if both loaded.
        // Temporarily pause Krypton while e4mc is active; restored on server stop.
        try {
          const modFiles = fs.readdirSync(serverMods);
          for (const file of modFiles) {
            if (file.toLowerCase().includes('krypton') && file.endsWith('.jar')) {
              const oldP = path.join(serverMods, file);
              const newP = path.join(serverMods, `${file}.e4mc-disabled`);
              fs.renameSync(oldP, newP);
              this.log(`[Prep] Temporarily paused ${file} for e4mc tunnel compatibility.`, serverId);
            }
          }
        } catch {}
      } else {
        // e4mc is disabled: clean up e4mc-fabric.jar and restore Krypton
        try {
          const modFiles = fs.readdirSync(serverMods);
          for (const file of modFiles) {
            if (file.toLowerCase().includes('e4mc') && file.endsWith('.jar')) {
              try {
                fs.unlinkSync(path.join(serverMods, file));
              } catch {
                try {
                  fs.renameSync(path.join(serverMods, file), path.join(serverMods, `${file}.disabled`));
                } catch {}
              }
            }
          }
          for (const file of modFiles) {
            if (file.toLowerCase().includes('krypton') && (file.endsWith('.e4mc-disabled') || file.endsWith('.disabled'))) {
              const oldP = path.join(serverMods, file);
              const restoredName = file.replace(/\.(e4mc-disabled|disabled)$/, '');
              const newP = path.join(serverMods, restoredName);
              fs.renameSync(oldP, newP);
              this.log(`[Prep] Restored ${restoredName} optimization.`, serverId);
            }
          }
        } catch {}
      }
    }

    await yieldToLoop();

    ModFilter.sanitizeServerMods(serverMods, (msg) => this.log(msg, serverId));

    // Ensure unlimited NBT payload headroom is enabled in Packet Fixer for both server and host client
    this.ensurePacketFixerConfig(workDir, runningServer.sourceInstance);

    await yieldToLoop();

    // Ensure world datapacks are synced
    const worldDatapacks = path.join(targetWorldDir, 'datapacks');
    const syncPacksRecursively = (currentDir: string, depth = 0) => {
      if (depth > 6 || !fs.existsSync(currentDir)) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
            const destZip = path.join(worldDatapacks, entry.name);
            if (!fs.existsSync(destZip)) {
              try { fs.copyFileSync(fullPath, destZip); } catch {}
            }
          } else if (entry.isDirectory()) {
            if (fs.existsSync(path.join(fullPath, 'pack.mcmeta'))) {
              const destDir = path.join(worldDatapacks, entry.name);
              if (!fs.existsSync(destDir)) {
                fs.cpSync(fullPath, destDir, { recursive: true });
              }
            } else {
              syncPacksRecursively(fullPath, depth + 1);
            }
          }
        }
      } catch {}
    };

    if (fs.existsSync(path.join(workDir, 'datapacks'))) {
      if (!fs.existsSync(worldDatapacks)) fs.mkdirSync(worldDatapacks, { recursive: true });
      syncPacksRecursively(path.join(workDir, 'datapacks'));
    }
    if (runningServer.sourceInstance && fs.existsSync(path.join(runningServer.sourceInstance, 'datapacks'))) {
      if (!fs.existsSync(worldDatapacks)) fs.mkdirSync(worldDatapacks, { recursive: true });
      syncPacksRecursively(path.join(runningServer.sourceInstance, 'datapacks'));
    }

    await yieldToLoop();

    // Check again if server was cancelled during preparation
    if (!this.sessions.has(serverId) || this.sessions.get(serverId)?.server.status === 'stopping') {
      return;
    }

    // 6. Resolve server JAR
    const serverJar = await this.resolveServerJar(workDir, runningServer.version, runningServer.loader, runningServer.loaderVersion, serverId);

    await yieldToLoop();

    // 7. Build JVM args
    const jvmArgs = this.buildJvmArgs(runningServer);

    // 8. Start UPnP if enabled, and always detect public IP
    if (runningServer.enableUpnp) {
      this.upnpManager.openPort(runningServer.port).then((opened) => {
        if (opened) {
          this.log(`[Zebra Network] Router UPnP port ${runningServer.port} forwarded.`, serverId);
        } else {
          console.log(`[Zebra Network] Router UPnP declined or CGNAT.`, serverId);
        }
      }).catch((err) => {
        console.warn(`[Zebra Network] UPnP notice: ${err.message}`, serverId);
      });
    }

    this.upnpManager.getPublicIp().then((ip) => {
      if (ip) {
        const sess = this.sessions.get(serverId);
        if (sess) {
          sess.server.directIp = `${ip}:${runningServer.port}`;
          this.notifyStatus(sess.server);
          console.log(`[Zebra Network] Public IP: ${ip}:${runningServer.port}`);
          const room = sess.server.roomCode || sess.server.name;
          const p2p = this.p2pEngines.get(serverId);
          this.broadcastRoom(room, ip, 'online', runningServer.port, undefined, p2p?.getReflexivePort() || undefined);
        }
      }
    }).catch(console.warn);

    await yieldToLoop();

    // 9. Launch Java Process
    const args = [...jvmArgs, '-jar', serverJar, 'nogui'];
    const javaBin = await this.resolveJavaPath(runningServer.version, runningServer.customJavaPath, serverId);

    // Check again if cancelled before spawn
    if (!this.sessions.has(serverId) || this.sessions.get(serverId)?.server.status === 'stopping') {
      return;
    }

    this.log(`[Prep] Spawning Java server process...`, serverId);

    const proc = spawn(javaBin, args, {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const session = this.sessions.get(serverId);
    if (!session) {
      try { proc.kill(); } catch {}
      return;
    }
    session.process = proc;
    if (proc.pid) {
      this.writeSessionFile(runningServer, proc.pid);
    }

    // Immediate and ongoing telemetry monitoring
    this.startResourceMonitoring(serverId, proc.pid);

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleServerLog(serverId, line);
      }
    });

    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (
          line.includes('sun.misc.Unsafe') ||
          line.includes('terminally deprecated') ||
          line.includes('org.joml') ||
          line.includes('objectFieldOffset') ||
          line.includes('Please consider reporting') ||
          line.includes('will be removed in a future release') ||
          line.includes('A restricted method') ||
          line.includes('Use --enable-native-access') ||
          line.includes('All illegal access') ||
          line.startsWith('WARNING:')
        ) {
          continue;
        }
        this.log(`[STDERR] ${line}`, serverId);
      }
    });

    proc.on('close', (code) => {
      console.log(`[ServerRunner] Server ${serverId} exited with code ${code}`);
      this.cleanupSession(serverId);
    });
  }

  /**
   * Gracefully stops a specific server instance
   */
  public async stop(serverId?: string): Promise<void> {
    const targetId = serverId || this.sessions.keys().next().value;
    if (!targetId) return;

    const session = this.sessions.get(targetId);
    if (!session) return;

    session.server.status = 'stopping';
    this.notifyStatus(session.server);
    this.log('Stopping server gracefully...', targetId);

    if (session.stopTimer) clearTimeout(session.stopTimer);
    session.stopTimer = setTimeout(() => {
      const active = this.sessions.get(targetId);
      if (active && active.process && active.process.pid) {
        console.warn(`[Runner] Graceful stop timed out for ${targetId}; force terminating PID ${active.process.pid}...`);
        this.kill(targetId);
      }
    }, 6000);

    if (session.process && session.process.stdin) {
      try {
        session.process.stdin.write('stop\n');
      } catch {
        if (session.stopTimer) clearTimeout(session.stopTimer);
        this.kill(targetId);
      }
    } else if (session.process && session.process.pid) {
      if (session.stopTimer) clearTimeout(session.stopTimer);
      this.kill(targetId);
    } else {
      if (session.stopTimer) clearTimeout(session.stopTimer);
      await this.cleanupSession(targetId);
    }
  }

  /**
   * Forcefully kills a specific server process
   */
  public kill(serverId?: string): void {
    const targetId = serverId || this.sessions.keys().next().value;
    if (!targetId) return;

    const session = this.sessions.get(targetId);
    if (session) {
      const pid = session.process?.pid;
      if (pid) {
        if (process.platform === 'win32') {
          try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
          } catch {}
        } else {
          try { exec(`pkill -9 -P ${pid}`); } catch {}
          try { process.kill(pid, 'SIGKILL'); } catch {}
        }
      }
      this.clearSessionFile(session.server.path);
      if (session.server.path) {
        try {
          const lockFile = path.join(session.server.path, 'world', 'session.lock');
          if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
        } catch {}
      }
      this.cleanupSession(targetId);
    }
  }

  /**
   * Forcefully kills all running Minecraft server instances across the machine
   */
  public async killAllRunningServers(): Promise<number> {
    let count = this.sessions.size;

    for (const [id, session] of this.sessions.entries()) {
      if (session.monitorInterval) clearInterval(session.monitorInterval);
      if (session.heartbeatInterval) clearInterval(session.heartbeatInterval);
      if (session.process && session.process.pid) {
        if (process.platform === 'win32') {
          try { exec(`taskkill /F /T /PID ${session.process.pid}`); } catch {}
        } else {
          try { exec(`pkill -9 -P ${session.process.pid}`); } catch {}
          try { session.process.kill('SIGKILL'); } catch {}
        }
      }
      session.server.status = 'offline';
      session.server.activePlayers = [];
      session.server.cpuPercent = 0;
      session.server.memoryUsedMb = 0;
      this.notifyStatus(session.server);
    }
    this.sessions.clear();

    if (process.platform === 'win32') {
      try {
        const psCmd = `
          $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            ($_.Name -like 'java*.exe') -and (
              ($_.CommandLine -like '*server.jar*') -or
              ($_.CommandLine -like '*Zebra*servers*') -or
              ($_.CommandLine -like '*.zebra*servers*')
            )
          }
          $total = $procs.Count
          $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
          $total
        `;
        const out = await new Promise<string>((resolve) => {
          exec(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 6000 }, (_err, stdout) => {
            resolve(stdout || '');
          });
        });
        const killed = parseInt(out.trim()) || 0;
        count = Math.max(count, killed);
      } catch (e) {
        console.warn('[ServerRunner] Error killing all servers:', e);
      }
    } else {
      // Linux & macOS orphan process cleanup
      try {
        const { execSync } = require('child_process');
        execSync(`pkill -9 -f "server.jar" 2>/dev/null || true`);
        execSync(`pkill -9 -f "\.zebra/servers" 2>/dev/null || true`);
      } catch (e) {
        console.warn('[ServerRunner] Posix server termination note:', e);
      }
    }

    return count;
  }

  /**
   * Sends command or chat message to a specific running server
   */
  public sendCommand(serverId: string, input: string): void {
    const session = this.sessions.get(serverId);
    if (!session || !session.process || !session.process.stdin) return;

    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/')) {
      const cmd = trimmed.substring(1);
      session.process.stdin.write(`${cmd}\n`);
      this.log(`> /${cmd}`, serverId);
    } else {
      session.process.stdin.write(`tellraw @a {"text":"[Host] ${trimmed}","color":"aqua"}\n`);
      this.log(`[Host Chat]: ${trimmed}`, serverId);
    }
  }

  private handleServerLog(serverId: string, line: string) {
    if (line.startsWith('Unpacking ')) return;

    this.log(line, serverId);

    const session = this.sessions.get(serverId);
    if (!session) return;

    // Detect server ready
    if (line.includes('Done (') && line.includes(')! For help, type "help"')) {
      session.server.status = 'online';
      this.notifyStatus(session.server);
      const port = session.server.port || 25565;
      const room = session.server.roomCode || session.server.name;

      // Launch Zebra P2P UDP Hole-Punching Host Engine
      if (room) {
        try {
          const effectiveStunPort = (this.appSettings?.stunPort && this.appSettings.stunPort !== 19302) ? this.appSettings.stunPort : 3478;
          const p2pEngine = new P2PHostEngine(
            this.appSettings?.signalingHost || '163.245.213.207',
            this.appSettings?.signalingPort || 9090,
            effectiveStunPort,
            this.appSettings?.signalingHost || '163.245.213.207'
          );
          this.p2pEngines.set(serverId, p2pEngine);
          if (session.server.e4mcDomain) {
            p2pEngine.setE4mcDomain(session.server.e4mcDomain);
          }
          p2pEngine.setOnNetworkRecovered(() => {
            const freshRefIp = p2pEngine.getReflexiveIp();
            const freshHostTarget = freshRefIp || (session.server.directIp ? session.server.directIp.split(':')[0] : '') || session.server.e4mcDomain || '';
            this.broadcastRoom(room, freshHostTarget, 'online', port, session.server.e4mcDomain, p2pEngine.getReflexivePort() || undefined);
            if (session.server.enableUpnp && this.upnpManager) {
              this.upnpManager.openPort(port).catch(() => {});
            }
          });
          p2pEngine.start(room, port, (msg) => this.log(msg, serverId)).then(() => {
            const refIp = p2pEngine.getReflexiveIp();
            const hostTarget = refIp || (session.server.directIp ? session.server.directIp.split(':')[0] : '') || session.server.e4mcDomain || '';
            this.broadcastRoom(room, hostTarget, 'online', port, session.server.e4mcDomain, p2pEngine.getReflexivePort() || undefined);
            if ((session.server.enableUpnp ?? true) && this.upnpManager) {
              this.upnpManager.openPort(port).then((opened) => {
                if (opened) {
                  this.log(`[Network] UPnP successfully mapped game port ${port} on router. Direct TCP link active!`, serverId);
                }
              }).catch(() => {});
            }
          });
          this.log(`[Zebra Network] P2P network ready for room [${room}].`, serverId);
        } catch (err: any) {
          console.warn('[Zebra P2P] Failed to start P2P Host Engine:', err.message);
        }
      }

      const p2p = this.p2pEngines.get(serverId);
      const refIp = p2p?.getReflexiveIp();
      const hostTarget = refIp || (session.server.directIp ? session.server.directIp.split(':')[0] : '') || session.server.e4mcDomain || '';
      this.broadcastRoom(room, hostTarget, 'online', port, session.server.e4mcDomain, p2p?.getReflexivePort() || undefined);
      this.syncHostWaypoints(session.server, session.server.e4mcDomain);
    }

    // Detect e4mc domain link
    // Only capture the real assigned domain, ignoring e4mc's internal HTTP endpoints (natives.e4mc.link, broker.e4mc.link, etc.)
    const IGNORED_E4MC_DOMAINS = new Set([
      'e4mc.link',
      'natives.e4mc.link',
      'broker.e4mc.link',
      'api.e4mc.link',
      'auth.e4mc.link',
    ]);

    const domainAssignedMatch = line.match(/Domain assigned:\s*([a-zA-Z0-9_.-]+\.e4mc\.link(?::\d+)?)/i);
    if (domainAssignedMatch && domainAssignedMatch[1]) {
      const domain = domainAssignedMatch[1].replace(/[.,;:!]+$/, '').trim().toLowerCase();
      if (!IGNORED_E4MC_DOMAINS.has(domain)) {
        session.server.e4mcDomain = domain;
        this.notifyStatus(session.server);
        const p2p = this.p2pEngines.get(serverId);
        if (p2p) p2p.setE4mcDomain(domain);
        const room = session.server.roomCode || session.server.name;
        this.log(`[Zebra Network] Active Room: [${room}] -> e4mc fallback ready (${domain})`, serverId);
        const targetIp = p2p?.getReflexiveIp() || (session.server.directIp ? session.server.directIp.split(':')[0] : '') || domain;
        this.broadcastRoom(room, targetIp, 'online', session.server.port || 25565, domain, p2p?.getReflexivePort() || undefined);
        this.syncHostWaypoints(session.server, domain);
      }
    } else if (!session.server.e4mcDomain && !line.includes('http://') && !line.includes('https://') && !line.includes('req:') && !line.includes('resp:')) {
      const fallbackMatch = line.match(/(?:^|\s)([a-zA-Z0-9_.-]+\.e4mc\.link(?::\d+)?)(?:\s|$|[.,;:!])/i);
      if (fallbackMatch && fallbackMatch[1]) {
        const domain = fallbackMatch[1].replace(/[.,;:!]+$/, '').trim().toLowerCase();
        if (!IGNORED_E4MC_DOMAINS.has(domain)) {
          session.server.e4mcDomain = domain;
          this.notifyStatus(session.server);
          const p2p = this.p2pEngines.get(serverId);
          if (p2p) p2p.setE4mcDomain(domain);
          const room = session.server.roomCode || session.server.name;
          this.log(`[Zebra Network] Active Room: [${room}] -> e4mc fallback ready (${domain})`, serverId);
          const targetIp = p2p?.getReflexiveIp() || (session.server.directIp ? session.server.directIp.split(':')[0] : '') || domain;
          this.broadcastRoom(room, targetIp, 'online', session.server.port || 25565, domain, p2p?.getReflexivePort() || undefined);
          this.syncHostWaypoints(session.server, domain);
        }
      }
    }

    // Detect Player Join
    const joinMatch = line.match(/:\s+([a-zA-Z0-9_]+)\s+joined the game/);
    if (joinMatch && joinMatch[1]) {
      const player = joinMatch[1];
      if (!session.server.activePlayers.includes(player)) {
        session.server.activePlayers.push(player);
        this.notifyStatus(session.server);
      }
    }

    // Detect Player Leave
    const leaveMatch = line.match(/:\s+([a-zA-Z0-9_]+)\s+left the game/);
    if (leaveMatch && leaveMatch[1]) {
      const player = leaveMatch[1];
      session.server.activePlayers = session.server.activePlayers.filter((p) => p !== player);
      this.notifyStatus(session.server);
    }
  }

  private startResourceMonitoring(serverId: string, pid?: number) {
    if (!pid) return;

    setTimeout(async () => {
      const session = this.sessions.get(serverId);
      if (!session || !session.process) return;
      try {
        const stats = await pidusage(pid);
        session.server.cpuPercent = Math.round(stats.cpu);
        session.server.memoryUsedMb = Math.round(stats.memory / (1024 * 1024));
        this.notifyStatus(session.server);
      } catch {}
    }, 300);

    const interval = setInterval(async () => {
      const session = this.sessions.get(serverId);
      if (!session || !session.process) {
        clearInterval(interval);
        return;
      }

      try {
        const stats = await pidusage(pid);
        session.server.cpuPercent = Math.round(stats.cpu);
        session.server.memoryUsedMb = Math.round(stats.memory / (1024 * 1024));
        this.notifyStatus(session.server);
      } catch {
        // process likely exited
      }
    }, 1000);

    const session = this.sessions.get(serverId);
    if (session) {
      session.monitorInterval = interval;

      // Periodic heartbeat to keep room alive in VPS registry
      session.heartbeatInterval = setInterval(() => {
        const sess = this.sessions.get(serverId);
        if (!sess || !sess.process) {
          if (session.heartbeatInterval) clearInterval(session.heartbeatInterval);
          return;
        }
        if (sess.server.status === 'online') {
          const room = sess.server.roomCode || sess.server.name;
          const p2p = this.p2pEngines.get(serverId);
          const refIp = p2p?.getReflexiveIp();
          const hostTarget = refIp || (sess.server.directIp ? sess.server.directIp.split(':')[0] : '') || sess.server.e4mcDomain || '';
          const port = sess.server.port || 25565;
          this.broadcastRoom(room, hostTarget, 'online', port, sess.server.e4mcDomain, p2p?.getReflexivePort() || undefined);
        }
      }, 15000);
    }
  }

  private log(message: string, serverId?: string) {
    if (this.onLogCallback) {
      this.onLogCallback(message, serverId);
    }
  }

  private notifyStatus(server: ServerInstance) {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback({ ...server });
    }
  }

  private async cleanupSession(serverId: string) {
    const session = this.sessions.get(serverId);
    if (!session) return;

    if (session.monitorInterval) {
      clearInterval(session.monitorInterval);
      session.monitorInterval = undefined;
    }
    if (session.heartbeatInterval) {
      clearInterval(session.heartbeatInterval);
      session.heartbeatInterval = undefined;
    }
    if (session.stopTimer) {
      clearTimeout(session.stopTimer);
      session.stopTimer = undefined;
    }

    await this.upnpManager.closePort(session.server.port);

    if (session.server.worldSourcePath && fs.existsSync(session.server.worldSourcePath)) {
      const hostUuid = '00000000-0000-0000-0000-000000000000';
      await NbtManager.syncPlayerToSingleplayer(session.server.worldSourcePath, hostUuid);
    }

    // Restore any temporarily disabled mods on session close
    if (session.server.path) {
      const serverMods = path.join(session.server.path, 'mods');
      if (fs.existsSync(serverMods)) {
        try {
          const modFiles = fs.readdirSync(serverMods);
          // Remove injected e4mc jar so it never collides with Krypton when server is offline
          for (const file of modFiles) {
            if (file.toLowerCase().includes('e4mc') && file.endsWith('.jar')) {
              try { fs.unlinkSync(path.join(serverMods, file)); } catch {}
            }
          }
          for (const file of modFiles) {
            if (file.toLowerCase().includes('krypton') && (file.endsWith('.e4mc-disabled') || file.endsWith('.disabled'))) {
              const oldP = path.join(serverMods, file);
              const restoredName = file.replace(/\.(e4mc-disabled|disabled)$/, '');
              fs.renameSync(oldP, path.join(serverMods, restoredName));
            }
          }
        } catch {}
      }
    }

    if (session.server.roomCode || session.server.name) {
      this.broadcastRoom(session.server.roomCode || session.server.name, '', 'offline');
    }

    const p2pEngine = this.p2pEngines.get(serverId);
    if (p2pEngine) {
      try { p2pEngine.stop(); } catch {}
      this.p2pEngines.delete(serverId);
    }

    session.server.status = 'offline';
    session.server.activePlayers = [];
    session.server.cpuPercent = 0;
    session.server.memoryUsedMb = 0;
    this.notifyStatus(session.server);

    this.clearSessionFile(session.server.path);
    this.sessions.delete(serverId);
  }

  private broadcastRoom(roomCode?: string, domain?: string, status: 'online' | 'offline' = 'online', port?: number, e4mcDomain?: string, udpPort?: number) {
    if (!roomCode) return;
    const cleanRoom = roomCode.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!cleanRoom) return;

    let targetIp = domain || '';
    let targetPort = port || 25565;
    if (targetIp.includes(':')) {
      const parts = targetIp.split(':');
      targetIp = parts[0];
      targetPort = parseInt(parts[1], 10) || targetPort;
    }

    // Never broadcast 'localhost' or '127.0.0.1' to external matchmaker;
    // use STUN reflexive IP if discovered, or leave empty so VPS resolves caller's real public WAN IP.
    if (targetIp === 'localhost' || targetIp === '127.0.0.1') {
      targetIp = '';
      for (const p2p of this.p2pEngines.values()) {
        const refIp = p2p.getReflexiveIp();
        if (refIp && refIp !== 'localhost' && refIp !== '127.0.0.1') {
          targetIp = refIp;
          break;
        }
      }
    }

    const vpsEndpoint = this.appSettings?.signalingHost
      ? `${this.appSettings.signalingHost}:${this.appSettings.signalingPort || 9090}`
      : undefined;

    const payloadObj: any = {
      ip: targetIp || e4mcDomain || '',
      port: targetPort,
      status: status,
      ...(udpPort ? { udpPort } : {}),
      ...(e4mcDomain ? { e4mc: e4mcDomain } : {}),
      ...(vpsEndpoint ? { vps: vpsEndpoint } : {}),
    };
    if (e4mcDomain && !payloadObj.ip) payloadObj.ip = e4mcDomain;

    const payload = JSON.stringify(payloadObj);

    console.log(`[Zebra Relay] Broadcasting room [${cleanRoom}] -> ${targetIp || e4mcDomain || '(auto-public-ip)'}:${targetPort} (UDP:${udpPort || '-'}) (${status})${vpsEndpoint ? ' [VPS: ' + vpsEndpoint + ']' : ''}`);

    // Broadcast room endpoint to public broker (dweet)
    const query = new URLSearchParams({
      ip: targetIp || e4mcDomain || '',
      port: targetPort.toString(),
      status: status,
      ...(this.hostId ? { hostId: this.hostId } : {}),
      ...(e4mcDomain ? { e4mc: e4mcDomain } : {}),
      ...(udpPort ? { udpPort: udpPort.toString() } : {}),
      ...(vpsEndpoint ? { vps: vpsEndpoint } : {}),
    });
    fetch(`https://dweet.cc/dweet/for/zebra-${cleanRoom}?${query.toString()}`).catch(() => {});

    // Broadcast room endpoint to instant ntfy.sh pubsub topic
    fetch(`https://ntfy.sh/zebra-${cleanRoom}`, {
      method: 'POST',
      headers: { 'Title': 'Room Discovery' },
      body: payload,
    }).catch(() => {});

    // Broadcast room endpoint to custom VPS matchmaker
    if (this.appSettings?.signalingHost) {
      const vpsPort = this.appSettings.signalingPort || 9090;
      fetch(`http://${this.appSettings.signalingHost}:${vpsPort}/api/room/${cleanRoom}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});
    }
  }

  private syncHostWaypoints(server: ServerInstance, activeDomain?: string) {
    try {
      const candidates = [
        server.sourceInstance ? path.join(server.sourceInstance, 'xaero') : null,
        server.path ? path.join(server.path, 'xaero') : null,
      ].filter(Boolean) as string[];

      // Also check standard PrismLauncher / CurseForge instance directory if worldSourcePath is given
      if (server.worldSourcePath) {
        const savesDir = path.dirname(server.worldSourcePath);
        const mcDir = path.dirname(savesDir);
        const autoXaero = path.join(mcDir, 'xaero');
        if (fs.existsSync(autoXaero) && !candidates.includes(autoXaero)) {
          candidates.push(autoXaero);
        }
      }

      const worldName = server.worldSourcePath ? path.basename(server.worldSourcePath) : '';
      const serverPort = server.port || 25565;
      const targetSubdirs = [
        'Multiplayer_127.0.0.1',
        'Multiplayer_localhost',
        `Multiplayer_127.0.0.1$${serverPort}`,
        `Multiplayer_localhost$${serverPort}`,
        'Multiplayer_127.0.0.1$45565',
        'Multiplayer_127.0.0.1$25565',
        'Multiplayer_localhost$25565',
      ];
      if (server.directIp) {
        const ipOnly = server.directIp.split(':')[0];
        targetSubdirs.push(`Multiplayer_${ipOnly}`);
        targetSubdirs.push(`Multiplayer_${server.directIp.replace(':', '$')}`);
      }
      if (activeDomain) {
        targetSubdirs.push(`Multiplayer_${activeDomain}`);
      }

      for (const xaeroRoot of candidates) {
        if (!fs.existsSync(xaeroRoot)) continue;

        // --- 1. MINIMAP WAYPOINT SYNC ---
        const minimapDir = path.join(xaeroRoot, 'minimap');
        if (fs.existsSync(minimapDir)) {
          let srcWorldFolder: string | null = null;
          if (worldName && fs.existsSync(path.join(minimapDir, worldName))) {
            srcWorldFolder = path.join(minimapDir, worldName);
          } else {
            const entries = fs.readdirSync(minimapDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory() && !entry.name.startsWith('Multiplayer_') && entry.name !== 'backup') {
                srcWorldFolder = path.join(minimapDir, entry.name);
                break;
              }
            }
          }

          if (srcWorldFolder && fs.existsSync(srcWorldFolder)) {
            const dims = ['dim%0', 'dim%-1', 'dim%1'];
            for (const dim of dims) {
              const srcDimDir = path.join(srcWorldFolder, dim);
              if (!fs.existsSync(srcDimDir)) continue;

              const srcWaypointLines: string[] = [];
              const srcFiles = fs.readdirSync(srcDimDir).filter((f) => f === 'waypoints.txt' || f.startsWith('mw$'));
              for (const sf of srcFiles) {
                try {
                  const content = fs.readFileSync(path.join(srcDimDir, sf), 'utf8');
                  for (const line of content.split(/\r?\n/)) {
                    if (line.startsWith('waypoint:')) {
                      srcWaypointLines.push(line);
                    }
                  }
                } catch {}
              }

              if (srcWaypointLines.length === 0) continue;

              // Write server_waypoints.txt for server-side waypoint broadcasting to guests (Xaero's Minimap server mod)
              try {
                const header = '#\n#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination\n#\n';
                const serverWpContent = header + srcWaypointLines.join('\n') + '\n';
                if (server.path) {
                  fs.writeFileSync(path.join(server.path, 'server_waypoints.txt'), serverWpContent, 'utf8');
                  const worldDir = path.join(server.path, 'world');
                  if (fs.existsSync(worldDir)) {
                    fs.writeFileSync(path.join(worldDir, 'server_waypoints.txt'), serverWpContent, 'utf8');
                  }
                }
              } catch {}

              for (const targetName of targetSubdirs) {
                const targetDimDir = path.join(minimapDir, targetName, dim);
                if (!fs.existsSync(targetDimDir)) {
                  fs.mkdirSync(targetDimDir, { recursive: true });
                }

                const targetFiles = fs.readdirSync(targetDimDir).filter((f) => f === 'waypoints.txt' || f.startsWith('mw$'));
                if (!targetFiles.includes('waypoints.txt')) {
                  targetFiles.push('waypoints.txt');
                }

                const header = '#\n#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination\n#\n';

                for (const tf of targetFiles) {
                  const targetFilePath = path.join(targetDimDir, tf);
                  const waypointMap = new Map<string, string>();

                  if (fs.existsSync(targetFilePath)) {
                    try {
                      const existing = fs.readFileSync(targetFilePath, 'utf8').split(/\r?\n/);
                      for (const el of existing) {
                        if (el.startsWith('waypoint:')) {
                          const parts = el.split(':');
                          if (parts[1]) waypointMap.set(parts[1], el);
                        }
                      }
                    } catch {}
                  }

                  for (const sl of srcWaypointLines) {
                    const parts = sl.split(':');
                    if (parts[1] && !waypointMap.has(parts[1])) {
                      waypointMap.set(parts[1], sl);
                    }
                  }

                  try {
                    const combined = header + Array.from(waypointMap.values()).join('\n') + '\n';
                    fs.writeFileSync(targetFilePath, combined, 'utf8');
                  } catch {}
                }
              }
            }
          }
        }

        // --- 2. WORLD MAP REGION CACHE SYNC ---
        const worldMapDir = path.join(xaeroRoot, 'world-map');
        if (fs.existsSync(worldMapDir)) {
          let srcMapFolder: string | null = null;
          if (worldName && fs.existsSync(path.join(worldMapDir, worldName))) {
            srcMapFolder = path.join(worldMapDir, worldName);
          } else {
            const entries = fs.readdirSync(worldMapDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory() && !entry.name.startsWith('Multiplayer_')) {
                srcMapFolder = path.join(worldMapDir, entry.name);
                break;
              }
            }
          }

          if (srcMapFolder && fs.existsSync(srcMapFolder)) {
            const srcNullDir = path.join(srcMapFolder, 'null');
            if (fs.existsSync(srcNullDir)) {
              for (const targetName of targetSubdirs) {
                const targetNullDir = path.join(worldMapDir, targetName, 'null');
                if (!fs.existsSync(targetNullDir)) {
                  fs.mkdirSync(targetNullDir, { recursive: true });
                }

                const targetDests = [targetNullDir];
                try {
                  const targetSubEntries = fs.readdirSync(targetNullDir, { withFileTypes: true });
                  for (const tse of targetSubEntries) {
                    if (tse.isDirectory() && tse.name.startsWith('mw$')) {
                      targetDests.push(path.join(targetNullDir, tse.name));
                    }
                  }
                } catch {}

                const cacheSubdirs = ['cache_1', 'cache', 'caves'];
                for (const cs of cacheSubdirs) {
                  const srcCache = path.join(srcNullDir, cs);
                  if (!fs.existsSync(srcCache)) continue;

                  try {
                    const tiles = fs.readdirSync(srcCache).filter((f) => f.endsWith('.xwmc') || f.endsWith('.zip'));
                    for (const destRoot of targetDests) {
                      const destCache = path.join(destRoot, cs);
                      if (!fs.existsSync(destCache)) fs.mkdirSync(destCache, { recursive: true });
                      for (const tile of tiles) {
                        const srcTile = path.join(srcCache, tile);
                        const destTile = path.join(destCache, tile);
                        if (!fs.existsSync(destTile)) {
                          fs.copyFileSync(srcTile, destTile);
                        }
                      }
                    }
                  } catch {}
                }
              }
            }
          }
        }
      }
      this.log(`[Waypoints] Synced singleplayer waypoints & map tiles to multiplayer profiles.`, server.id);
    } catch (e) {
      console.warn('[ServerRunner] Host waypoint sync note:', e);
    }
  }

  private buildJvmArgs(config: ServerConfig): string[] {
    const args: string[] = [];

    // Modern Java flags
    args.push('--enable-native-access=ALL-UNNAMED');
    args.push('-Dsun.misc.unsafe.warn=false');
    args.push('--add-opens=java.base/java.lang=ALL-UNNAMED');

    if (config.ramMode === 'custom') {
      args.push(`-Xms${config.minRamGb}G`, `-Xmx${config.maxRamGb}G`);
    } else {
      const totalSysMemGb = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
      const targetMax = config.maxRamGb ? config.maxRamGb : Math.max(4, Math.min(Math.floor(totalSysMemGb * 0.5), 10));
      args.push('-Xms2G', `-Xmx${targetMax}G`);
    }

    const gcEngine = config.advancedEngineSettings?.jvmGcEngine || 'G1GC';
    if (gcEngine === 'ZGC') {
      args.push('-XX:+UseZGC', '-XX:+ZGenerational', '-XX:+UnlockExperimentalVMOptions');
    } else if (gcEngine === 'Shenandoah') {
      args.push('-XX:+UseShenandoahGC', '-XX:+UnlockExperimentalVMOptions');
    } else {
      args.push(
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+AlwaysPreTouch',
        '-XX:G1NewSizePercent=30',
        '-XX:G1MaxNewSizePercent=40',
        '-XX:G1ReservePercent=20',
        '-XX:G1HeapWastePercent=5',
        '-XX:G1MixedGCCountTarget=4',
        '-XX:InitiatingHeapOccupancyPercent=15',
        '-XX:G1MixedGCLiveThresholdPercent=90',
        '-XX:G1RSetUpdatingPauseTimePercent=5',
        '-XX:SurvivorRatio=32',
        '-XX:+PerfDisableSharedMem',
        '-XX:MaxTenuringThreshold=1'
      );
    }

    if (config.advancedEngineSettings?.fastRedstone) {
      args.push('-Dalternate-current.enabled=true');
    }
    if (config.advancedEngineSettings?.asyncPathfinding) {
      args.push('-Dpaper.async-chunks=true');
    }

    return args;
  }

  private writeServerProperties(workDir: string, config: ServerConfig) {
    const propsPath = path.join(workDir, 'server.properties');
    const compression = config.advancedEngineSettings?.networkCompression !== undefined
      ? config.advancedEngineSettings.networkCompression
      : 512;
    const keepSpawnLoaded = config.advancedEngineSettings?.unloadSpawnChunks ? 'false' : 'true';

    // Parse existing properties if file exists to preserve user edits & mod additions
    const existingProps = new Map<string, string>();

    if (fs.existsSync(propsPath)) {
      try {
        const content = fs.readFileSync(propsPath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
            continue;
          }
          const eqIdx = line.indexOf('=');
          if (eqIdx !== -1) {
            const key = line.substring(0, eqIdx).trim();
            const val = line.substring(eqIdx + 1).trim();
            existingProps.set(key, val);
          }
        }
      } catch (e) {
        console.warn('[Runner] Could not read existing server.properties:', e);
      }
    }

    // If user modified settings directly in server.properties, respect them and sync to in-memory config
    if (existingProps.has('view-distance')) {
      const parsed = parseInt(existingProps.get('view-distance')!, 10);
      if (!isNaN(parsed) && parsed > 0) config.viewDistance = parsed;
    }
    if (existingProps.has('simulation-distance')) {
      const parsed = parseInt(existingProps.get('simulation-distance')!, 10);
      if (!isNaN(parsed) && parsed > 0) config.simulationDistance = parsed;
    }
    if (existingProps.has('max-players')) {
      const parsed = parseInt(existingProps.get('max-players')!, 10);
      if (!isNaN(parsed) && parsed > 0) config.maxPlayers = parsed;
    }
    if (existingProps.has('difficulty')) {
      config.difficulty = existingProps.get('difficulty') as any;
    }
    if (existingProps.has('gamemode')) {
      config.gamemode = existingProps.get('gamemode') as any;
    }
    if (existingProps.has('white-list')) {
      config.whiteList = existingProps.get('white-list') === 'true';
    }
    if (existingProps.has('pvp')) {
      config.pvp = existingProps.get('pvp') === 'true';
    }
    if (existingProps.has('motd')) {
      config.motd = existingProps.get('motd');
    }

    // Critical managed settings
    const managed: Record<string, string> = {
      'server-port': String(config.port),
      'max-players': String(config.maxPlayers),
      'difficulty': config.difficulty,
      'gamemode': config.gamemode,
      'white-list': String(config.whiteList ?? false),
      'online-mode': String(config.onlineMode),
      'pvp': String(config.pvp),
      'hardcore': String(config.hardcore ?? false),
      'allow-flight': String(config.allowFlight ?? true),
      'spawn-protection': String(config.spawnProtection ?? 0),
      'simulation-distance': String(config.simulationDistance),
      'view-distance': String(config.viewDistance),
      'max-tick-time': '-1',
      'network-compression-threshold': String(compression),
      'keep-spawn-loaded': keepSpawnLoaded,
      'sync-chunk-writes': 'false', // Crucial for non-blocking disk I/O on chunk saves / dimension hops
      'enable-status': 'true',
      'level-name': 'world',
      'motd': config.motd || 'Hosted via Zebra',
    };

    for (const [k, v] of Object.entries(managed)) {
      existingProps.set(k, v);
    }

    const outputLines: string[] = [
      '# Minecraft server properties (Managed & Preserved by Zebra)',
      `# Last updated: ${new Date().toISOString()}`,
    ];
    for (const [k, v] of existingProps.entries()) {
      outputLines.push(`${k}=${v}`);
    }

    try {
      fs.writeFileSync(propsPath, outputLines.join('\n') + '\n');
    } catch (e) {
      console.warn('Could not write server.properties:', e);
    }
  }

  private ensurePacketFixerConfig(workDir: string, sourceInstance?: string) {
    const targets = [
      path.join(workDir, 'config', 'packetfixer.properties'),
    ];
    if (sourceInstance) {
      targets.push(path.join(sourceInstance, 'config', 'packetfixer.properties'));
    }

    for (const pFixerPath of targets) {
      if (fs.existsSync(pFixerPath)) {
        try {
          let content = fs.readFileSync(pFixerPath, 'utf8');
          let modified = false;
          if (content.includes('forceUnlimitedNbtEnabled=false')) {
            content = content.replace('forceUnlimitedNbtEnabled=false', 'forceUnlimitedNbtEnabled=true');
            modified = true;
          }
          if (content.includes('nbtMaxSize=2097152')) {
            content = content.replace('nbtMaxSize=2097152', 'nbtMaxSize=9223372036854775807');
            modified = true;
          }
          if (content.includes('chunkPacketData=2097152')) {
            content = content.replace('chunkPacketData=2097152', 'chunkPacketData=2147483647');
            modified = true;
          }
          if (modified) {
            fs.writeFileSync(pFixerPath, content, 'utf8');
            console.log(`[Runner] Auto-tuned packetfixer config: forceUnlimitedNbtEnabled=true (${pFixerPath})`);
          }
        } catch (e) {
          console.warn('[Runner] Could not auto-tune packetfixer config:', e);
        }
      }
    }
  }

  private prepareWorldSymlink(sourceWorldDir: string, targetWorldDir: string) {
    const normSource = path.resolve(sourceWorldDir);
    const normTarget = path.resolve(targetWorldDir);
    if (normSource === normTarget || normTarget.startsWith(normSource) || normSource.startsWith(normTarget)) {
      console.warn('[ServerRunner] Skipping symlink to avoid recursive loop:', normSource, normTarget);
      return;
    }

    if (fs.existsSync(targetWorldDir)) {
      try {
        const stat = fs.lstatSync(targetWorldDir);
        if (stat.isSymbolicLink()) {
          fs.unlinkSync(targetWorldDir);
        }
      } catch {}
    }

    if (!fs.existsSync(targetWorldDir)) {
      try {
        const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
        fs.symlinkSync(sourceWorldDir, targetWorldDir, symlinkType);
      } catch {
        console.warn('Symlink failed, ensure target points to source world.');
      }
    }
  }

  private async resolveServerJar(
    workDir: string,
    version: string,
    loader: ServerConfig['loader'],
    loaderVersion?: string,
    serverId?: string
  ): Promise<string> {
    const destJar = path.join(workDir, 'server.jar');
    if (fs.existsSync(destJar) && fs.statSync(destJar).size > 100000) {
      return destJar;
    }

    const cacheDir = path.join(this.appDataDir, 'cache');
    const downloadedJar = await ServerJarDownloader.resolveOrDownload(
      cacheDir,
      version,
      loader,
      loaderVersion,
      (msg) => this.log(`[Prep] ${msg}`, serverId)
    );
    fs.copyFileSync(downloadedJar, destJar);
    return destJar;
  }

  /**
   * Resolves the Java runtime cleanly:
   * 1. If customJavaPath is configured and exists, use it.
   * 2. Auto-detects standard system Java or Zebra managed runtimes matching required version.
   * 3. If missing, auto-downloads portable runtime from Eclipse Adoptium API into Zebra runtimes.
   */
  private async resolveJavaPath(mcVersion: string, customJavaPath?: string, serverId?: string): Promise<string> {
    // 1. User manual override
    if (customJavaPath && fs.existsSync(customJavaPath)) {
      this.log(`[Prep] Using custom Java executable: ${customJavaPath}`, serverId);
      return customJavaPath;
    }

    // Determine target Java version
    const v = mcVersion.trim();
    let reqVersion = 17;
    if (
      v.startsWith('26') ||
      v.startsWith('25') ||
      v.startsWith('1.22') ||
      v.startsWith('1.23') ||
      v.includes('26w') ||
      v.includes('25w')
    ) {
      reqVersion = 25;
    } else if (v.startsWith('1.21') || v.startsWith('1.20.5') || v.startsWith('1.20.6')) {
      reqVersion = 21;
    } else {
      reqVersion = 17;
    }

    // 2. Check Zebra Managed Runtimes directory (~/.zebra/runtimes/java-X)
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'java.exe' : 'java';
    const zebraRuntimesDirs = [
      path.join(os.homedir(), '.zebra', 'runtimes', `java-${reqVersion}`),
      path.join(process.env.APPDATA || '', 'Zebra', 'runtimes', `java-${reqVersion}`),
    ];
    for (const rDir of zebraRuntimesDirs) {
      if (fs.existsSync(rDir)) {
        const found = ServerJarDownloader.findJavaExecutable(rDir);
        if (found) return found;
      }
    }

    // 3. Check Standard Eclipse Adoptium in LocalAppData (Windows)
    if (isWin) {
      const localAdoptium = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eclipse Adoptium');
      if (fs.existsSync(localAdoptium)) {
        try {
          const matches = fs.readdirSync(localAdoptium)
            .filter((d) => d.includes(`-${reqVersion}.`) || d.startsWith(`jdk-${reqVersion}`) || d.startsWith(`jre-${reqVersion}`));
          for (const dir of matches) {
            const found = ServerJarDownloader.findJavaExecutable(path.join(localAdoptium, dir));
            if (found) {
              this.log(`[Prep] Using system Java ${reqVersion} (${dir}).`, serverId);
              return found;
            }
          }
        } catch {}
      }

      // 4. Check Program Files (Eclipse Adoptium, Java, Microsoft)
      const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
      const systemSearchDirs = [
        path.join(progFiles, 'Eclipse Adoptium'),
        path.join(progFiles, 'Java'),
        path.join(progFiles, 'Microsoft'),
      ];
      for (const sysDir of systemSearchDirs) {
        if (fs.existsSync(sysDir)) {
          try {
            const matches = fs.readdirSync(sysDir)
              .filter((d) => d.includes(`-${reqVersion}.`) || d.startsWith(`jdk-${reqVersion}`) || d.startsWith(`jre-${reqVersion}`));
            for (const dir of matches) {
              const found = ServerJarDownloader.findJavaExecutable(path.join(sysDir, dir));
              if (found) {
                this.log(`[Prep] Using system Java ${reqVersion} (${dir}).`, serverId);
                return found;
              }
            }
          } catch {}
        }
      }
    } else {
      // macOS and Linux standard JVM discovery
      const posixJvmDirs = [
        // Linux standard OpenJDK / Temurin
        `/usr/lib/jvm/java-${reqVersion}-openjdk`,
        `/usr/lib/jvm/java-${reqVersion}-openjdk-amd64`,
        `/usr/lib/jvm/java-${reqVersion}-openjdk-arm64`,
        `/usr/lib/jvm/temurin-${reqVersion}-jdk`,
        `/usr/lib/jvm/java-${reqVersion}`,
        // macOS Homebrew OpenJDK
        `/opt/homebrew/opt/openjdk@${reqVersion}`,
        `/usr/local/opt/openjdk@${reqVersion}`,
        // macOS standard JDK installs
        `/Library/Java/JavaVirtualMachines/temurin-${reqVersion}.jdk`,
        `/Library/Java/JavaVirtualMachines/zulu-${reqVersion}.jdk`,
        `/Library/Java/JavaVirtualMachines/adoptopenjdk-${reqVersion}.jdk`,
        `/Library/Java/JavaVirtualMachines/microsoft-${reqVersion}.jdk`,
        // SDKMAN
        path.join(os.homedir(), '.sdkman', 'candidates', 'java', `current`),
      ];

      for (const jvmDir of posixJvmDirs) {
        if (fs.existsSync(jvmDir)) {
          const found = ServerJarDownloader.findJavaExecutable(jvmDir);
          if (found) {
            this.log(`[Prep] Using system Java ${reqVersion} (${jvmDir}).`, serverId);
            return found;
          }
        }
      }

      // Check /Library/Java/JavaVirtualMachines directory dynamically on macOS
      if (process.platform === 'darwin') {
        const macJvms = '/Library/Java/JavaVirtualMachines';
        if (fs.existsSync(macJvms)) {
          try {
            const entries = fs.readdirSync(macJvms);
            for (const entry of entries) {
              if (entry.includes(String(reqVersion))) {
                const found = ServerJarDownloader.findJavaExecutable(path.join(macJvms, entry));
                if (found) {
                  this.log(`[Prep] Using macOS system Java ${reqVersion} (${entry}).`, serverId);
                  return found;
                }
              }
            }
          } catch {}
        }
      }

      // Check /usr/lib/jvm directory dynamically on Linux
      if (process.platform === 'linux') {
        const linuxJvms = '/usr/lib/jvm';
        if (fs.existsSync(linuxJvms)) {
          try {
            const entries = fs.readdirSync(linuxJvms);
            for (const entry of entries) {
              if (entry.includes(String(reqVersion))) {
                const found = ServerJarDownloader.findJavaExecutable(path.join(linuxJvms, entry));
                if (found) {
                  this.log(`[Prep] Using Linux system Java ${reqVersion} (${entry}).`, serverId);
                  return found;
                }
              }
            }
          } catch {}
        }
      }
    }

    // 5. Check JAVA_HOME if set
    if (process.env.JAVA_HOME) {
      const jhExe = path.join(process.env.JAVA_HOME, 'bin', binName);
      if (fs.existsSync(jhExe)) {
        return jhExe;
      }
    }

    // 6. Automatically download and unpack portable official Adoptium runtime
    this.log(`[Prep] Java ${reqVersion} runtime not found. Automatically downloading official portable runtime from Adoptium...`, serverId);
    const downloaded = await ServerJarDownloader.ensureJava(reqVersion, (msg) => this.log(`[Prep] ${msg}`, serverId));
    if (downloaded) {
      this.log(`[Prep] Installed portable Java ${reqVersion} runtime successfully.`, serverId);
      return downloaded;
    }

    return 'java';
  }
}
