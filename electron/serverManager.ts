import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { nativeImage } from 'electron';
import AdmZip from 'adm-zip';
import { ServerConfig, ServerInstance, BackupInfo, FileItem, AppSettings, WorldInfo, ModItem } from './types';
import { NbtManager } from './nbt';
import { WorldScanner } from './scanner';
import { ModFilter } from './modfilter';

export function generateUniqueRoomCode(name: string): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'zebra';
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${clean}-${suffix}`;
}

export class ServerManager {
  private settingsPath: string;
  private settings: AppSettings;
  private scanner: WorldScanner = new WorldScanner();

  constructor() {
    const baseDir = this.getAppDataDir();
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    this.settingsPath = path.join(baseDir, 'settings.json');
    this.settings = this.loadSettings();

    if (!fs.existsSync(this.settings.serversRootPath)) {
      fs.mkdirSync(this.settings.serversRootPath, { recursive: true });
    }
  }

  private getAppDataDir(): string {
    const base = process.env.APPDATA || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
    return path.join(base, 'Zebra');
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public saveSettings(newSettings: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...newSettings };
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    return { ...this.settings };
  }

  private loadSettings(): AppSettings {
    const defaultServersPath = path.join(this.getAppDataDir(), 'servers');
    const defaultHostId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'host-' + Math.random().toString(36).substring(2, 10);
    const defaultSettings: AppSettings = {
      serversRootPath: defaultServersPath,
      scanSingleplayerSaves: false,
      minimizeToTray: true,
      defaultRamMode: 'auto',
      defaultMaxRamGb: 6,
      defaultUpnp: true,
      defaultE4mc: false,
      signalingHost: '163.245.213.207',
      signalingPort: 9090,
      stunPort: 19302,
      p2pHolePunching: true,
      loopbackBypass: true,
      relayMode: 'auto',
      hostInstanceId: defaultHostId,
    };

    if (fs.existsSync(this.settingsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        if (data.serversRootPath && data.serversRootPath.includes('.zebra')) {
          data.serversRootPath = defaultServersPath;
        }
        if (!data.hostInstanceId) {
          data.hostInstanceId = defaultHostId;
          try {
            fs.writeFileSync(this.settingsPath, JSON.stringify({ ...defaultSettings, ...data }, null, 2));
          } catch {}
        }
        return { ...defaultSettings, ...data };
      } catch (err) {
        console.warn('Could not read settings.json, using defaults:', err);
      }
    }
    return defaultSettings;
  }

  /**
   * Lists all dedicated managed servers in ~/.zebra/servers/
   */
  public async listAllServers(): Promise<ServerInstance[]> {
    const servers: ServerInstance[] = [];
    const seenIds = new Set<string>();

    const searchRoots = [
      this.settings.serversRootPath,
      path.join(os.homedir(), '.zebra', 'servers'),
    ];

    for (const root of searchRoots) {
      if (fs.existsSync(root)) {
        try {
          const entries = fs.readdirSync(root, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const srvDir = path.join(root, entry.name);
              const srv = this.loadManagedServer(srvDir);
              if (srv && !seenIds.has(srv.id)) {
                seenIds.add(srv.id);
                servers.push(srv);
              }
            }
          }
        } catch {}
      }
    }

    return servers;
  }

  /**
   * Scans singleplayer worlds specifically for the Import tab in the server creation wizard
   */
  public async getSingleplayerWorlds(): Promise<WorldInfo[]> {
    try {
      return await this.scanner.scanAll();
    } catch (err) {
      console.warn('Failed to scan singleplayer worlds:', err);
      return [];
    }
  }

  /**
   * Creates a dedicated server instance folder inside ~/.zebra/servers/<id>
   */
  public async createServer(config: Partial<ServerConfig>): Promise<ServerInstance> {
    const serverId = config.id || `srv-${Date.now()}`;
    const srvDir = path.join(this.settings.serversRootPath, serverId);

    if (!fs.existsSync(srvDir)) {
      fs.mkdirSync(srvDir, { recursive: true });
    }

    // Default configuration
    const fullConfig: ServerConfig = {
      id: serverId,
      name: config.name || 'New Minecraft Server',
      version: config.version || '26.3',
      loader: config.loader || 'Vanilla',
      port: config.port || 25565,
      maxPlayers: config.maxPlayers || 20,
      ramMode: config.ramMode || this.settings.defaultRamMode,
      maxRamGb: config.maxRamGb || this.settings.defaultMaxRamGb,
      minRamGb: config.minRamGb || 2,
      gamemode: config.gamemode || 'survival',
      difficulty: config.difficulty || 'normal',
      allowCheats: config.allowCheats ?? true,
      pvp: config.pvp ?? true,
      onlineMode: config.onlineMode ?? true,
      spawnProtection: 0,
      simulationDistance: config.simulationDistance || 8,
      viewDistance: config.viewDistance || 12,
      enableUpnp: config.enableUpnp ?? this.settings.defaultUpnp,
      enableE4mc: config.enableE4mc ?? this.settings.defaultE4mc ?? true,
      autoBackup: config.autoBackup ?? false,
      roomCode: config.roomCode || generateUniqueRoomCode(config.name || 'zebra-server'),
      motd: config.motd || `Hosted via Zebra - ${config.name || 'Server'}`,
      sourceInstance: config.sourceInstance,
      worldSourcePath: config.worldSourcePath,
      gameRules: config.gameRules,
    };

    // Save zebra.json
    fs.writeFileSync(path.join(srvDir, 'zebra.json'), JSON.stringify(fullConfig, null, 2));

    // Auto EULA
    fs.writeFileSync(path.join(srvDir, 'eula.txt'), 'eula=true\n');

    // Create mods and world directories
    const modsDir = path.join(srvDir, 'mods');
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

    let driveTotalBytes: number | undefined;
    let driveFreeBytes: number | undefined;
    try {
      const stat = fs.statfsSync(srvDir);
      driveTotalBytes = stat.blocks * stat.bsize;
      driveFreeBytes = stat.bavail * stat.bsize;
    } catch {}

    return {
      ...fullConfig,
      path: srvDir,
      status: 'offline',
      sizeBytes: this.calculateDirSize(srvDir),
      driveTotalBytes,
      driveFreeBytes,
      activePlayers: [],
      cpuPercent: 0,
      memoryUsedMb: 0,
    };
  }

  /**
   * Imports an existing singleplayer world into a dedicated, isolated Zebra server
   */
  public async importSingleplayerWorld(worldPath: string, name?: string): Promise<ServerInstance> {
    const meta = await NbtManager.readWorldMetadata(worldPath, 'custom', 'Imported');
    const serverName = name || meta?.name || path.basename(worldPath);
    const instanceDir = path.dirname(path.dirname(worldPath));
    const instance = await this.createServer({
      name: serverName,
      version: meta?.version || '26.3',
      loader: (meta?.loader && meta.loader !== 'Unknown' ? meta.loader : 'Vanilla') as ServerConfig['loader'],
      gamemode: meta?.gameType || 'survival',
      allowCheats: meta?.cheatsEnabled ?? true,
      worldSourcePath: worldPath,
      sourceInstance: instanceDir,
    });

    // Copy world files into server's dedicated world directory
    const destWorld = path.join(instance.path, 'world');
    this.copyFolderRecursive(worldPath, destWorld);

    // Copy and filter mods if source instance has a mods folder
    const instanceMods = path.join(instanceDir, 'mods');
    if (fs.existsSync(instanceMods)) {
      const destMods = path.join(instance.path, 'mods');
      ModFilter.prepareServerMods(instanceMods, destMods);
    }

    // Copy mod configs and defaults to ensure 100% registry and setting sync with client
    const instanceConfig = path.join(instanceDir, 'config');
    if (fs.existsSync(instanceConfig)) {
      const destConfig = path.join(instance.path, 'config');
      this.copyFolderRecursive(instanceConfig, destConfig);
    }
    const instanceDefaultConfigs = path.join(instanceDir, 'defaultconfigs');
    if (fs.existsSync(instanceDefaultConfigs)) {
      const destDefaultConfigs = path.join(instance.path, 'defaultconfigs');
      this.copyFolderRecursive(instanceDefaultConfigs, destDefaultConfigs);
    }

    // Sync datapacks from both world folder and instance directory
    const worldDatapacks = path.join(worldPath, 'datapacks');
    if (fs.existsSync(worldDatapacks)) {
      this.syncDatapacks(worldDatapacks, destWorld, instance.path);
    }
    const instanceDatapacks = path.join(instanceDir, 'datapacks');
    if (fs.existsSync(instanceDatapacks)) {
      this.syncDatapacks(instanceDatapacks, destWorld, instance.path);
    }
    const instanceGlobalPacks = path.join(instanceDir, 'global_packs');
    if (fs.existsSync(instanceGlobalPacks)) {
      const destGlobal = path.join(instance.path, 'global_packs');
      this.copyFolderRecursive(instanceGlobalPacks, destGlobal);
      this.syncDatapacks(instanceGlobalPacks, destWorld, instance.path);
    }

    // Universal Modpack Data & Content Discovery (Standards-Compliant)
    // Automatically discovers and syncs all mod data, scripts, and content directories (e.g. KubeJS,
    // Paxi, OpenLoader, CraftTweaker, CustomNPCs, Flan, Patchouli, etc.) without hardcoded mod names.
    const CLIENT_ONLY_FOLDERS = new Set([
      'assets',
      'bin',
      'cache',
      'crash-reports',
      'logs',
      'natives',
      'resourcepacks',
      'screenshots',
      'shaderpacks',
      'versions',
      'webcache',
      'webcache2',
      'saves',
      '.fabric',
      '.quilt',
      '.mixin.out',
      '.minecraft',
      'mods',
      'config',
      'defaultconfigs',
      'datapacks',
      'global_packs',
      'world',
    ]);

    try {
      const entries = fs.readdirSync(instanceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const nameLower = entry.name.toLowerCase();
        if (CLIENT_ONLY_FOLDERS.has(nameLower)) continue;

        const srcFolder = path.join(instanceDir, entry.name);
        const destFolder = path.join(instance.path, entry.name);
        this.copyFolderRecursive(srcFolder, destFolder);

        // If this mod data folder contains any datapacks (e.g. openloader/data or paxi/datapacks),
        // automatically discover and sync them into world/datapacks
        this.syncDatapacks(srcFolder, destWorld, instance.path);
      }
    } catch (err) {
      console.warn('[ServerManager] Generic mod data discovery error:', err);
    }

    // Copy icon if available
    const iconSrc = path.join(worldPath, 'icon.png');
    if (fs.existsSync(iconSrc)) {
      try {
        fs.copyFileSync(iconSrc, path.join(instance.path, 'icon.png'));
      } catch {}
    }

    // Automatically sync waypoints to server and multiplayer profiles
    try {
      const worldName = path.basename(worldPath);
      const xaeroMinimap = path.join(instanceDir, 'xaero', 'minimap', worldName);
      if (fs.existsSync(xaeroMinimap)) {
        const dim0Wp = path.join(xaeroMinimap, 'dim%0', 'waypoints.txt');
        if (fs.existsSync(dim0Wp)) {
          const wpContent = fs.readFileSync(dim0Wp, 'utf8');
          fs.writeFileSync(path.join(destWorld, 'server_waypoints.txt'), wpContent, 'utf8');
          fs.writeFileSync(path.join(instance.path, 'server_waypoints.txt'), wpContent, 'utf8');

          // Copy to local multiplayer folders for immediate host visibility
          const multiNames = ['Multiplayer_localhost', 'Multiplayer_127.0.0.1', 'Multiplayer_localhost$25565', 'Multiplayer_127.0.0.1$25565'];
          for (const mName of multiNames) {
            const mDim = path.join(instanceDir, 'xaero', 'minimap', mName, 'dim%0');
            if (!fs.existsSync(mDim)) fs.mkdirSync(mDim, { recursive: true });
            fs.writeFileSync(path.join(mDim, 'waypoints.txt'), wpContent, 'utf8');
          }
        }
      }
    } catch {}

    return this.loadManagedServer(instance.path)!;
  }

  public findServerDir(serverId: string): string | null {
    const primary = path.join(this.settings.serversRootPath, serverId);
    if (fs.existsSync(primary)) return primary;
    const legacy = path.join(os.homedir(), '.zebra', 'servers', serverId);
    if (fs.existsSync(legacy)) return legacy;
    return null;
  }

  public getServer(serverId: string): ServerInstance | null {
    const dir = this.findServerDir(serverId);
    if (!dir) return null;
    return this.loadManagedServer(dir);
  }

  public updateServerConfig(serverId: string, update: Partial<ServerConfig>): boolean {
    const srvDir = this.findServerDir(serverId);
    if (!srvDir) return false;
    const configPath = path.join(srvDir, 'zebra.json');
    if (!fs.existsSync(configPath)) return false;

    try {
      const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const merged = { ...current, ...update };
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
      this.writeServerProperties(srvDir, merged);
      return true;
    } catch {
      return false;
    }
  }

  public async setServerIconFromFile(serverId: string, filePath: string): Promise<string | null> {
    const srvDir = this.findServerDir(serverId);
    if (!srvDir) return null;

    try {
      const img = nativeImage.createFromPath(filePath);
      if (img.isEmpty()) return null;

      const resizedPng = img.resize({ width: 64, height: 64 }).toPNG();
      fs.writeFileSync(path.join(srvDir, 'server-icon.png'), resizedPng);
      fs.writeFileSync(path.join(srvDir, 'icon.png'), resizedPng);

      return `data:image/png;base64,${resizedPng.toString('base64')}`;
    } catch (err) {
      console.warn('Failed to set server icon:', err);
      return null;
    }
  }

  public writeServerProperties(workDir: string, config: ServerConfig) {
    const propsPath = path.join(workDir, 'server.properties');
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
        console.warn('[ServerManager] Could not read existing server.properties:', e);
      }
    }

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
      'network-compression-threshold': '512',
      'sync-chunk-writes': 'false',
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

  public deleteServer(serverId: string): boolean {
    const srvDir = this.findServerDir(serverId);
    if (!srvDir) return false;
    try {
      fs.rmSync(srvDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  // Backup Engine
  public async createBackup(serverPath: string): Promise<BackupInfo> {
    const backupsDir = path.join(serverPath, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
    const fileName = `backup-${dateStr}.zip`;
    const targetFile = path.join(backupsDir, fileName);

    return new Promise<BackupInfo>((resolve, reject) => {
      setImmediate(() => {
        try {
          const zip = new AdmZip();
          const worldDir = path.join(serverPath, 'world');
          if (fs.existsSync(worldDir)) {
            zip.addLocalFolder(worldDir, 'world');
          }

          const srvProps = path.join(serverPath, 'server.properties');
          if (fs.existsSync(srvProps)) {
            zip.addLocalFile(srvProps);
          }

          const zebraCfg = path.join(serverPath, 'zebra.json');
          if (fs.existsSync(zebraCfg)) {
            zip.addLocalFile(zebraCfg);
          }

          zip.writeZip(targetFile, (err) => {
            if (err) return reject(err);
            try {
              const stat = fs.statSync(targetFile);
              resolve({
                fileName,
                filePath: targetFile,
                timestamp,
                sizeBytes: stat.size,
              });
            } catch (e) {
              reject(e);
            }
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  public listBackups(serverPath: string): BackupInfo[] {
    const backupsDir = path.join(serverPath, 'backups');
    if (!fs.existsSync(backupsDir)) return [];

    try {
      const files = fs.readdirSync(backupsDir);
      return files
        .filter((f) => f.endsWith('.zip'))
        .map((f) => {
          const full = path.join(backupsDir, f);
          const stat = fs.statSync(full);
          return {
            fileName: f,
            filePath: full,
            timestamp: stat.mtimeMs,
            sizeBytes: stat.size,
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  public restoreBackup(serverPath: string, backupPath: string): boolean {
    if (!fs.existsSync(backupPath)) return false;

    try {
      const zip = new AdmZip(backupPath);
      const worldDir = path.join(serverPath, 'world');
      if (fs.existsSync(worldDir)) {
        fs.rmSync(worldDir, { recursive: true, force: true });
      }
      zip.extractAllTo(serverPath, true);
      return true;
    } catch (err) {
      console.error('Failed to restore backup:', err);
      return false;
    }
  }

  public deleteBackup(backupPath: string): boolean {
    if (!fs.existsSync(backupPath)) return false;
    try {
      fs.unlinkSync(backupPath);
      return true;
    } catch (err) {
      console.error('Failed to delete backup:', err);
      return false;
    }
  }

  // Mod Management
  public listMods(serverPath: string): ModItem[] {
    const modsDir = path.join(serverPath, 'mods');
    if (!fs.existsSync(modsDir)) return [];
    try {
      const files = fs.readdirSync(modsDir);
      return files
        .filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
        .map((f) => {
          const full = path.join(modsDir, f);
          const stat = fs.statSync(full);
          const enabled = f.endsWith('.jar');
          const cleanName = f.replace(/\.jar(\.disabled)?$/, '');
          return {
            fileName: f,
            name: cleanName,
            enabled,
            sizeBytes: stat.size,
            updatedAt: stat.mtimeMs,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  public toggleMod(serverPath: string, fileName: string): boolean {
    const modsDir = path.join(serverPath, 'mods');
    const oldPath = path.join(modsDir, fileName);
    if (!fs.existsSync(oldPath)) return false;

    let newName: string;
    if (fileName.endsWith('.disabled')) {
      newName = fileName.replace(/\.disabled$/, '');
    } else {
      newName = fileName + '.disabled';
    }

    try {
      fs.renameSync(oldPath, path.join(modsDir, newName));
      return true;
    } catch {
      return false;
    }
  }

  public deleteMod(serverPath: string, fileName: string): boolean {
    const full = path.join(serverPath, 'mods', fileName);
    if (!fs.existsSync(full)) return false;
    try {
      fs.unlinkSync(full);
      return true;
    } catch {
      return false;
    }
  }

  public uploadMods(serverPath: string, filePaths: string[]): number {
    const modsDir = path.join(serverPath, 'mods');
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
    let count = 0;
    for (const src of filePaths) {
      if (fs.existsSync(src) && src.endsWith('.jar')) {
        try {
          fs.copyFileSync(src, path.join(modsDir, path.basename(src)));
          count++;
        } catch {}
      }
    }
    return count;
  }

  public listFiles(targetDir: string): FileItem[] {
    if (!fs.existsSync(targetDir)) return [];

    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      return entries.map((entry) => {
        const full = path.join(targetDir, entry.name);
        let sizeBytes = 0;
        let isDir = entry.isDirectory();
        try {
          const stat = fs.statSync(full);
          sizeBytes = stat.isFile() ? stat.size : 0;
        } catch {}
        return {
          name: entry.name,
          path: full,
          isDirectory: isDir,
          sizeBytes,
          updatedAt: Date.now(),
        };
      });
    } catch {
      return [];
    }
  }

  private loadManagedServer(srvDir: string): ServerInstance | null {
    const cfgPath = path.join(srvDir, 'zebra.json');
    if (!fs.existsSync(cfgPath)) return null;

    try {
      const config: ServerConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const sizeBytes = this.calculateDirSize(srvDir);

      let iconBase64: string | undefined = undefined;
      const iconPath = path.join(srvDir, 'server-icon.png');
      const fallbackIcon = path.join(srvDir, 'icon.png');
      const targetIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(fallbackIcon) ? fallbackIcon : null);
      if (targetIcon) {
        try {
          iconBase64 = `data:image/png;base64,${fs.readFileSync(targetIcon).toString('base64')}`;
        } catch {}
      }

      const roomCode = config.roomCode || generateUniqueRoomCode(config.name || 'zebra-server');
      if (!config.roomCode) {
        config.roomCode = roomCode;
        try { fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2)); } catch {}
      }

      let driveTotalBytes: number | undefined;
      try {
        const stat = fs.statfsSync(srvDir);
        driveTotalBytes = stat.blocks * stat.bsize;
      } catch {}

      return {
        ...config,
        enableE4mc: config.enableE4mc ?? true,
        roomCode,
        path: srvDir,
        status: 'offline',
        sizeBytes,
        driveTotalBytes,
        activePlayers: [],
        cpuPercent: 0,
        memoryUsedMb: 0,
        iconBase64,
      };
    } catch {
      return null;
    }
  }

  /**
   * Accurately calculates recursive directory size in bytes
   */
  public calculateDirSize(dir: string, depth = 0): number {
    if (depth > 6 || !fs.existsSync(dir)) return 0;
    let total = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue; // Skip symlinks to avoid double-counting or loops
        const full = path.join(dir, entry.name);
        if (entry.isFile()) {
          try {
            total += fs.statSync(full).size;
          } catch {}
        } else if (entry.isDirectory()) {
          total += this.calculateDirSize(full, depth + 1);
        }
      }
    } catch {}
    return total;
  }

  private copyFolderRecursive(src: string, dest: string, depth = 0) {
    if (depth > 8) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    try {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue; // NEVER copy symlinks/junctions
        if (entry.name === 'libraries' || entry.name === 'versions') continue; // don't copy unneeded client launcher jars

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          this.copyFolderRecursive(srcPath, destPath, depth + 1);
        } else {
          try {
            fs.copyFileSync(srcPath, destPath);
          } catch {}
        }
      }
    } catch {}
  }

  /**
   * Recursively discovers all .zip datapacks and directory datapacks (containing pack.mcmeta)
   * and copies them into both <destWorld>/datapacks/ and <destServer>/datapacks/
   */
  public syncDatapacks(sourceDatapacksDir: string, destWorldDir: string, destServerDir: string) {
    if (!fs.existsSync(sourceDatapacksDir)) return;
    const destWorldDp = path.join(destWorldDir, 'datapacks');
    const destServerDp = path.join(destServerDir, 'datapacks');
    if (!fs.existsSync(destWorldDp)) fs.mkdirSync(destWorldDp, { recursive: true });
    if (!fs.existsSync(destServerDp)) fs.mkdirSync(destServerDp, { recursive: true });

    const collectPacks = (currentDir: string, depth = 0) => {
      if (depth > 6) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
            // Verify this is a genuine Minecraft datapack containing pack.mcmeta
            try {
              const zip = new AdmZip(fullPath);
              if (!zip.getEntry('pack.mcmeta')) continue;
            } catch {
              continue;
            }

            // Flatten .zip files directly into world/datapacks so Minecraft level.dat 'file/name.zip' resolves
            const targetWorldZip = path.join(destWorldDp, entry.name);
            if (!fs.existsSync(targetWorldZip)) {
              try { fs.copyFileSync(fullPath, targetWorldZip); } catch {}
            }
            const targetServerZip = path.join(destServerDp, entry.name);
            if (!fs.existsSync(targetServerZip)) {
              try { fs.copyFileSync(fullPath, targetServerZip); } catch {}
            }
          } else if (entry.isDirectory()) {
            if (fs.existsSync(path.join(fullPath, 'pack.mcmeta'))) {
              // Unpacked datapack directory
              const targetWorldDir = path.join(destWorldDp, entry.name);
              if (!fs.existsSync(targetWorldDir)) {
                this.copyFolderRecursive(fullPath, targetWorldDir);
              }
              const targetServerDir = path.join(destServerDp, entry.name);
              if (!fs.existsSync(targetServerDir)) {
                this.copyFolderRecursive(fullPath, targetServerDir);
              }
            } else {
              // Subfolder (e.g. extra/)
              collectPacks(fullPath, depth + 1);
            }
          }
        }
      } catch {}
    };

    collectPacks(sourceDatapacksDir);
  }
}
