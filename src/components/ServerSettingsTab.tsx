import React, { useState } from 'react';
import {
  Cpu,
  Save,
  Check,
  FolderOpen,
  Archive,
  Trash2,
  RefreshCw,
  AlertTriangle,
  HardDrive,
  Sliders,
  Share2,
  Download,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { ServerInstance } from '../../electron/types';

interface ServerSettingsTabProps {
  server: ServerInstance;
  onUpdateConfig: (id: string, update: any) => void;
  onDeleteServer?: (id: string) => void;
}

export const ServerSettingsTab: React.FC<ServerSettingsTabProps> = ({
  server,
  onUpdateConfig,
  onDeleteServer,
}) => {
  // Memory
  const [ramMode, setRamMode] = useState<'auto' | 'custom'>(server.ramMode);
  const [maxRamGb, setMaxRamGb] = useState(server.maxRamGb);
  const [minRamGb, setMinRamGb] = useState(server.minRamGb);

  // Networking & Zebra Connect
  const defaultRoom = server.roomCode || (server.name || 'zebra-server').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const [roomCode, setRoomCode] = useState(defaultRoom);
  const [port, setPort] = useState(server.port);
  const [onlineMode, setOnlineMode] = useState(server.onlineMode);
  const [enableUpnp, setEnableUpnp] = useState(server.enableUpnp ?? true);
  const [enableE4mc, setEnableE4mc] = useState(server.enableE4mc ?? true);

  // Mod Export State
  const [exportingMod, setExportingMod] = useState(false);
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  // Automation
  const [autoBackup, setAutoBackup] = useState(server.autoBackup ?? false);

  // Advanced Engine & Performance Tweaks (Collapsible)
  const [showAdvancedTweaks, setShowAdvancedTweaks] = useState(false);
  const [fastRedstone, setFastRedstone] = useState(server.advancedEngineSettings?.fastRedstone ?? false);
  const [entityTickSkipping, setEntityTickSkipping] = useState(server.advancedEngineSettings?.entityTickSkipping ?? false);
  const [unloadSpawnChunks, setUnloadSpawnChunks] = useState(server.advancedEngineSettings?.unloadSpawnChunks ?? false);
  const [asyncPathfinding, setAsyncPathfinding] = useState(server.advancedEngineSettings?.asyncPathfinding ?? false);
  const [networkCompression, setNetworkCompression] = useState<number>(server.advancedEngineSettings?.networkCompression ?? 512);
  const [jvmGcEngine, setJvmGcEngine] = useState<'G1GC' | 'ZGC' | 'Shenandoah'>(server.advancedEngineSettings?.jvmGcEngine ?? 'G1GC');

  const [saved, setSaved] = useState(false);

  const handleExportMod = async () => {
    if (!window.zebra?.exportMod) return;
    setExportingMod(true);
    try {
      const res = await window.zebra.exportMod(server.id);
      if (res) {
        setExportedPath(res);
        setTimeout(() => setExportedPath(null), 5000);
      }
    } catch (e) {
      console.warn('Export mod failed:', e);
    } finally {
      setExportingMod(false);
    }
  };

  const handleSave = () => {
    onUpdateConfig(server.id, {
      ramMode,
      maxRamGb,
      minRamGb,
      port,
      roomCode: roomCode.trim().toLowerCase(),
      onlineMode,
      enableUpnp,
      enableE4mc,
      autoBackup,
      advancedEngineSettings: {
        fastRedstone,
        entityTickSkipping,
        unloadSpawnChunks,
        asyncPathfinding,
        networkCompression,
        jvmGcEngine,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleOpenFolder = () => {
    if (window.zebra) {
      window.zebra.openFolder(server.path);
    }
  };

  const handleOpenModsFolder = () => {
    if (window.zebra) {
      window.zebra.openFolder(`${server.path}\\mods`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto space-y-6">
      {/* Title & Save Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Server Settings & Infrastructure</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure JVM memory allocation, network tunneling, storage location, and engine automation.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 rounded-full text-xs font-semibold shadow-md transition-all cursor-pointer"
        >
          {saved ? <Check className="w-4 h-4 text-zinc-950" /> : <Save className="w-4 h-4 text-zinc-950" />}
          <span>{saved ? 'Saved!' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Memory Allocation */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-brand" />
          <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Memory Allocation (RAM)</h3>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="setRamMode"
              checked={ramMode === 'auto'}
              onChange={() => setRamMode('auto')}
              className="mt-0.5 text-brand focus:ring-0"
            />
            <div>
              <span className="text-xs font-medium text-white block">Automatic Dynamic Scaling (Recommended)</span>
              <span className="text-[11px] text-zinc-400">
                Scales RAM dynamically as players explore and chunks load, keeping the host desktop fluid and responsive.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="setRamMode"
              checked={ramMode === 'custom'}
              onChange={() => setRamMode('custom')}
              className="mt-0.5 text-brand focus:ring-0"
            />
            <div>
              <span className="text-xs font-medium text-white block">Custom Allocation Limits</span>
              <span className="text-[11px] text-zinc-400">
                Manually allocate fixed minimum (-Xms) and maximum (-Xmx) memory bounds.
              </span>
            </div>
          </label>
        </div>

        {ramMode === 'custom' && (
          <div className="pt-4 border-t border-surface-border space-y-4 animate-fade-in">
            <div>
              <div className="flex justify-between text-xs text-zinc-300 mb-1">
                <span>Maximum Memory (-Xmx)</span>
                <span className="font-mono font-bold text-brand">{maxRamGb} GB</span>
              </div>
              <input
                type="range"
                min="2"
                max="32"
                value={maxRamGb}
                onChange={(e) => setMaxRamGb(Number(e.target.value))}
                className="w-full accent-brand"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-zinc-300 mb-1">
                <span>Initial Memory (-Xms)</span>
                <span className="font-mono font-bold text-brand">{minRamGb} GB</span>
              </div>
              <input
                type="range"
                min="1"
                max={maxRamGb}
                value={minRamGb}
                onChange={(e) => setMinRamGb(Number(e.target.value))}
                className="w-full accent-brand"
              />
            </div>
          </div>
        )}
      </div>

      {/* Zebra Relay P2P Network */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-brand" />
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Zebra Relay P2P Network</h3>
          </div>
          <button
            type="button"
            onClick={handleExportMod}
            disabled={exportingMod}
            title="Export the universal Zebra Relay client mod (.jar) to share with friends"
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand rounded-full text-xs font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportingMod ? 'Choosing Location...' : 'Export Universal Mod (.jar)'}</span>
          </button>
        </div>

        {exportedPath && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between animate-fade-in">
            <span className="truncate pr-2">Universal Zebra Relay companion mod exported successfully!</span>
            <button
              onClick={() => window.zebra?.openFolder(exportedPath)}
              className="underline text-emerald-200 hover:text-white cursor-pointer text-[11px] shrink-0"
            >
              Show in Folder
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Room Code (P2P Connect ID)</label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="e.g. survival-craft"
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-brand"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Friends enter this room name directly in Minecraft without typing raw IPs.
            </p>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Local Server Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-brand"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Internal port on 127.0.0.1 bound by this Minecraft server instance.
            </p>
          </div>
        </div>

        <div className="pt-2 space-y-2.5">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={enableE4mc}
              onChange={(e) => setEnableE4mc(e.target.checked)}
              className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            <span>Enable e4mc Global Cloud Tunnel (Zero-config fallback for strict NAT/CGNAT firewalls)</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={enableUpnp}
              onChange={(e) => setEnableUpnp(e.target.checked)}
              className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            <span>Enable Automatic UPnP Router Port Forwarding</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={onlineMode}
              onChange={(e) => setOnlineMode(e.target.checked)}
              className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            <span>Enforce Mojang Online Account Authentication (online-mode=true)</span>
          </label>
        </div>
      </div>

      {/* Advanced Performance & Engine Tweaks (Collapsible) */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <div>
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                Advanced Engine & Performance Tweaks
              </h3>
              <p className="text-[11px] text-zinc-400">
                Optional low-level engine modifications for maximum TPS. Note: some tweaks alter vanilla mechanics.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedTweaks(!showAdvancedTweaks)}
            className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <span>{showAdvancedTweaks ? 'Hide Tweaks' : 'Show Tweaks'}</span>
            {showAdvancedTweaks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showAdvancedTweaks && (
          <div className="pt-3 border-t border-surface-border space-y-4 animate-in fade-in duration-150">
            {/* 1. Fast Redstone Engine */}
            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fastRedstone}
                    onChange={(e) => setFastRedstone(e.target.checked)}
                    className="rounded bg-surface-hover border-zinc-700 text-amber-500 focus:ring-0"
                  />
                  <span>Alternative Fast Redstone (Alternate Current / EigenCraft)</span>
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-500/30 font-semibold">
                  Alters Quasi-Connectivity
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed pl-5">
                Replaces quadratic vanilla redstone recalculation with a 10x-20x faster DAG graph algorithm. Drastically stabilizes TPS on complex worlds, but alters vanilla piston update order and BUD switches.
              </p>
            </div>

            {/* 2. Inactive Entity Tick Skipping */}
            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={entityTickSkipping}
                    onChange={(e) => setEntityTickSkipping(e.target.checked)}
                    className="rounded bg-surface-hover border-zinc-700 text-amber-500 focus:ring-0"
                  />
                  <span>Aggressive Inactive Entity Tick Skipping</span>
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-500/30 font-semibold">
                  Can Pause Distant Mobs
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed pl-5">
                Skips movement and AI logic for entities boxed in pens or far away from players. Dramatically lowers entity lag on large automated mob farms.
              </p>
            </div>

            {/* 3. Unload Persistent Spawn Chunks */}
            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unloadSpawnChunks}
                    onChange={(e) => setUnloadSpawnChunks(e.target.checked)}
                    className="rounded bg-surface-hover border-zinc-700 text-amber-500 focus:ring-0"
                  />
                  <span>Unload Persistent World Spawn Chunks</span>
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-500/30 font-semibold">
                  Pauses Empty Spawn Farms
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed pl-5">
                Unloads the 19x19 chunk area around world spawn when no players are nearby. Saves 250MB–450MB of RAM, but automated iron or wither rose farms located at spawn will pause when empty.
              </p>
            </div>

            {/* 4. Async Pathfinding Multi-threading */}
            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asyncPathfinding}
                    onChange={(e) => setAsyncPathfinding(e.target.checked)}
                    className="rounded bg-surface-hover border-zinc-700 text-amber-500 focus:ring-0"
                  />
                  <span>Async Pathfinding Multi-Threading</span>
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                  Experimental
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed pl-5">
                Calculates complex mob pathfinding and navigation across background worker threads instead of stalling the primary server tick thread.
              </p>
            </div>

            {/* 5. Garbage Collection & Network Compression */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs text-zinc-300 font-semibold block mb-1">JVM Garbage Collector Engine</label>
                <select
                  value={jvmGcEngine}
                  onChange={(e) => setJvmGcEngine(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand"
                >
                  <option value="G1GC">G1GC (Balanced & Rock Solid - Recommended)</option>
                  <option value="ZGC">ZGC (Ultra-Low Latency Generational on Java 21+)</option>
                  <option value="Shenandoah">Shenandoah (Ultra-Low Pause Collector)</option>
                </select>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Generational ZGC delivers sub-millisecond GC pauses for lag-free chunk generation.
                </p>
              </div>

              <div>
                <label className="text-xs text-zinc-300 font-semibold block mb-1">Packet Compression Threshold</label>
                <select
                  value={networkCompression}
                  onChange={(e) => setNetworkCompression(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand"
                >
                  <option value={512}>512 bytes (Standard Balanced)</option>
                  <option value={256}>256 bytes (Vanilla Strict)</option>
                  <option value={-1}>Disabled (-1: Zero CPU compression, lowest ping)</option>
                </select>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Setting to -1 disables CPU packet compression overhead for 0ms LAN play.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Storage & Directories */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-brand" />
          <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Storage & Files</h3>
        </div>

        <div className="flex items-center justify-between bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
          <div className="truncate min-w-0 mr-4">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest block font-bold">Instance Path</span>
            <span className="text-xs font-mono text-zinc-300 truncate block mt-0.5">{server.path}</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleOpenFolder}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Open Folder</span>
            </button>
            <button
              onClick={handleOpenModsFolder}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 rounded-xl text-xs font-semibold border border-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Mods</span>
            </button>
          </div>
        </div>

        <div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoBackup}
              onChange={(e) => setAutoBackup(e.target.checked)}
              className="mt-0.5 rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            <div>
              <span className="text-xs font-bold text-zinc-200 block">Automatic Pre-launch Snapshot</span>
              <span className="text-[11px] text-zinc-400">
                Creates a compressed backup zip of world and configs every time the server starts.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Danger Zone */}
      {onDeleteServer && (
        <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">Danger Zone</h3>
          </div>
          <p className="text-xs text-zinc-400">
            Permanently delete this server instance, world files, and all associated configuration. This cannot be undone.
          </p>
          <button
            onClick={() => {
              if (window.confirm(`Are you completely sure you want to delete server "${server.name}"?`)) {
                onDeleteServer(server.id);
              }
            }}
            disabled={server.status === 'online'}
            className="px-4 py-2 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Server Permanently</span>
          </button>
        </div>
      )}
    </div>
  );
};
