import React, { useState, useEffect } from 'react';
import { Server, Settings, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ServerInstance } from '../../electron/types';
import zebraLogo from '../assets/zebra-logo.png';

interface SidebarProps {
  servers: ServerInstance[];
  selectedServer: ServerInstance | null;
  onSelectServer: (server: ServerInstance | null) => void;
  activeView: 'server' | 'settings';
  setActiveView: (view: 'server' | 'settings') => void;
  onOpenCreate: () => void;
  onDeleteServer?: (id: string) => void;
  activeServer: ServerInstance | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  servers,
  selectedServer,
  onSelectServer,
  activeView,
  setActiveView,
  onOpenCreate,
  onDeleteServer,
  activeServer,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('zebra_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('zebra_sidebar_collapsed', String(isCollapsed));
  }, [isCollapsed]);

  return (
    <aside
      className={`${
        isCollapsed ? 'w-[72px]' : 'w-64'
      } bg-surface/95 border-r border-surface-border flex flex-col justify-between select-none shrink-0 transition-none`}
    >
      <div className="p-3 space-y-3.5">
        {/* Zebra Branding & Collapse Button */}
        <div className="flex items-center justify-between px-1 py-1">
          <div
            className={`flex items-center gap-3 cursor-pointer ${
              isCollapsed ? 'mx-auto justify-center' : ''
            }`}
            onClick={() => isCollapsed && setIsCollapsed(false)}
            title="Zebra"
          >
            <img
              src={zebraLogo}
              alt="Zebra"
              className="w-8 h-8 object-contain select-none"
            />
            {!isCollapsed && (
              <span className="font-black text-lg tracking-wider text-white leading-tight select-none">
                ZEBRA
              </span>
            )}
          </div>

          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(true)}
              title="Collapse sidebar"
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors duration-100 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Primary Action Button (Create Server) */}
        <div>
          {isCollapsed ? (
            <button
              onClick={onOpenCreate}
              title="Create Server"
              className="w-10 h-10 mx-auto flex items-center justify-center bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl shadow-sm transition-colors duration-100 cursor-pointer"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          ) : (
            <button
              onClick={onOpenCreate}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-zinc-200 text-zinc-950 rounded-full text-xs font-bold shadow-sm transition-colors duration-100 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Server</span>
            </button>
          )}
        </div>

        {/* Managed Servers List */}
        <div className="pt-1">
          <div
            className={`px-2 mb-2 flex items-center ${
              isCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            {isCollapsed ? (
              <button
                onClick={() => setIsCollapsed(false)}
                title="Expand sidebar"
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">
                  Servers
                </span>
                {activeServer && activeServer.status === 'online' && (
                  <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5 max-h-[calc(100vh-240px)] overflow-y-auto pr-0.5">
            {servers.length === 0 ? (
              !isCollapsed && (
                <div className="px-3 py-6 text-center text-zinc-300 text-xs leading-relaxed border border-dashed border-zinc-800 rounded-2xl my-2">
                  No servers yet.<br />
                  Click <span className="text-white font-semibold">+ Create Server</span>
                </div>
              )
            ) : (
              servers.map((srv) => {
                const isSelected = selectedServer?.id === srv.id && activeView === 'server';
                const isRunning = srv.status === 'online';
                const isStarting = srv.status === 'starting';

                if (isCollapsed) {
                  return (
                    <div
                      key={srv.id}
                      onClick={() => {
                        onSelectServer(srv);
                        setActiveView('server');
                      }}
                      title={`${srv.name} (${srv.loader} ${srv.version})`}
                      className={`relative w-10 h-10 mx-auto rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-100 ${
                        isSelected
                          ? 'bg-zinc-800 border-2 border-white/40 shadow-sm text-white'
                          : 'bg-zinc-900/60 hover:bg-zinc-800 border border-white/5 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {srv.iconBase64 ? (
                        <img
                          src={srv.iconBase64}
                          alt=""
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <Server className="w-4 h-4" />
                      )}
                      {isRunning && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-950 animate-pulse" />
                      )}
                      {isStarting && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-zinc-950 animate-ping" />
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={srv.id}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium group border cursor-pointer transition-colors duration-100 ${
                      isSelected
                        ? 'bg-zinc-800/90 border-white/20 text-white shadow-sm'
                        : 'bg-zinc-900/40 hover:bg-zinc-800/60 border-transparent hover:border-white/10 text-zinc-300 hover:text-white'
                    }`}
                  >
                    <button
                      onClick={() => {
                        onSelectServer(srv);
                        setActiveView('server');
                      }}
                      className="flex items-center gap-2.5 truncate flex-1 text-left cursor-pointer"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors duration-100 overflow-hidden">
                          {srv.iconBase64 ? (
                            <img src={srv.iconBase64} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Server className="w-4 h-4" />
                          )}
                        </div>
                        {isRunning && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-zinc-900 animate-pulse" />
                        )}
                        {isStarting && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-zinc-900 animate-ping" />
                        )}
                      </div>
                      <div className="flex flex-col truncate min-w-0">
                        <span className="truncate font-semibold text-white leading-tight">
                          {srv.name}
                        </span>
                        <span className="text-[11px] text-zinc-300 font-mono mt-0.5 truncate">
                          {srv.loader} • {srv.version}
                        </span>
                      </div>
                    </button>

                    {onDeleteServer && !isRunning && !isStarting && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete server "${srv.name}" and all its files?`)) {
                            onDeleteServer(srv.id);
                          }
                        }}
                        title="Delete Server"
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-rose-400 transition-colors duration-100 rounded-lg hover:bg-zinc-700/50 cursor-pointer ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer Preferences */}
      <div className="p-3 border-t border-surface-border">
        {isCollapsed ? (
          <button
            onClick={() => setActiveView('settings')}
            title="App Preferences"
            className={`w-10 h-10 mx-auto flex items-center justify-center rounded-xl transition-colors duration-100 cursor-pointer ${
              activeView === 'settings'
                ? 'bg-zinc-800 text-white border border-white/20'
                : 'text-zinc-400 hover:text-white hover:bg-surface-hover'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setActiveView('settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors duration-100 cursor-pointer ${
              activeView === 'settings'
                ? 'bg-zinc-800 text-white shadow-sm border border-white/10'
                : 'text-zinc-300 hover:text-white hover:bg-surface-hover'
            }`}
          >
            <Settings className="w-4 h-4 text-zinc-400" />
            <span>App Preferences</span>
          </button>
        )}
      </div>
    </aside>
  );
};
