import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ServerDashboard } from './components/ServerDashboard';
import { SettingsTab } from './components/SettingsTab';
import { CreateServerModal } from './components/CreateServerModal';
import { ServerInstance, ServerConfig, ModpackInfo } from '../electron/types';
import { Plus, Server, Sparkles } from 'lucide-react';
import zebraLogo from './assets/zebra-logo.png';

export const App: React.FC = () => {
  const [servers, setServers] = useState<ServerInstance[]>([]);
  const [selectedServer, setSelectedServer] = useState<ServerInstance | null>(null);
  const [activeServer, setActiveServer] = useState<ServerInstance | null>(null);
  const [activeView, setActiveView] = useState<'server' | 'settings'>(() => {
    const saved = localStorage.getItem('zebra_active_view');
    return saved === 'settings' ? 'settings' : 'server';
  });
  const [serverLogs, setServerLogs] = useState<Record<string, string[]>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [transitioningServers, setTransitioningServers] = useState<Set<string>>(new Set());

  // Keep activeView persisted across reloads
  useEffect(() => {
    localStorage.setItem('zebra_active_view', activeView);
  }, [activeView]);

  // Keep selectedServer persisted across reloads
  useEffect(() => {
    if (selectedServer) {
      localStorage.setItem('zebra_selected_server_id', selectedServer.id);
    }
  }, [selectedServer?.id]);

  // Load servers from ~/.zebra/servers/
  const loadServers = useCallback(async () => {
    if (!window.zebra) return;
    try {
      const list = await window.zebra.getServers();
      setServers(list);

      // Check active running server
      const active = await window.zebra.getActiveServer();
      setActiveServer(active);

      // Keep selected server updated or auto-select active / saved / first server
      setSelectedServer((prev) => {
        if (prev) {
          const found = list.find((s) => s.id === prev.id);
          if (found) return found;
        }
        const savedId = localStorage.getItem('zebra_selected_server_id');
        if (savedId) {
          const savedMatch = list.find((s) => s.id === savedId);
          if (savedMatch) return savedMatch;
        }
        if (active) {
          const matchingActive = list.find((s) => s.id === active.id);
          if (matchingActive) return matchingActive;
        }
        return list.length > 0 ? list[0] : null;
      });
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  }, []);

  // Fetch disk logs when selecting a server with no loaded logs yet
  useEffect(() => {
    if (selectedServer) {
      const srvId = selectedServer.id;
      if (!serverLogs[srvId] || serverLogs[srvId].length === 0) {
        window.zebra?.getServerLogs(selectedServer.path).then((diskLogs) => {
          if (diskLogs && diskLogs.length > 0) {
            setServerLogs((prev) => {
              if (prev[srvId] && prev[srvId].length > 0) return prev;
              return { ...prev, [srvId]: diskLogs };
            });
          }
        });
      }
    }
  }, [selectedServer?.id]);

  useEffect(() => {
    loadServers();

    if (window.zebra) {
      // Real-time server log streaming (per-server isolated)
      const unsubLog = window.zebra.onLog((line, logServerId) => {
        setServerLogs((prev) => {
          const targetId = logServerId || activeServer?.id || selectedServer?.id || 'default';
          const existing = prev[targetId] || [];
          return {
            ...prev,
            [targetId]: [...existing.slice(-1000), line],
          };
        });
      });

      // Real-time status & metric changes (CPU, RAM, players)
      const unsubStatus = window.zebra.onStatusChange((updatedServer) => {
        if (updatedServer.status === 'online' || updatedServer.status === 'offline') {
          setTransitioningServers((prev) => {
            const next = new Set(prev);
            next.delete(updatedServer.id);
            return next;
          });
        }

        setServers((prevList) =>
          prevList.map((s) => (s.id === updatedServer.id ? updatedServer : s))
        );

        setSelectedServer((prev) => {
          if (prev && prev.id === updatedServer.id) {
            return updatedServer;
          }
          return prev;
        });

        // Keep active server pointer updated
        window.zebra?.getActiveServer().then((active) => {
          setActiveServer(active);
        });
      });

      return () => {
        unsubLog();
        unsubStatus();
      };
    }
  }, [loadServers, activeServer?.id, selectedServer?.id]);

  const handleSelectServer = (server: ServerInstance | null) => {
    setSelectedServer(server);
    if (server) {
      localStorage.setItem('zebra_selected_server_id', server.id);
    }
    setActiveView('server');
  };

  const handleStartServer = async (server: ServerInstance) => {
    if (!window.zebra || transitioningServers.has(server.id)) return;

    setTransitioningServers((prev) => new Set(prev).add(server.id));

    const optimistic: ServerInstance = { ...server, status: 'starting' };
    setSelectedServer((prev) => (prev && prev.id === server.id ? optimistic : prev));
    setServers((prev) => prev.map((s) => (s.id === server.id ? optimistic : s)));

    try {
      const started = await window.zebra.startServer(server);
      setSelectedServer((prev) => (prev && prev.id === started.id ? started : prev));
      setServers((prev) => prev.map((s) => (s.id === started.id ? started : s)));
    } catch (err: any) {
      alert(`Failed to start server: ${err.message}`);
      loadServers();
    } finally {
      setTransitioningServers((prev) => {
        const next = new Set(prev);
        next.delete(server.id);
        return next;
      });
    }
  };

  const handleStopServer = async (server: ServerInstance) => {
    if (!window.zebra || transitioningServers.has(server.id)) return;

    setTransitioningServers((prev) => new Set(prev).add(server.id));

    const optimistic: ServerInstance = { ...server, status: 'stopping' };
    setSelectedServer((prev) => (prev && prev.id === server.id ? optimistic : prev));
    setServers((prev) => prev.map((s) => (s.id === server.id ? optimistic : s)));

    try {
      await window.zebra.stopServer(server.id);
    } catch (err: any) {
      alert(`Failed to stop server: ${err.message}`);
      loadServers();
    } finally {
      setTransitioningServers((prev) => {
        const next = new Set(prev);
        next.delete(server.id);
        return next;
      });
    }
  };

  const handleRestartServer = async (server: ServerInstance) => {
    if (!window.zebra || transitioningServers.has(server.id)) return;

    setTransitioningServers((prev) => new Set(prev).add(server.id));
    try {
      await window.zebra.stopServer(server.id);
      setTimeout(async () => {
        try {
          if (window.zebra) {
            await window.zebra.startServer(server);
          }
        } catch (e: any) {
          alert(`Restart start failed: ${e.message}`);
        } finally {
          setTransitioningServers((prev) => {
            const next = new Set(prev);
            next.delete(server.id);
            return next;
          });
        }
      }, 1500);
    } catch (err: any) {
      alert(`Restart failed: ${err.message}`);
      setTransitioningServers((prev) => {
        const next = new Set(prev);
        next.delete(server.id);
        return next;
      });
    }
  };

  const handleKillServer = async (server: ServerInstance) => {
    if (!window.zebra) return;
    try {
      await window.zebra.killServer(server.id);
      loadServers();
    } catch (err: any) {
      alert(`Force kill failed: ${err.message}`);
    }
  };

  const handleCreateServer = async (config: Partial<ServerConfig>) => {
    if (!window.zebra) return;
    try {
      const created = await window.zebra.createServer(config);
      await loadServers();
      setSelectedServer(created);
      setActiveView('server');
      await handleStartServer(created);
    } catch (err: any) {
      alert(`Failed to create server: ${err.message}`);
    }
  };

  const handleImportWorld = async (worldPath: string, name?: string) => {
    if (!window.zebra) return;
    try {
      const imported = await window.zebra.importWorld(worldPath, name);
      await loadServers();
      setSelectedServer(imported);
      setActiveView('server');
      await handleStartServer(imported);
    } catch (err: any) {
      alert(`Failed to import world: ${err.message}`);
    }
  };

  const handleInstallModpack = async (modpack: ModpackInfo, version: any) => {
    if (!window.zebra) return;
    try {
      const installed = await window.zebra.installModpack(modpack, version);
      await loadServers();
      setSelectedServer(installed);
      setActiveView('server');
      await handleStartServer(installed);
    } catch (err: any) {
      alert(`Failed to install modpack: ${err.message}`);
    }
  };

  const handleDeleteServer = async (id: string) => {
    if (!window.zebra) return;
    try {
      if (localStorage.getItem('zebra_selected_server_id') === id) {
        localStorage.removeItem('zebra_selected_server_id');
      }
      await window.zebra.deleteServer(id);
      await loadServers();
    } catch (err: any) {
      alert(`Failed to delete server: ${err.message}`);
    }
  };

  const handleUpdateConfig = async (id: string, update: Partial<ServerConfig>) => {
    if (!window.zebra) return;
    try {
      await window.zebra.updateServerConfig(id, update);
      await loadServers();
    } catch (err: any) {
      alert(`Failed to save configuration: ${err.message}`);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-zinc-100 font-sans antialiased">
      {/* Sleek Sidebar */}
      <Sidebar
        servers={servers}
        selectedServer={selectedServer}
        onSelectServer={handleSelectServer}
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenCreate={() => setIsCreateOpen(true)}
        onDeleteServer={handleDeleteServer}
        activeServer={activeServer}
      />

      {/* Main Server Panel */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {activeView === 'settings' ? (
          <SettingsTab onSettingsSaved={loadServers} />
        ) : selectedServer ? (
          <ServerDashboard
            server={selectedServer}
            onStart={handleStartServer}
            onStop={handleStopServer}
            onRestart={handleRestartServer}
            onKill={handleKillServer}
            onUpdateConfig={handleUpdateConfig}
            onDeleteServer={handleDeleteServer}
            logs={selectedServer ? (serverLogs[selectedServer.id] || []) : []}
            onClearLogs={() => {
              if (selectedServer) {
                setServerLogs((prev) => ({ ...prev, [selectedServer.id]: [] }));
              }
            }}
            isStartingOrStopping={selectedServer ? transitioningServers.has(selectedServer.id) : false}
          />
        ) : (
          /* Empty State - Zebra Card with Clean Plus */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background animate-fade-in">
            <div
              className="relative group cursor-pointer"
              onClick={() => setIsCreateOpen(true)}
            >
              <div className="w-24 h-24 rounded-3xl bg-zinc-900/90 border border-white/10 p-2 flex items-center justify-center shadow-2xl shadow-black/60 group-hover:border-white/25 group-hover:scale-105 transition-all duration-300">
                <img
                  src={zebraLogo}
                  alt="Zebra"
                  className="w-full h-full object-contain filter drop-shadow group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-brand/20 to-sky-500/20 opacity-30 blur-xl group-hover:opacity-60 transition-opacity duration-300 -z-10" />
            </div>

            <h3 className="text-xl font-bold text-white mt-6 tracking-tight">No Servers Created</h3>
            <p className="text-xs text-zinc-400 max-w-sm mt-1.5 leading-relaxed">
              Deploy a clean Vanilla, Fabric, or Paper server, browse popular modpacks, or import an existing world with one click.
            </p>

            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-6 flex items-center gap-2 px-6 py-3 bg-brand hover:bg-brand-hover active:bg-brand-active text-white rounded-2xl text-xs font-bold shadow-xl shadow-brand/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Your First Server</span>
            </button>
          </div>
        )}
      </main>

      {/* 3-in-1 Unified Creation Wizard */}
      <CreateServerModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateServer}
        onImportWorld={handleImportWorld}
        onInstallModpack={handleInstallModpack}
      />
    </div>
  );
};

export default App;
