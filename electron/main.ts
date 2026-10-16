import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, NativeImage, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
import { ServerManager } from './serverManager';
import { ServerRunner } from './runner';
import { ModpackProvisioner } from './provisioner';
import { VersionManifestManager } from './versionManifest';
import { ServerConfig, ServerInstance, ModpackInfo } from './types';

// Ensure proper Windows Taskbar identity, grouping and context menu label
app.setName('Zebra');
if (process.platform === 'win32') {
  app.setAppUserModelId('Zebra');
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const serverManager = new ServerManager();
const runner = new ServerRunner();
const initialSettings = serverManager.getSettings();
runner.setSettings(initialSettings);

function getAppLogoPath(): string {
  const candidatePaths = [
    // Unpacked / resources paths (packaged production)
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'zebra-logo.ico'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'zebra-logo.png'),
    path.join(process.resourcesPath || '', 'assets', 'zebra-logo.ico'),
    path.join(process.resourcesPath || '', 'assets', 'zebra-logo.png'),
    // Dev & relative paths
    path.join(__dirname, '../assets/zebra-logo.ico'),
    path.join(app.getAppPath(), 'assets/zebra-logo.ico'),
    path.join(process.cwd(), 'assets/zebra-logo.ico'),
    path.join(__dirname, '../assets/zebra-logo.png'),
    path.join(app.getAppPath(), 'assets/zebra-logo.png'),
    path.join(process.cwd(), 'assets/zebra-logo.png'),
    path.join(__dirname, '../public/zebra-logo.ico'),
    path.join(__dirname, '../src/assets/zebra-logo.ico'),
    path.join(__dirname, '../../public/zebra-logo.ico'),
    path.join(__dirname, '../../zebra-logo.ico'),
    path.join(app.getAppPath(), 'public/zebra-logo.ico'),
    path.join(app.getAppPath(), 'zebra-logo.ico'),
    path.join(__dirname, '../public/zebra-logo.png'),
    path.join(__dirname, '../src/assets/zebra-logo.png'),
    path.join(__dirname, '../../public/zebra-logo.png'),
    path.join(__dirname, '../../zebra-logo.png'),
    path.join(app.getAppPath(), 'public/zebra-logo.png'),
    path.join(app.getAppPath(), 'zebra-logo.png'),
    path.join(process.cwd(), 'zebra-logo.ico'),
    path.join(process.cwd(), 'zebra-logo.png'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return '';
}

function getAppLogo(): NativeImage {
  const logoPath = getAppLogoPath();
  if (logoPath) {
    // 1. Try buffer decode via fs (always succeeds even inside asar)
    try {
      const buf = fs.readFileSync(logoPath);
      const img = nativeImage.createFromBuffer(buf);
      if (!img.isEmpty()) {
        return img;
      }
    } catch {}

    // 2. Fallback to createFromPath
    try {
      const img = nativeImage.createFromPath(logoPath);
      if (!img.isEmpty()) {
        return img;
      }
    } catch {}
  }
  return nativeImage.createEmpty();
}

function getTrayIcon(): NativeImage | string {
  const candidatePaths = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'zebra-logo.ico'),
    path.join(process.resourcesPath || '', 'assets', 'zebra-logo.ico'),
    path.join(__dirname, '../assets/zebra-logo.ico'),
    path.join(process.cwd(), 'assets/zebra-logo.ico'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'zebra-logo.png'),
    path.join(process.resourcesPath || '', 'assets', 'zebra-logo.png'),
    path.join(__dirname, '../assets/zebra-logo.png'),
    path.join(process.cwd(), 'assets/zebra-logo.png'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p) && !p.includes('app.asar\\') && !p.includes('app.asar/')) {
      if (p.endsWith('.ico')) {
        return p;
      }
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          return img.resize({ width: 16, height: 16 });
        }
      } catch {}
    }
  }

  // Fallback: build nativeImage from buffer or path and size to 16x16
  const logo = getAppLogo();
  if (!logo.isEmpty()) {
    return logo.resize({ width: 16, height: 16 });
  }

  return nativeImage.createEmpty();
}

function createTray() {
  try {
    const trayIcon = getTrayIcon();
    try {
      tray = new Tray(trayIcon);
    } catch (iconErr) {
      const logo = getAppLogo();
      tray = new Tray(logo.resize({ width: 16, height: 16 }));
    }
    tray.setToolTip('Zebra');
    updateTrayMenu();

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.warn('[Zebra] Failed to initialize system tray icon:', err);
  }
}

function updateTrayMenu(activeServer?: ServerInstance | null) {
  if (!tray) return;
  const srv = activeServer !== undefined ? activeServer : runner.getActiveServer();
  const isOnline = srv && srv.status === 'online';
  const isStarting = srv && srv.status === 'starting';

  if (isOnline) {
    tray.setToolTip(`Zebra • ${srv.name} (Online - ${srv.e4mcDomain || srv.port})`);
  } else if (isStarting) {
    tray.setToolTip(`Zebra • ${srv.name} (Starting...)`);
  } else {
    tray.setToolTip('Zebra');
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Zebra',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: srv ? `Server: ${srv.name}` : 'No Active Server',
      enabled: false,
    },
    {
      label: isOnline ? `Status: Online (${srv?.activePlayers.length || 0} players)` : isStarting ? 'Status: Starting...' : 'Status: Offline',
      enabled: false,
    },
    ...(isOnline || isStarting ? [
      {
        label: 'Stop Server',
        click: async () => {
          await runner.stop();
        },
      }
    ] : []),
    { type: 'separator' },
    {
      label: 'Quit Zebra',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1240,
  height: 800,
  isMaximized: false,
};

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const filePath = getWindowStatePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (typeof data.width === 'number' && typeof data.height === 'number') {
        const state: WindowState = {
          width: Math.max(980, data.width),
          height: Math.max(660, data.height),
          isMaximized: !!data.isMaximized,
        };

        if (typeof data.x === 'number' && typeof data.y === 'number') {
          const displays = screen.getAllDisplays();
          const isVisible = displays.some((d) => {
            const b = d.bounds;
            return (
              data.x >= b.x - 20 &&
              data.y >= b.y - 20 &&
              data.x < b.x + b.width &&
              data.y < b.y + b.height
            );
          });
          if (isVisible) {
            state.x = data.x;
            state.y = data.y;
          }
        }
        return state;
      }
    }
  } catch (err) {
    console.warn('[Zebra] Could not read window-state.json:', err);
  }
  return { ...DEFAULT_WINDOW_STATE };
}

let windowStateDebounceTimer: NodeJS.Timeout | null = null;

function saveWindowState() {
  if (!mainWindow) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    let bounds = {
      width: DEFAULT_WINDOW_STATE.width,
      height: DEFAULT_WINDOW_STATE.height,
      x: undefined as number | undefined,
      y: undefined as number | undefined,
    };

    if (!isMaximized) {
      const b = mainWindow.getBounds();
      bounds = {
        width: b.width,
        height: b.height,
        x: b.x,
        y: b.y,
      };
    } else {
      try {
        const filePath = getWindowStatePath();
        if (fs.existsSync(filePath)) {
          const old = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (old.width && old.height) {
            bounds = {
              width: old.width,
              height: old.height,
              x: old.x,
              y: old.y,
            };
          }
        }
      } catch {}
    }

    const state: WindowState = {
      ...bounds,
      isMaximized,
    };

    const filePath = getWindowStatePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Zebra] Could not save window state:', err);
  }
}

function debouncedSaveWindowState() {
  if (windowStateDebounceTimer) clearTimeout(windowStateDebounceTimer);
  windowStateDebounceTimer = setTimeout(saveWindowState, 300);
}

function createWindow() {
  const logoPath = getAppLogoPath();
  const logo = logoPath ? nativeImage.createFromPath(logoPath) : nativeImage.createEmpty();

  Menu.setApplicationMenu(null);

  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#0c0d12',
    title: 'Zebra',
    icon: logoPath || logo,
    frame: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.show();
  mainWindow.focus();

  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);
  mainWindow.on('maximize', debouncedSaveWindowState);
  mainWindow.on('unmaximize', debouncedSaveWindowState);

  // Setup runner callbacks
  runner.setCallbacks(
    (line: string, serverId?: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server:log', line, serverId);
      }
    },
    (srv: ServerInstance) => {
      updateTrayMenu(srv);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server:status-change', srv);
      }
    }
  );

  // Close behavior honoring minimizeToTray
  mainWindow.on('close', (event) => {
    saveWindowState();
    if ((app as any).isQuitting) return;

    const settings = serverManager.getSettings();
    if (settings.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    } else {
      (app as any).isQuitting = true;
      app.quit();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC Handlers - Servers
ipcMain.handle('servers:get-all', async () => {
  const servers = await serverManager.listAllServers();
  await runner.reconnectRunningServers(servers);
  const active = runner.getActiveServer();
  if (active) {
    return servers.map((s) => (s.id === active.id ? active : s));
  }
  return servers;
});

ipcMain.handle('servers:create', async (_event, config: Partial<ServerConfig>) => {
  return await serverManager.createServer(config);
});

ipcMain.handle('servers:import', async (_event, worldPath: string, name?: string) => {
  return await serverManager.importSingleplayerWorld(worldPath, name);
});

ipcMain.handle('servers:update-config', async (_event, id: string, update: Partial<ServerConfig>) => {
  return serverManager.updateServerConfig(id, update);
});

ipcMain.handle('servers:upload-icon', async (_event, id: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Server Icon',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  return await serverManager.setServerIconFromFile(id, filePath);
});

ipcMain.handle('servers:delete', async (_event, id: string) => {
  const active = runner.getActiveServer();
  if (active && active.id === id) {
    await runner.stop();
  }
  return serverManager.deleteServer(id);
});

ipcMain.handle('servers:start', async (_event, server: ServerInstance) => {
  // If autoBackup is enabled, run backup asynchronously in background without stalling startup
  if (server.autoBackup) {
    serverManager.createBackup(server.path).catch((err) => {
      console.warn('Background auto-backup failed:', err);
    });
  }
  const started = await runner.start(server);
  updateTrayMenu(started);
  return started;
});

ipcMain.handle('servers:stop', async (_event, serverId?: string) => {
  const res = await runner.stop(serverId);
  updateTrayMenu(runner.getActiveServer());
  return res;
});

ipcMain.handle('servers:kill', async (_event, serverId?: string) => {
  runner.kill(serverId);
  updateTrayMenu(runner.getActiveServer());
});

ipcMain.handle('servers:kill-all', async () => {
  const killed = await runner.killAllRunningServers();
  updateTrayMenu(null);
  return killed;
});

ipcMain.handle('servers:active', (_event, serverId?: string) => {
  return runner.getActiveServer(serverId);
});

ipcMain.handle('servers:get-active-all', () => {
  return runner.getActiveServers();
});

ipcMain.handle('servers:get-logs', async (_event, serverPath: string) => {
  try {
    const logFile = path.join(serverPath, 'logs', 'latest.log');
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      return lines.slice(-500);
    }
  } catch (e) {
    console.warn('Failed reading latest.log:', e);
  }
  return [];
});

ipcMain.handle('servers:command', (_event, input: string, serverId?: string) => {
  const targetId = serverId || runner.getActiveServer()?.id || '';
  runner.sendCommand(targetId, input);
});

// IPC Handlers - Backups
ipcMain.handle('backups:list', async (_event, serverPath: string) => {
  return serverManager.listBackups(serverPath);
});

ipcMain.handle('backups:create', async (_event, serverPath: string) => {
  return await serverManager.createBackup(serverPath);
});

ipcMain.handle('backups:restore', async (_event, serverPath: string, backupPath: string) => {
  return serverManager.restoreBackup(serverPath, backupPath);
});

ipcMain.handle('backups:delete', async (_event, backupPath: string) => {
  return serverManager.deleteBackup(backupPath);
});

// IPC Handlers - Mods
ipcMain.handle('mods:list', async (_event, serverPath: string) => {
  return serverManager.listMods(serverPath);
});

ipcMain.handle('mods:toggle', async (_event, serverPath: string, fileName: string) => {
  return serverManager.toggleMod(serverPath, fileName);
});

ipcMain.handle('mods:delete', async (_event, serverPath: string, fileName: string) => {
  return serverManager.deleteMod(serverPath, fileName);
});

ipcMain.handle('mods:upload', async (_event, serverPath: string) => {
  if (!mainWindow) return 0;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Mod JARs to Upload',
    filters: [{ name: 'Minecraft Mods', extensions: ['jar'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || result.filePaths.length === 0) return 0;
  return serverManager.uploadMods(serverPath, result.filePaths);
});

// IPC Handlers - Files
ipcMain.handle('files:list', async (_event, targetDir: string) => {
  return serverManager.listFiles(targetDir);
});

ipcMain.handle('files:read-content', async (_event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) return 'File is too large to open (>5MB).';
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    return `Error reading file: ${err.message}`;
  }
});

ipcMain.handle('files:save-content', async (_event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.warn('Failed to save file:', err);
    return false;
  }
});

ipcMain.handle('servers:get-latest-crash', async (_event, serverPath: string) => {
  try {
    const crashDir = path.join(serverPath, 'crash-reports');
    if (!fs.existsSync(crashDir)) return null;
    const files = fs.readdirSync(crashDir)
      .filter((f) => f.startsWith('crash-') && f.endsWith('.txt'))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(crashDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) return null;
    const latest = files[0];
    const fullPath = path.join(crashDir, latest.name);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { fileName: latest.name, content };
  } catch {
    return null;
  }
});

ipcMain.handle('shell:open-folder', async (_event, folderPath: string) => {
  try {
    if (fs.existsSync(folderPath)) {
      const stat = fs.statSync(folderPath);
      if (stat.isFile()) {
        shell.showItemInFolder(folderPath);
        return;
      }
    } else {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    await shell.openPath(folderPath);
  } catch (err) {
    console.warn('Failed to open folder safely:', err);
  }
});

// Dialogs
ipcMain.handle('dialog:select-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:select-file', async (_event, filters) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'World Archives', extensions: ['zip'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Settings
ipcMain.handle('settings:get', () => {
  return serverManager.getSettings();
});

ipcMain.handle('settings:save', (_event, settings) => {
  const saved = serverManager.saveSettings(settings);
  runner.setSettings(saved);
  return saved;
});

// Versions
ipcMain.handle('versions:get-all', async (_event, includeSnapshots: boolean = false) => {
  const manifest = await VersionManifestManager.getManifest();
  const releases = manifest.versions.filter((v) => v.type === 'release').map((v) => v.id);
  const snapshots = manifest.versions.filter((v) => v.type === 'snapshot').map((v) => v.id);
  return {
    latestRelease: manifest.latest.release,
    latestSnapshot: manifest.latest.snapshot,
    releases,
    snapshots,
  };
});

// Modpacks
ipcMain.handle('modpacks:search', async (_event, query: string, version?: string, platform?: any) => {
  return await ModpackProvisioner.searchModpacks(query, version, platform);
});

ipcMain.handle('modpacks:versions', async (_event, projectId: string) => {
  return await ModpackProvisioner.getModpackVersions(projectId);
});

ipcMain.handle('modpacks:install', async (_event, modpack: ModpackInfo, version: any) => {
  return await ModpackProvisioner.installModpack(modpack, version, serverManager);
});

// Singleplayer Scan (Used inside Wizard)
ipcMain.handle('worlds:scan', async () => {
  return await serverManager.getSingleplayerWorlds();
});

ipcMain.handle('servers:export-mod', async (_event, _serverId?: string) => {
  if (!mainWindow) return null;

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Universal Zebra Relay Mod (.jar)',
    defaultPath: 'zebra-relay-1.0.0.jar',
    filters: [
      { name: 'Minecraft Mod JAR (*.jar)', extensions: ['jar'] },
      { name: 'All Files (*.*)', extensions: ['*'] },
    ],
  });

  if (saveResult.canceled || !saveResult.filePath) return null;

  const candidates = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'assets', 'mods', 'zebra-relay-1.0.0.jar'),
    path.join(process.resourcesPath || '', 'assets', 'mods', 'zebra-relay-1.0.0.jar'),
    path.join(__dirname, '../assets/mods/zebra-relay-1.0.0.jar'),
    path.join(__dirname, '../../assets/mods/zebra-relay-1.0.0.jar'),
    path.join(app.getAppPath(), 'assets/mods/zebra-relay-1.0.0.jar'),
    path.join(process.cwd(), 'assets/mods/zebra-relay-1.0.0.jar'),
  ];
  const srcJar = candidates.find((c) => fs.existsSync(c));

  if (srcJar && fs.existsSync(srcJar)) {
    fs.copyFileSync(srcJar, saveResult.filePath);
    shell.showItemInFolder(saveResult.filePath);
    return saveResult.filePath;
  }
  return null;
});

app.whenReady().then(async () => {
  createTray();
  createWindow();

  try {
    const servers = await serverManager.listAllServers();
    await runner.reconnectRunningServers(servers);
    const active = runner.getActiveServer();
    if (active) {
      updateTrayMenu(active);
    }
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let isFullyQuitting = false;

app.on('before-quit', async (event) => {
  if (isFullyQuitting) return;
  event.preventDefault();
  isFullyQuitting = true;
  (app as any).isQuitting = true;
  try {
    await runner.killAllRunningServers();
  } catch (err) {
    console.warn('[Zebra] Cleanup on quit encountered error:', err);
  }
  app.exit(0);
});

process.on('exit', () => {
  runner.killAllRunningServers();
});

process.on('SIGINT', async () => {
  await runner.killAllRunningServers();
  process.exit();
});

process.on('SIGTERM', async () => {
  await runner.killAllRunningServers();
  process.exit();
});

app.on('window-all-closed', () => {
  const settings = serverManager.getSettings();
  if (!settings.minimizeToTray) {
    if (process.platform !== 'darwin') app.quit();
  }
});
