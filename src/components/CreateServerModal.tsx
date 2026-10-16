import React, { useState, useEffect } from 'react';
import { X, Plus, Box, Layers, Zap, Check, Compass, FolderInput, Search, Loader2, HardDrive, Download, Globe } from 'lucide-react';
import { ServerConfig, ModpackInfo, WorldInfo } from '../../electron/types';
import zebraLogo from '../assets/zebra-logo.png';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (config: Partial<ServerConfig>) => void;
  onImportWorld: (worldPath: string, name?: string) => void;
  onInstallModpack: (modpack: ModpackInfo, version: any) => Promise<void>;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  onImportWorld,
  onInstallModpack,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'custom' | 'modpack' | 'import'>('custom');

  // Custom tab state
  const [name, setName] = useState('My Minecraft Server');
  const [loader, setLoader] = useState<ServerConfig['loader']>('Vanilla');
  const [version, setVersion] = useState('26.3');
  const [versionSearch, setVersionSearch] = useState('');
  const [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [availableReleases, setAvailableReleases] = useState<string[]>([]);
  const [availableSnapshots, setAvailableSnapshots] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [gamemode, setGamemode] = useState<ServerConfig['gamemode']>('survival');
  const [difficulty, setDifficulty] = useState<ServerConfig['difficulty']>('normal');
  const [fabricLoaders, setFabricLoaders] = useState<string[]>([]);
  const [selectedFabricLoader, setSelectedFabricLoader] = useState<string>('');

  // Fetch fabric loader versions when Fabric is selected
  useEffect(() => {
    if (loader === 'Fabric' && version) {
      fetch(`https://meta.fabricmc.net/v2/versions/loader/${version}`)
        .then((r) => r.json())
        .then((data: any[]) => {
          if (Array.isArray(data) && data.length > 0) {
            const list = data.map((d) => d.loader.version);
            setFabricLoaders(list);
            setSelectedFabricLoader(list[0]);
          } else {
            setFabricLoaders(['0.16.10', '0.16.9', '0.16.7']);
            setSelectedFabricLoader('0.16.10');
          }
        })
        .catch(() => {
          setFabricLoaders(['0.16.10', '0.16.9', '0.16.7']);
          setSelectedFabricLoader('0.16.10');
        });
    }
  }, [loader, version]);

  // Modpack tab state
  const [modpackQuery, setModpackQuery] = useState('');
  const [modpackPlatform, setModpackPlatform] = useState<'all' | 'modrinth' | 'curseforge' | 'ftb' | 'technic'>('all');
  const [modpacks, setModpacks] = useState<ModpackInfo[]>([]);
  const [loadingModpacks, setLoadingModpacks] = useState(false);
  const [selectedModpack, setSelectedModpack] = useState<ModpackInfo | null>(null);
  const [modpackVersions, setModpackVersions] = useState<any[]>([]);
  const [selectedModpackVersion, setSelectedModpackVersion] = useState<any | null>(null);
  const [loadingModpackVersions, setLoadingModpackVersions] = useState(false);
  const [installingModpack, setInstallingModpack] = useState(false);

  // Import world tab state
  const [detectedWorlds, setDetectedWorlds] = useState<WorldInfo[]>([]);
  const [loadingWorlds, setLoadingWorlds] = useState(false);
  const [selectedWorld, setSelectedWorld] = useState<WorldInfo | null>(null);

  // Load Mojang versions on mount
  useEffect(() => {
    if (!window.zebra) return;
    setLoadingVersions(true);
    window.zebra
      .getVersions()
      .then((res) => {
        setAvailableReleases(res.releases || ['26.3', '1.21.4', '1.21.1', '1.20.1']);
        setAvailableSnapshots(res.snapshots || []);
        if (res.latestRelease) setVersion(res.latestRelease);
      })
      .catch((err) => console.warn('Could not load versions:', err))
      .finally(() => setLoadingVersions(false));
  }, []);

  // Search modpacks when tab active, query changes, or platform tab clicked
  useEffect(() => {
    if (activeTab === 'modpack' && window.zebra) {
      setLoadingModpacks(true);
      const timer = setTimeout(() => {
        window.zebra
          .searchModpacks(modpackQuery, undefined, modpackPlatform)
          .then((packs) => {
            setModpacks(packs);
            setLoadingModpacks(false);
          })
          .catch(() => setLoadingModpacks(false));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, modpackQuery, modpackPlatform]);

  // Load detected worlds when import tab active
  useEffect(() => {
    if (activeTab === 'import' && window.zebra) {
      setLoadingWorlds(true);
      window.zebra
        .scanSingleplayerWorlds()
        .then((worlds) => {
          setDetectedWorlds(worlds);
          setLoadingWorlds(false);
        })
        .catch(() => setLoadingWorlds(false));
    }
  }, [activeTab]);

  // When a modpack is clicked, fetch its version list
  const handleSelectModpack = async (pack: ModpackInfo) => {
    setSelectedModpack(pack);
    setSelectedModpackVersion(null);
    if (!window.zebra) return;
    setLoadingModpackVersions(true);
    try {
      const vers = await window.zebra.getModpackVersions(pack.id);
      setModpackVersions(vers);
      if (vers.length > 0) setSelectedModpackVersion(vers[0]);
    } catch (e) {
      console.warn('Failed to get modpack versions:', e);
    } finally {
      setLoadingModpackVersions(false);
    }
  };

  const handleInstallModpack = async () => {
    if (!selectedModpack || !selectedModpackVersion) return;
    setInstallingModpack(true);
    try {
      await onInstallModpack(selectedModpack, selectedModpackVersion);
      onClose();
    } catch (err: any) {
      alert(`Modpack install failed: ${err.message}`);
    } finally {
      setInstallingModpack(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name,
      loader,
      version,
      loaderVersion: loader === 'Fabric' ? selectedFabricLoader : undefined,
      gamemode,
      difficulty,
      allowCheats: true,
      port: 25565,
      spawnProtection: 0,
    });
    onClose();
  };

  const handleBrowseCustomWorld = async () => {
    if (!window.zebra) return;
    const selected = await window.zebra.selectDirectory();
    if (selected) {
      onImportWorld(selected);
      onClose();
    }
  };

  const filteredVersions = (includeSnapshots
    ? [...availableReleases, ...availableSnapshots]
    : availableReleases
  ).filter((v) => v.toLowerCase().includes(versionSearch.toLowerCase()));

  const renderPlatformBadge = (source: string) => {
    switch (source) {
      case 'curseforge':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            CurseForge
          </span>
        );
      case 'ftb':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
            FTB
          </span>
        );
      case 'technic':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
            Technic
          </span>
        );
      case 'modrinth':
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            Modrinth
          </span>
        );
    }
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-surface/95 border border-white/10 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[90vh] animate-scale-in cursor-default"
      >
        {/* Header */}
        <div className="p-5 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Plus className="w-5 h-5 text-white stroke-[2.5]" />
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Create Server</h2>
              <p className="text-xs text-zinc-400">Deploy custom software, modpack catalogs, or import a world</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-all cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 border-b border-surface-border bg-zinc-900/60 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'custom'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Box className="w-3.5 h-3.5 text-brand" />
            <span>Vanilla & Modded</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('modpack')}
            className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'modpack'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            <span>Modpacks Catalog</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'import'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <FolderInput className="w-3.5 h-3.5 text-emerald-400" />
            <span>Import World</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: Custom Vanilla & Modded */}
          {activeTab === 'custom' && (
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1.5">Server Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Survival SMP, Modded World..."
                  className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                />
              </div>

              {/* Software */}
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1.5">Server Software</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'Vanilla', label: 'Vanilla', desc: 'Official Mojang' },
                    { id: 'Fabric', label: 'Fabric', desc: 'High Mod Support' },
                    { id: 'Paper', label: 'Paper', desc: 'Fast Plugins' },
                    { id: 'NeoForge', label: 'NeoForge', desc: 'Modern Forge' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLoader(item.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        loader === item.id
                          ? 'bg-brand/10 border-brand text-brand ring-1 ring-brand'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800/40'
                      }`}
                    >
                      <span className="text-xs font-bold block">{item.label}</span>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Version Selector (With 26.x, search, and snapshots) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-zinc-300 font-medium">Minecraft Version</label>
                  <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeSnapshots}
                      onChange={(e) => setIncludeSnapshots(e.target.checked)}
                      className="rounded bg-zinc-800 border-zinc-700 text-brand focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>Show Snapshots</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={versionSearch}
                      onChange={(e) => setVersionSearch(e.target.value)}
                      placeholder="Filter versions (e.g. 26.3, 1.21.4, 24w...)"
                      className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl pl-8 pr-3.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-brand"
                    />
                  </div>

                  <select
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-brand max-h-32"
                  >
                    {filteredVersions.map((v) => (
                      <option key={v} value={v}>
                        Minecraft {v} {v === '26.3' ? '(Latest Release)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loader === 'Fabric' && (
                <div>
                  <label className="text-xs text-zinc-300 font-medium block mb-1.5">Fabric Loader Version</label>
                  <select
                    value={selectedFabricLoader}
                    onChange={(e) => setSelectedFabricLoader(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-brand"
                  >
                    {fabricLoaders.map((fl) => (
                      <option key={fl} value={fl}>
                        Fabric Loader {fl}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Initial Gamemode & Difficulty */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs text-zinc-300 font-medium block mb-1.5">Game Mode</label>
                  <select
                    value={gamemode}
                    onChange={(e) => setGamemode(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                  >
                    <option value="survival">Survival</option>
                    <option value="creative">Creative</option>
                    <option value="adventure">Adventure</option>
                    <option value="spectator">Spectator</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-300 font-medium block mb-1.5">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                  >
                    <option value="peaceful">Peaceful</option>
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-4 border-t border-surface-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-semibold shadow-md shadow-brand/20 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Server</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Modpack Catalog */}
          {activeTab === 'modpack' && (
            <div className="space-y-4">
              {/* Platform Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[
                  { id: 'all', label: 'All Sources' },
                  { id: 'modrinth', label: 'Modrinth' },
                  { id: 'curseforge', label: 'CurseForge' },
                  { id: 'ftb', label: 'FTB' },
                  { id: 'technic', label: 'Technic' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setModpackPlatform(item.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                      modpackPlatform === item.id
                        ? 'bg-brand text-white shadow-sm'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={modpackQuery}
                  onChange={(e) => setModpackQuery(e.target.value)}
                  placeholder="Search modpacks (e.g. Fabulously Optimized, All The Mods, Better MC)..."
                  className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl pl-9 pr-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                />
              </div>

              {/* Modpack Selection View */}
              {selectedModpack ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {selectedModpack.iconUrl && (
                        <img src={selectedModpack.iconUrl} alt="" className="w-12 h-12 rounded-xl object-cover bg-zinc-800" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">{selectedModpack.title}</h3>
                          {renderPlatformBadge(selectedModpack.source)}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">by {selectedModpack.author} • {selectedModpack.loader}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedModpack(null)}
                      className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 bg-zinc-800 rounded-lg"
                    >
                      Back to Search
                    </button>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{selectedModpack.summary}</p>

                  {/* Version Picker */}
                  <div>
                    <label className="text-xs text-zinc-300 font-medium block mb-1.5">Select Modpack Version</label>
                    {loadingModpackVersions ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-brand" />
                        <span>Loading versions...</span>
                      </div>
                    ) : (
                      <select
                        value={selectedModpackVersion?.id || ''}
                        onChange={(e) => {
                          const found = modpackVersions.find((v) => v.id === e.target.value);
                          setSelectedModpackVersion(found || null);
                        }}
                        className="w-full bg-zinc-950 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-brand"
                      >
                        {modpackVersions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name || v.versionNumber} (MC {v.gameVersions?.join(', ') || 'Unknown'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedModpack(null)}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!selectedModpackVersion || installingModpack}
                      onClick={handleInstallModpack}
                      className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-semibold shadow-md shadow-brand/20 transition-all flex items-center gap-2 disabled:opacity-40"
                    >
                      {installingModpack ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Installing Modpack...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Install & Create Server</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Grid of Modpacks */
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {loadingModpacks ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin text-brand" />
                      <span>Browsing modpacks...</span>
                    </div>
                  ) : modpacks.filter((pack) => {
                      if (modpackPlatform === 'all') return true;
                      return pack.source === modpackPlatform;
                    }).length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-xs">
                      No modpacks found matching "{modpackQuery}" in {modpackPlatform === 'all' ? 'catalog' : modpackPlatform}
                    </div>
                  ) : (
                    modpacks.filter((pack) => {
                      if (modpackPlatform === 'all') return true;
                      return pack.source === modpackPlatform;
                    }).map((pack) => (
                      <div
                        key={pack.id}
                        onClick={() => handleSelectModpack(pack)}
                        className="bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {pack.iconUrl ? (
                            <img src={pack.iconUrl} alt="" className="w-10 h-10 rounded-xl object-cover bg-zinc-800 flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-500">
                              <Compass className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-zinc-200 group-hover:text-white truncate">{pack.title}</h4>
                            <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">{pack.summary}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              {renderPlatformBadge(pack.source)}
                              <span className="text-[10px] text-zinc-500 truncate">
                                {pack.author} • {pack.downloads.toLocaleString()} downloads • {pack.loader}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button className="px-3 py-1.5 bg-brand/10 hover:bg-brand text-brand hover:text-white rounded-lg text-xs font-semibold transition-all flex-shrink-0 ml-3">
                          Select
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Import Singleplayer World */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 p-3.5 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-white">Manual World Directory</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Select any Minecraft world folder from any drive on your PC.</p>
                </div>
                <button
                  onClick={handleBrowseCustomWorld}
                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5"
                >
                  <HardDrive className="w-3.5 h-3.5 text-brand" />
                  <span>Browse Folder...</span>
                </button>
              </div>

              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">
                  Detected Local Worlds
                </span>

                {loadingWorlds ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
                    <Loader2 className="w-5 h-5 animate-spin text-brand" />
                    <span>Scanning Minecraft saves...</span>
                  </div>
                ) : detectedWorlds.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500 text-xs">
                    No singleplayer worlds detected in standard locations.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {detectedWorlds.map((w) => (
                      <div
                        key={w.id}
                        onClick={() => setSelectedWorld(w)}
                        className={`bg-zinc-900/60 hover:bg-zinc-800/80 border rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all ${
                          selectedWorld?.id === w.id ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {w.iconBase64 ? (
                            <img src={w.iconBase64} alt="" className="w-10 h-10 rounded-xl object-cover bg-zinc-800 flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-500">
                              <FolderInput className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-zinc-200 truncate">
                              {w.name}
                              {w.path.split(/[/\\]/).pop() !== w.name && (
                                <span className="text-[10px] text-zinc-400 font-normal ml-1.5 font-mono">
                                  ({w.path.split(/[/\\]/).pop()})
                                </span>
                              )}
                            </h4>
                            <span className="text-[10px] text-zinc-500 block font-mono truncate">
                              {w.instanceName} • MC {w.version} • {w.loader}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onImportWorld(w.path, w.name);
                            onClose();
                          }}
                          className="px-3 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex-shrink-0 ml-3"
                        >
                          Import & Create
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
