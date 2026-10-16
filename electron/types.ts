export interface AdvancedEngineSettings {
  fastRedstone?: boolean;
  entityTickSkipping?: boolean;
  unloadSpawnChunks?: boolean;
  asyncPathfinding?: boolean;
  networkCompression?: number;
  jvmGcEngine?: 'G1GC' | 'ZGC' | 'Shenandoah';
}

export interface ServerConfig {
  id: string;
  name: string;
  version: string;
  loader: 'Vanilla' | 'Fabric' | 'Paper' | 'Forge' | 'NeoForge' | 'Quilt';
  loaderVersion?: string;
  port: number;
  maxPlayers: number;
  ramMode: 'auto' | 'custom';
  maxRamGb: number;
  minRamGb: number;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  allowCheats: boolean;
  pvp: boolean;
  onlineMode: boolean;
  hardcore?: boolean;
  allowFlight?: boolean;
  whiteList?: boolean;
  spawnProtection?: number;
  simulationDistance: number;
  viewDistance: number;
  enableUpnp?: boolean;
  enableE4mc?: boolean;
  autoBackup: boolean;
  roomCode?: string;
  motd?: string;
  gameRules?: Record<string, boolean | number | string>;
  sourceInstance?: string; // If linked to an existing singleplayer instance
  worldSourcePath?: string;
  customJavaPath?: string;
  advancedEngineSettings?: AdvancedEngineSettings;
}

export interface ServerInstance extends ServerConfig {
  path: string;
  status: 'offline' | 'starting' | 'online' | 'stopping';
  sizeBytes: number;
  lastPlayed?: number;
  directIp?: string;
  e4mcDomain?: string;
  activePlayers: string[];
  cpuPercent: number;
  memoryUsedMb: number;
  iconBase64?: string;
  driveTotalBytes?: number;
  driveFreeBytes?: number;
}

export interface BackupInfo {
  fileName: string;
  filePath: string;
  timestamp: number;
  sizeBytes: number;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  updatedAt: number;
}

export interface ModItem {
  fileName: string;
  name: string;
  enabled: boolean;
  sizeBytes: number;
  updatedAt: number;
}

export interface ModpackInfo {
  id: string;
  title: string;
  summary: string;
  iconUrl: string;
  author: string;
  downloads: number;
  latestVersion: string;
  supportedMcVersions: string[];
  loader: string;
  source: 'modrinth' | 'curseforge' | 'ftb' | 'technic';
}

export interface AppSettings {
  serversRootPath: string;
  scanSingleplayerSaves: boolean;
  minimizeToTray: boolean;
  defaultRamMode: 'auto' | 'custom';
  defaultMaxRamGb: number;
  defaultUpnp: boolean;
  defaultE4mc: boolean;
  // Professional Network Preferences
  signalingHost?: string;
  signalingPort?: number;
  stunPort?: number;
  p2pHolePunching?: boolean;
  loopbackBypass?: boolean;
  relayMode?: 'auto' | 'relay_only' | 'p2p_only';
  hostInstanceId?: string;
}

export interface WorldInfo {
  id: string;
  name: string;
  folderName: string;
  path: string;
  version: string;
  versionName?: string;
  gameVersion?: string;
  loader: 'Vanilla' | 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt' | 'Unknown';
  lastPlayed: number;
  sizeBytes: number;
  iconBase64?: string;
  gameType: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
  cheatsEnabled: boolean;
  instanceType: 'vanilla' | 'curseforge' | 'modrinth' | 'prism' | 'custom';
  instanceName: string;
}

export interface WorldHostConfig {
  worldId: string;
  port: number;
  maxPlayers: number;
  ramMode: 'auto' | 'custom';
  maxRamGb: number;
  minRamGb: number;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  allowCheats: boolean;
  pvp: boolean;
  onlineMode: boolean;
  simulationDistance: number;
  viewDistance: number;
  enableUpnp: boolean;
  enableE4mc: boolean;
}

export interface HostStatus {
  serverId: string;
  worldName: string;
  port: number;
  roomCode?: string;
  directIp?: string;
  e4mcDomain?: string;
  activePlayers: string[];
  maxPlayers: number;
  startTime: number;
}
