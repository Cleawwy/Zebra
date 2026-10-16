import React, { useState, useEffect } from 'react';
import { X, Play, ChevronDown, ChevronUp, Cpu, Network, Shield, Sliders, Check } from 'lucide-react';
import { WorldInfo, WorldHostConfig } from '../../electron/types';

interface HostDrawerProps {
  world: WorldInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onHost: (world: WorldInfo, config: WorldHostConfig) => void;
  isHosting: boolean;
}

export const HostDrawer: React.FC<HostDrawerProps> = ({
  world,
  isOpen,
  onClose,
  onHost,
  isHosting,
}) => {
  if (!isOpen || !world) return null;

  // Primary Easy Configurations
  const [gamemode, setGamemode] = useState<WorldHostConfig['gamemode']>(world.gameType || 'survival');
  const [difficulty, setDifficulty] = useState<WorldHostConfig['difficulty']>('normal');
  const [allowCheats, setAllowCheats] = useState<boolean>(world.cheatsEnabled ?? false);
  const [pvp, setPvp] = useState<boolean>(true);

  // RAM configuration
  const [ramMode, setRamMode] = useState<'auto' | 'custom'>('auto');
  const [maxRamGb, setMaxRamGb] = useState<number>(6);
  const [minRamGb, setMinRamGb] = useState<number>(2);

  // Advanced dropdown state
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [port, setPort] = useState<number>(25565);
  const [maxPlayers, setMaxPlayers] = useState<number>(20);
  const [simulationDistance, setSimulationDistance] = useState<number>(8);
  const [viewDistance, setViewDistance] = useState<number>(12);
  const [enableUpnp, setEnableUpnp] = useState<boolean>(true);
  const [enableE4mc, setEnableE4mc] = useState<boolean>(true);
  const [onlineMode, setOnlineMode] = useState<boolean>(true);

  const handleStart = () => {
    const config: WorldHostConfig = {
      worldId: world.id,
      port,
      maxPlayers,
      ramMode,
      maxRamGb,
      minRamGb,
      gamemode,
      difficulty,
      allowCheats,
      pvp,
      onlineMode,
      simulationDistance,
      viewDistance,
      enableUpnp,
      enableE4mc,
    };
    onHost(world, config);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface border-l border-surface-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 cursor-default"
      >
        {/* Header */}
        <div className="p-6 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
              {world.iconBase64 ? (
                <img src={world.iconBase64} alt="" className="w-full h-full object-cover" />
              ) : (
                <Sliders className="w-5 h-5 text-zinc-500" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">{world.name}</h2>
              <span className="text-xs text-zinc-400">
                {world.loader} {world.version} • {world.instanceName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-surface-hover transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Game Settings */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-3">
              World Mode & Rules
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1.5 font-medium">Game Mode</label>
                <select
                  value={gamemode}
                  onChange={(e) => setGamemode(e.target.value as any)}
                  className="w-full bg-surface-hover border border-surface-border rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand"
                >
                  <option value="survival">Survival</option>
                  <option value="creative">Creative</option>
                  <option value="adventure">Adventure</option>
                  <option value="spectator">Spectator</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1.5 font-medium">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full bg-surface-hover border border-surface-border rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand"
                >
                  <option value="peaceful">Peaceful</option>
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowCheats}
                  onChange={(e) => setAllowCheats(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Allow Cheats (/commands)
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pvp}
                  onChange={(e) => setPvp(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Player vs Player (PvP)
              </label>
            </div>
          </div>

          {/* Memory Management (Default: Automatic) */}
          <div className="bg-surface-hover/50 p-4 rounded-xl border border-surface-border">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-brand" />
              <span className="text-xs font-semibold text-zinc-200">Memory & Resource Allocation</span>
            </div>

            <div className="space-y-2 mt-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="ramMode"
                  checked={ramMode === 'auto'}
                  onChange={() => setRamMode('auto')}
                  className="mt-0.5 text-brand focus:ring-0"
                />
                <div>
                  <span className="text-xs font-medium text-zinc-200 block">Automatic (Recommended)</span>
                  <span className="text-[11px] text-zinc-400 leading-relaxed block">
                    Dynamically manages memory based on connected players, leaving your computer smooth and responsive.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="radio"
                  name="ramMode"
                  checked={ramMode === 'custom'}
                  onChange={() => setRamMode('custom')}
                  className="mt-0.5 text-brand focus:ring-0"
                />
                <div>
                  <span className="text-xs font-medium text-zinc-200 block">Custom Allocation</span>
                  <span className="text-[11px] text-zinc-400 leading-relaxed block">
                    Manually specify minimum and maximum RAM limits.
                  </span>
                </div>
              </label>
            </div>

            {ramMode === 'custom' && (
              <div className="mt-4 pt-4 border-t border-surface-border space-y-3 animate-in fade-in duration-150">
                <div>
                  <div className="flex justify-between text-xs text-zinc-300 mb-1">
                    <span>Max Memory (Xmx)</span>
                    <span className="font-mono font-medium text-brand">{maxRamGb} GB</span>
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
                    <span>Initial Memory (Xms)</span>
                    <span className="font-mono font-medium text-brand">{minRamGb} GB</span>
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

          {/* Collapsible Advanced Settings */}
          <div className="border border-surface-border rounded-xl overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-4 bg-surface-hover/30 hover:bg-surface-hover/70 flex items-center justify-between text-xs font-medium text-zinc-300 transition-all"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                <span>Advanced Settings (Port, Distance, Network)</span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              )}
            </button>

            {showAdvanced && (
              <div className="p-4 space-y-4 bg-zinc-900/30 border-t border-surface-border animate-in fade-in duration-150">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Server Port</label>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      className="w-full bg-surface-hover border border-surface-border rounded-xl px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Max Players</label>
                    <input
                      type="number"
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                      className="w-full bg-surface-hover border border-surface-border rounded-xl px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Simulation Distance</span>
                    <span className="font-mono text-zinc-300">{simulationDistance} chunks</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="16"
                    value={simulationDistance}
                    onChange={(e) => setSimulationDistance(Number(e.target.value))}
                    className="w-full accent-brand"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>View Distance</span>
                    <span className="font-mono text-zinc-300">{viewDistance} chunks</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="24"
                    value={viewDistance}
                    onChange={(e) => setViewDistance(Number(e.target.value))}
                    className="w-full accent-brand"
                  />
                </div>

                <div className="pt-2 border-t border-surface-border/60 space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-zinc-200">Zebra Relay P2P Matchmaker</div>
                        <div className="text-[11px] text-zinc-400">Direct P2P via Google STUN & UPnP (e4mc Fallback)</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-semibold">
                      ACTIVE
                    </span>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlineMode}
                      onChange={(e) => setOnlineMode(e.target.checked)}
                      className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                    />
                    Require Mojang Online Authentication
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Launch Button */}
        <div className="p-6 border-t border-surface-border bg-surface/80">
          <button
            onClick={handleStart}
            disabled={isHosting}
            className="w-full py-3 bg-brand hover:bg-brand-hover text-white rounded-xl font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand/20 transition-all disabled:opacity-40"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Launch & Host World</span>
          </button>
        </div>
      </div>
    </div>
  );
};
