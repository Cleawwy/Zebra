import { contextBridge, ipcRenderer } from 'electron';
import { ServerConfig, ServerInstance, BackupInfo, FileItem, AppSettings, ModpackInfo, WorldInfo, ModItem } from './types';

export const zebraApi = {
  // Server Management
  getServers: (): Promise<ServerInstance[]> => ipcRenderer.invoke('servers:get-all'),
  createServer: (config: Partial<ServerConfig>): Promise<ServerInstance> =>
    ipcRenderer.invoke('servers:create', config),
  importWorld: (worldPath: string, name?: string): Promise<ServerInstance> =>
    ipcRenderer.invoke('servers:import', worldPath, name),
  updateServerConfig: (id: string, update: Partial<ServerConfig>): Promise<boolean> =>
    ipcRenderer.invoke('servers:update-config', id, update),
  uploadServerIcon: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('servers:upload-icon', id),
  deleteServer: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('servers:delete', id),
  startServer: (server: ServerInstance): Promise<ServerInstance> =>
    ipcRenderer.invoke('servers:start', server),
  stopServer: (serverId?: string): Promise<void> => ipcRenderer.invoke('servers:stop', serverId),
  killServer: (serverId?: string): Promise<void> => ipcRenderer.invoke('servers:kill', serverId),
  killAllServers: (): Promise<number> => ipcRenderer.invoke('servers:kill-all'),
  getActiveServer: (serverId?: string): Promise<ServerInstance | null> => ipcRenderer.invoke('servers:active', serverId),
  getActiveServers: (): Promise<ServerInstance[]> => ipcRenderer.invoke('servers:get-active-all'),
  getServerLogs: (serverPath: string): Promise<string[]> => ipcRenderer.invoke('servers:get-logs', serverPath),
  sendCommand: (input: string, serverId?: string): Promise<void> => ipcRenderer.invoke('servers:command', input, serverId),
  exportMod: (serverId?: string): Promise<string | null> => ipcRenderer.invoke('servers:export-mod', serverId),

  // Backups
  listBackups: (serverPath: string): Promise<BackupInfo[]> =>
    ipcRenderer.invoke('backups:list', serverPath),
  createBackup: (serverPath: string): Promise<BackupInfo> =>
    ipcRenderer.invoke('backups:create', serverPath),
  restoreBackup: (serverPath: string, backupPath: string): Promise<boolean> =>
    ipcRenderer.invoke('backups:restore', serverPath, backupPath),
  deleteBackup: (backupPath: string): Promise<boolean> =>
    ipcRenderer.invoke('backups:delete', backupPath),

  // Mods Management
  listMods: (serverPath: string): Promise<ModItem[]> =>
    ipcRenderer.invoke('mods:list', serverPath),
  toggleMod: (serverPath: string, fileName: string): Promise<boolean> =>
    ipcRenderer.invoke('mods:toggle', serverPath, fileName),
  deleteMod: (serverPath: string, fileName: string): Promise<boolean> =>
    ipcRenderer.invoke('mods:delete', serverPath, fileName),
  uploadMods: (serverPath: string): Promise<number> =>
    ipcRenderer.invoke('mods:upload', serverPath),

  // File & Explorer Operations
  listFiles: (targetDir: string): Promise<FileItem[]> =>
    ipcRenderer.invoke('files:list', targetDir),
  readFileContent: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('files:read-content', filePath),
  saveFileContent: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('files:save-content', filePath, content),
  getLatestCrashReport: (serverPath: string): Promise<{ fileName: string; content: string } | null> =>
    ipcRenderer.invoke('servers:get-latest-crash', serverPath),
  openFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-folder', folderPath),
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-dir'),
  selectFile: (filters?: any): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-file', filters),

  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:save', settings),

  // Versions (Mojang Manifest)
  getVersions: (includeSnapshots?: boolean): Promise<{ latestRelease: string; latestSnapshot: string; releases: string[]; snapshots: string[] }> =>
    ipcRenderer.invoke('versions:get-all', includeSnapshots),

  // Modpack Catalog & Provisioner
  searchModpacks: (query: string, version?: string, platform?: 'all' | 'modrinth' | 'curseforge' | 'ftb' | 'technic'): Promise<ModpackInfo[]> =>
    ipcRenderer.invoke('modpacks:search', query, version, platform),
  getModpackVersions: (projectId: string): Promise<any[]> =>
    ipcRenderer.invoke('modpacks:versions', projectId),
  installModpack: (modpack: ModpackInfo, version: any): Promise<ServerInstance> =>
    ipcRenderer.invoke('modpacks:install', modpack, version),

  // Singleplayer Scan (Used inside Wizard)
  scanSingleplayerWorlds: (): Promise<WorldInfo[]> =>
    ipcRenderer.invoke('worlds:scan'),

  // Event Listeners
  onLog: (callback: (line: string, serverId?: string) => void) => {
    const handler = (_event: any, line: string, serverId?: string) => callback(line, serverId);
    ipcRenderer.on('server:log', handler);
    return () => ipcRenderer.removeListener('server:log', handler);
  },
  onStatusChange: (callback: (server: ServerInstance) => void) => {
    const handler = (_event: any, srv: ServerInstance) => callback(srv);
    ipcRenderer.on('server:status-change', handler);
    return () => ipcRenderer.removeListener('server:status-change', handler);
  },
};

contextBridge.exposeInMainWorld('zebra', zebraApi);
