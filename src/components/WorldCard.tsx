import React from 'react';
import { Play, Settings, Box, HardDrive, Clock, ShieldCheck, Flame } from 'lucide-react';
import { WorldInfo } from '../../electron/types';

interface WorldCardProps {
  world: WorldInfo;
  isHosted: boolean;
  onHost: (world: WorldInfo) => void;
  onConfigure: (world: WorldInfo) => void;
  isHostingAny: boolean;
}

export const WorldCard: React.FC<WorldCardProps> = ({
  world,
  isHosted,
  onHost,
  onConfigure,
  isHostingAny,
}) => {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatLastPlayed = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 5) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getLoaderColor = (loader: WorldInfo['loader']) => {
    switch (loader) {
      case 'Fabric':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'Forge':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'NeoForge':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700/50';
    }
  };

  return (
    <div
      className={`group relative bg-surface border rounded-2xl p-4 transition-all duration-200 hover:bg-surface-hover ${
        isHosted
          ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/30'
          : 'border-surface-border hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* World Icon */}
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex-shrink-0 relative flex items-center justify-center shadow-md">
          {world.iconBase64 ? (
            <img
              src={world.iconBase64}
              alt={world.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Box className="w-8 h-8 text-zinc-600" />
          )}

          {isHosted && (
            <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-zinc-900" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm text-zinc-100 truncate tracking-tight">
              {world.name}
            </h3>
            {world.cheatsEnabled && (
              <span title="Cheats enabled" className="text-zinc-500">
                <Flame className="w-3 h-3 text-amber-500/70" />
              </span>
            )}
          </div>

          {/* Instance and Version Badges */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${getLoaderColor(
                world.loader
              )}`}
            >
              {world.loader} {world.version}
            </span>

            <span className="text-[10px] text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded-md border border-zinc-800/80 truncate max-w-[140px]">
              {world.instanceName}
            </span>
          </div>

          {/* Metadata Footer */}
          <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-medium">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatLastPlayed(world.lastPlayed)}</span>
            </div>
            <div className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              <span>{formatSize(world.sizeBytes)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 pt-3 border-t border-surface-border/60 flex items-center justify-between">
        <button
          onClick={() => onConfigure(world)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-xl transition-all"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Configure</span>
        </button>

        {isHosted ? (
          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Online
          </span>
        ) : (
          <button
            onClick={() => onHost(world)}
            disabled={isHostingAny}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-brand hover:bg-brand-hover text-white rounded-xl shadow-md shadow-brand/20 transition-all disabled:opacity-40 disabled:hover:bg-brand"
          >
            <Play className="w-3 h-3 fill-white" />
            <span>Host World</span>
          </button>
        )}
      </div>
    </div>
  );
};
