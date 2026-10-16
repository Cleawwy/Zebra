import React, { useState } from 'react';
import { Plus, FolderInput, Server, Play, Square, Users, HardDrive, ArrowRight, Search, Zap, RotateCw } from 'lucide-react';
import { ServerInstance } from '../../electron/types';

interface ServerListProps {
  servers: ServerInstance[];
  onSelectServer: (server: ServerInstance) => void;
  onOpenCreate: () => void;
  onOpenImport: () => void;
  onStartServer: (server: ServerInstance) => void;
  onStopServer: () => void;
  activeServer: ServerInstance | null;
  isStartingOrStopping: boolean;
}

export const ServerList: React.FC<ServerListProps> = ({
  servers,
  onSelectServer,
  onOpenCreate,
  onOpenImport,
  onStartServer,
  onStopServer,
  activeServer,
  isStartingOrStopping,
}) => {
  const [search, setSearch] = useState('');

  const filtered = servers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.version.toLowerCase().includes(search.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Minecraft Servers</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage, configure, and host your local worlds and dedicated instances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search servers..."
              className="pl-9 pr-3 py-1.5 bg-surface border border-surface-border rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand"
            />
          </div>

          <button
            onClick={onOpenImport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-all"
          >
            <FolderInput className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>

          <button
            onClick={onOpenCreate}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-semibold shadow-md shadow-brand/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Server</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-zinc-800 rounded-3xl min-h-[360px]">
          <Server className="w-12 h-12 text-zinc-600 mb-3" />
          <h3 className="text-base font-semibold text-zinc-200">No Servers Found</h3>
          <p className="text-xs text-zinc-400 max-w-sm mt-1 leading-relaxed">
            Create a clean server instance (Vanilla, Fabric, Paper) or import a singleplayer world to get started.
          </p>
          <div className="flex gap-3 mt-5">
            <button
              onClick={onOpenCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-semibold shadow-md shadow-brand/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Server</span>
            </button>
            <button
              onClick={onOpenImport}
              className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-all"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>Import Singleplayer World</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((srv) => {
            const isOnline = srv.status === 'online';
            const isStarting = srv.status === 'starting';

            return (
              <div
                key={srv.id}
                className={`bg-surface border rounded-2xl p-5 flex flex-col justify-between hover:bg-surface-hover/60 transition-all duration-200 group ${
                  isOnline
                    ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/5'
                    : 'border-surface-border'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {srv.iconBase64 ? (
                          <img src={srv.iconBase64} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Server className="w-5 h-5 text-zinc-500" />
                        )}
                      </div>

                      <div className="truncate">
                        <h3 className="font-semibold text-sm text-white truncate tracking-tight group-hover:text-brand transition-colors">
                          {srv.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-brand/30 bg-brand/10 text-brand">
                            {srv.loader} {srv.version}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill */}
                    {isOnline ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Online
                      </span>
                    ) : isStarting ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                        Starting
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full">
                        Offline
                      </span>
                    )}
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-4 text-[11px] text-zinc-400 py-2 border-t border-b border-surface-border/60">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{srv.activePlayers.length} / {srv.maxPlayers}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{formatSize(srv.sizeBytes)}</span>
                    </div>

                    <span className="text-zinc-600 font-mono text-[10px] truncate">
                      Port: {srv.port}
                    </span>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-4 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onSelectServer(srv)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-medium transition-all"
                  >
                    <span>Manage</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {isOnline ? (
                    <button
                      onClick={onStopServer}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold transition-all flex items-center gap-1"
                    >
                      <Square className="w-3 h-3 fill-rose-400" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onStartServer(srv)}
                      disabled={isStartingOrStopping || (activeServer !== null && activeServer.status === 'online')}
                      className="px-3.5 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-semibold shadow-md shadow-brand/20 transition-all disabled:opacity-30 disabled:hover:bg-brand flex items-center gap-1"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Start</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
