import React, { useState, useEffect } from 'react';
import { Search, Download, Compass, Box, User, ArrowDownToLine, Loader2, CheckCircle2, Layers } from 'lucide-react';
import { ModpackInfo } from '../../electron/types';

export const ExploreTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'modrinth' | 'curseforge' | 'ftb' | 'technic'>('all');
  const [loaderFilter, setLoaderFilter] = useState<string>('all');
  const [modpacks, setModpacks] = useState<ModpackInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedId, setInstalledId] = useState<string | null>(null);

  const fetchModpacks = async (query = searchQuery, platform = platformFilter) => {
    setLoading(true);
    try {
      if (window.zebra) {
        const results = await window.zebra.searchModpacks(query, undefined, platform);
        setModpacks(results || []);
      }
    } catch (err) {
      console.error('Failed to search modpacks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModpacks('', 'all');
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchModpacks(searchQuery, platformFilter);
  };

  const handlePlatformChange = (newPlatform: 'all' | 'modrinth' | 'curseforge' | 'ftb' | 'technic') => {
    setPlatformFilter(newPlatform);
    fetchModpacks(searchQuery, newPlatform);
  };

  const handleInstall = async (pack: ModpackInfo) => {
    setInstallingId(pack.id);
    // Simulate install pipeline
    setTimeout(() => {
      setInstallingId(null);
      setInstalledId(pack.id);
      setTimeout(() => setInstalledId(null), 3000);
    }, 2000);
  };

  const filteredModpacks = modpacks.filter((pack) => {
    // Loader filter
    if (loaderFilter !== 'all' && !pack.loader.toLowerCase().includes(loaderFilter.toLowerCase())) {
      return false;
    }
    // Platform / source filter
    if (platformFilter !== 'all' && pack.source !== platformFilter) {
      return false;
    }
    return true;
  });

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

  const formatDownloads = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Top Banner & Search */}
      <div className="bg-gradient-to-r from-surface to-surface-hover/80 border border-surface-border rounded-2xl p-6 relative overflow-hidden">
        <div className="max-w-xl relative z-10">
          <div className="flex items-center gap-2 text-brand text-xs font-semibold uppercase tracking-wider mb-2">
            <Compass className="w-4 h-4" />
            <span>Discover & Host</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight mb-2">
            Browse Popular Modpacks & Clean Instances
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed mb-5">
            Discover community modpacks from Modrinth, CurseForge, FTB, and Technic. Launch and host them with 1-click zero configuration.
          </p>

          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search modpacks (e.g. Fabulously Optimized, All The Mods, Better MC)..."
                className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-700/60 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-brand/20 cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Platform & Loader Filter Rows */}
      <div className="space-y-3">
        {/* Platform Sources */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mr-1">Platform:</span>
          {[
            { id: 'all', label: 'All Sources' },
            { id: 'modrinth', label: 'Modrinth' },
            { id: 'curseforge', label: 'CurseForge' },
            { id: 'ftb', label: 'Feed The Beast (FTB)' },
            { id: 'technic', label: 'Technic / Tekkit' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => handlePlatformChange(item.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                platformFilter === item.id
                  ? 'bg-brand text-white shadow-sm shadow-brand/20'
                  : 'bg-surface hover:bg-surface-hover text-zinc-400 hover:text-zinc-200 border border-surface-border'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Loader Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 bg-surface p-1 rounded-xl border border-surface-border">
            {['all', 'fabric', 'forge', 'neoforge', 'quilt'].map((filter) => (
              <button
                key={filter}
                onClick={() => setLoaderFilter(filter)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                  loaderFilter === filter
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {filter === 'all' ? 'All Loaders' : filter}
              </button>
            ))}
          </div>

          <span className="text-xs text-zinc-500 font-mono">
            {filteredModpacks.length} Modpacks
          </span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
          <span className="text-xs">Searching catalog...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModpacks.map((pack) => (
            <div
              key={pack.id}
              className="bg-surface border border-surface-border rounded-2xl p-4 flex flex-col justify-between hover:border-zinc-700 hover:bg-surface-hover/50 transition-all duration-200 group"
            >
              <div>
                <div className="flex items-start gap-3.5 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex-shrink-0 overflow-hidden flex items-center justify-center shadow">
                    {pack.iconUrl ? (
                      <img src={pack.iconUrl} alt={pack.title} className="w-full h-full object-cover" />
                    ) : (
                      <Box className="w-6 h-6 text-zinc-600" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white text-sm truncate leading-snug group-hover:text-brand transition-colors">
                      {pack.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400 flex-wrap">
                      {renderPlatformBadge(pack.source)}
                      <span className="truncate flex items-center gap-1 max-w-[130px]">
                        <User className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span className="truncate">{pack.author}</span>
                      </span>
                      <span>•</span>
                      <span className="capitalize text-zinc-300 font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 shrink-0">
                        {pack.loader}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4">
                  {pack.summary}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-surface-border/60">
                <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>{formatDownloads(pack.downloads)}</span>
                </div>

                <button
                  onClick={() => handleInstall(pack)}
                  disabled={installingId === pack.id || installedId === pack.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    installedId === pack.id
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-zinc-800 hover:bg-brand hover:text-white text-zinc-200'
                  }`}
                >
                  {installingId === pack.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Installing...</span>
                    </>
                  ) : installedId === pack.id ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Ready</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Install</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
