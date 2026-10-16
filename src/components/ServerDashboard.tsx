import React, { useState, useEffect } from 'react';
import {
  Globe,
  Radio,
  Copy,
  Check,
  Terminal,
  FolderOpen,
  Archive,
  Sliders,
  Server,
  Settings,
  Layers,
  Share2,
  Download,
} from 'lucide-react';
import { ServerInstance } from '../../electron/types';
import { ServerConsoleTab } from './ServerConsoleTab';
import { ServerConfigTab } from './ServerConfigTab';
import { ServerModsTab } from './ServerModsTab';
import { ServerFilesTab } from './ServerFilesTab';
import { ServerBackupsTab } from './ServerBackupsTab';
import { ServerSettingsTab } from './ServerSettingsTab';

interface ServerDashboardProps {
  server: ServerInstance;
  onStart: (server: ServerInstance) => void;
  onStop: (server: ServerInstance) => void;
  onRestart: (server: ServerInstance) => void;
  onKill: (server: ServerInstance) => void;
  onUpdateConfig: (id: string, update: any) => void;
  onDeleteServer?: (id: string) => void;
  logs: string[];
  onClearLogs: () => void;
  isStartingOrStopping: boolean;
}

export const ServerDashboard: React.FC<ServerDashboardProps> = ({
  server,
  onStart,
  onStop,
  onRestart,
  onKill,
  onUpdateConfig,
  onDeleteServer,
  logs,
  onClearLogs,
  isStartingOrStopping,
}) => {
  type DashboardTab = 'console' | 'config' | 'mods' | 'files' | 'backups' | 'settings';
  const isModded = server.loader !== 'Vanilla';

  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    const saved = localStorage.getItem('zebra_active_dashboard_tab');
    if (saved && ['console', 'config', 'mods', 'files', 'backups', 'settings'].includes(saved)) {
      return saved as DashboardTab;
    }
    return 'console';
  });

  useEffect(() => {
    if (activeTab === 'mods' && !isModded) {
      setActiveTab('console');
      return;
    }
    localStorage.setItem('zebra_active_dashboard_tab', activeTab);
  }, [activeTab, isModded]);

  const [copiedFriends, setCopiedFriends] = useState(false);
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [copiedE4mc, setCopiedE4mc] = useState(false);

  const isOnline = server.status === 'online';
  const isStarting = server.status === 'starting';
  const isStopping = server.status === 'stopping';

  const roomCode = server.roomCode || (server.name || 'zebra-server').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const friendsAddress = server.e4mcDomain || server.directIp;
  const hostAddress = `localhost:${server.port}`;

  const handleCopyRoom = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedRoom(true);
    setTimeout(() => setCopiedRoom(false), 2000);
  };

  const handleCopyE4mc = () => {
    if (!server.e4mcDomain) return;
    navigator.clipboard.writeText(server.e4mcDomain);
    setCopiedE4mc(true);
    setTimeout(() => setCopiedE4mc(false), 2000);
  };

  const handleCopyFriends = () => {
    if (!friendsAddress) return;
    navigator.clipboard.writeText(friendsAddress);
    setCopiedFriends(true);
    setTimeout(() => setCopiedFriends(false), 2000);
  };

  const handleCopyHost = () => {
    navigator.clipboard.writeText(hostAddress);
    setCopiedHost(true);
    setTimeout(() => setCopiedHost(false), 2000);
  };

  const [killMessage, setKillMessage] = useState<string | null>(null);

  const handleKillAll = async () => {
    if (!window.zebra) return;
    try {
      const count = await window.zebra.killAllServers();
      setKillMessage(`Cleared ${count} instance${count !== 1 ? 's' : ''}`);
      setTimeout(() => setKillMessage(null), 3000);
    } catch (e) {
      console.warn('Kill all failed:', e);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background animate-fade-in select-none">
      {/* Top Header: Apple Pro Studio Clean Layout */}
      <div className="p-5 px-6 border-b border-surface-border bg-surface/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        {/* Left: Server Identity */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden shadow-md flex-shrink-0">
            {server.iconBase64 ? (
              <img src={server.iconBase64} alt="" className="w-full h-full object-cover" />
            ) : (
              <Server className="w-5 h-5 text-zinc-400" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight leading-none">{server.name}</h1>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-white/10">
                {server.loader} {server.version}
              </span>
            </div>

            <div className="flex items-center gap-2.5 mt-1.5">
              {/* Status Badge */}
              {isOnline ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              ) : isStarting ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Starting...
                </span>
              ) : isStopping ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  Stopping...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 bg-zinc-800/80 px-2.5 py-0.5 rounded-full border border-white/5">
                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                  Offline
                </span>
              )}

              <button
                onClick={() => window.zebra?.openFolder(server.path)}
                title={`Open server folder in File Explorer (${server.path})`}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-white/5 transition-all text-xs font-mono cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
                <span>{server.id || (server.path ? server.path.split(/[/\\]/).filter(Boolean).pop() : 'srv-folder')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Join Address Pills & Clean Action Pill Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Active Room Code Pill */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-brand/30 px-3.5 py-1.5 rounded-full shadow-sm">
              <Share2 className="w-3.5 h-3.5 text-brand flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-400 font-medium">Room Code:</span>
                <span
                  className="text-xs font-mono font-bold text-white tracking-wide uppercase select-all"
                  title="Share this room code with friends"
                >
                  {roomCode}
                </span>
              </div>
              <button
                onClick={handleCopyRoom}
                title="Copy Room Code"
                className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-full text-[10px] transition-all cursor-pointer"
              >
                {copiedRoom ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* e4mc Global Fallback Link Pill */}
          {isOnline && server.e4mcDomain && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-zinc-900/90 border border-emerald-500/30 px-3.5 py-1.5 rounded-full shadow-sm">
                <Globe className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400 font-medium">e4mc Link:</span>
                  <span
                    className="text-xs font-mono font-medium text-emerald-300 select-all"
                    title="Guaranteed fallback connection link (zero port-forwarding)"
                  >
                    {server.e4mcDomain}
                  </span>
                </div>
                <button
                  onClick={handleCopyE4mc}
                  title="Copy e4mc Fallback Link"
                  className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-full text-[10px] transition-all cursor-pointer"
                >
                  {copiedE4mc ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}

          {/* Clean Apple Pill Buttons (No clunky square boxes) */}
          <div className="flex items-center gap-2">
            {!isOnline && !isStarting && !isStopping && (
              <>
                <button
                  onClick={() => onStart(server)}
                  disabled={isStartingOrStopping}
                  className="px-5 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-full text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                >
                  Start Server
                </button>

                <button
                  onClick={handleKillAll}
                  title="Force kill all background Java instances and release file locks"
                  className="px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-rose-300 rounded-full text-xs font-medium border border-white/5 active:scale-95 transition-all cursor-pointer"
                >
                  {killMessage || 'Kill All Instances'}
                </button>
              </>
            )}

            {(isOnline || isStarting) && (
              <>
                <button
                  onClick={() => onStop(server)}
                  disabled={isStopping}
                  className="px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-full text-xs font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                >
                  {isStopping ? 'Stopping...' : 'Stop Server'}
                </button>

                <button
                  onClick={() => onRestart(server)}
                  disabled={isStartingOrStopping}
                  className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-full text-xs font-medium border border-white/10 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                >
                  Restart
                </button>

                <button
                  onClick={() => onKill(server)}
                  title="Force Kill Process"
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-full text-xs font-medium border border-amber-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  Kill
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sub-Tabs Switcher */}
      <div className="px-6 border-b border-surface-border bg-surface/40 flex items-center gap-1">
        <button
          onClick={() => setActiveTab('console')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-all duration-200 cursor-pointer ${
            activeTab === 'console'
              ? 'border-white text-white font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Console</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-all duration-200 cursor-pointer ${
            activeTab === 'config'
              ? 'border-white text-white font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Config</span>
        </button>

        {/* Mods Tab: Only visible for modded servers */}
        {isModded && (
          <button
            onClick={() => setActiveTab('mods')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'mods'
                ? 'border-white text-white font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Mods</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-all duration-200 cursor-pointer ${
            activeTab === 'files'
              ? 'border-white text-white font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Files</span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-all duration-200 cursor-pointer ${
            activeTab === 'backups'
              ? 'border-white text-white font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Backups</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-all duration-200 cursor-pointer ${
            activeTab === 'settings'
              ? 'border-white text-white font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'console' && (
          <ServerConsoleTab server={server} logs={logs} onClearLogs={onClearLogs} />
        )}
        {activeTab === 'config' && (
          <ServerConfigTab server={server} onUpdateConfig={onUpdateConfig} />
        )}
        {activeTab === 'mods' && isModded && (
          <ServerModsTab server={server} />
        )}
        {activeTab === 'files' && <ServerFilesTab server={server} />}
        {activeTab === 'backups' && (
          <ServerBackupsTab server={server} onUpdateConfig={onUpdateConfig} />
        )}
        {activeTab === 'settings' && (
          <ServerSettingsTab
            server={server}
            onUpdateConfig={onUpdateConfig}
            onDeleteServer={onDeleteServer}
          />
        )}
      </div>
    </div>
  );
};
