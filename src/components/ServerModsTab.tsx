import React, { useState, useEffect } from 'react';
import { Upload, FolderOpen, Trash2, Search, RefreshCw, Layers, CheckCircle2, XCircle } from 'lucide-react';
import { ServerInstance, ModItem } from '../../electron/types';

interface ServerModsTabProps {
  server: ServerInstance;
}

export const ServerModsTab: React.FC<ServerModsTabProps> = ({ server }) => {
  const [mods, setMods] = useState<ModItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchMods = async () => {
    if (!window.zebra) return;
    setLoading(true);
    try {
      const list = await window.zebra.listMods(server.path);
      setMods(list);
    } catch (err) {
      console.error('Failed to load mods:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMods();
  }, [server.path]);

  const handleUpload = async () => {
    if (!window.zebra) return;
    try {
      const count = await window.zebra.uploadMods(server.path);
      if (count > 0) {
        showFeedback(`Successfully added ${count} mod${count > 1 ? 's' : ''}`);
        await fetchMods();
      }
    } catch (err) {
      console.error('Failed to upload mods:', err);
    }
  };

  const handleToggle = async (mod: ModItem) => {
    if (!window.zebra) return;
    try {
      await window.zebra.toggleMod(server.path, mod.fileName);
      await fetchMods();
    } catch (err) {
      console.error('Failed to toggle mod:', err);
    }
  };

  const handleDelete = async (mod: ModItem) => {
    if (!window.zebra) return;
    if (!window.confirm(`Are you sure you want to delete ${mod.name}?`)) return;
    try {
      await window.zebra.deleteMod(server.path, mod.fileName);
      showFeedback(`Deleted ${mod.name}`);
      await fetchMods();
    } catch (err) {
      console.error('Failed to delete mod:', err);
    }
  };

  const handleOpenFolder = () => {
    if (!window.zebra) return;
    const modsPath = `${server.path}/mods`.replace(/\//g, '\\');
    window.zebra.openFolder(modsPath);
  };

  const showFeedback = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 3000);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredMods = mods.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const enabledCount = mods.filter((m) => m.enabled).length;

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      {/* Header and Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-5 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-white tracking-tight">Installed Mods</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-200 border border-white/10">
              {enabledCount} / {mods.length} Active
            </span>
          </div>
          <p className="text-xs text-zinc-300 mt-1">
            Manage, toggle, or install mods for your {server.loader} server.
          </p>
        </div>

        {/* Action Pills */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {actionMessage && (
            <span className="text-xs text-emerald-400 font-medium px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-fade-in">
              {actionMessage}
            </span>
          )}

          <button
            onClick={handleUpload}
            className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-full text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-950" />
            <span>Upload Mods</span>
          </button>

          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-full text-xs font-medium border border-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            <span>Open Folder</span>
          </button>

          <button
            onClick={fetchMods}
            title="Refresh mods list"
            className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-full border border-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mods by name or filename..."
            className="w-full bg-zinc-900/80 border border-white/10 rounded-full pl-10 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all font-medium"
          />
        </div>
      </div>

      {/* Mods List Table */}
      <div className="flex-1 bg-surface border border-surface-border rounded-2xl overflow-hidden flex flex-col shadow-lg">
        {loading && mods.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-400">
            <RefreshCw className="w-7 h-7 animate-spin mb-2 text-zinc-400" />
            <span className="text-xs font-medium">Scanning mods directory...</span>
          </div>
        ) : filteredMods.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center mb-3 text-zinc-400">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">
              {searchQuery ? 'No matching mods found' : 'No mods installed yet'}
            </h3>
            <p className="text-xs text-zinc-300 max-w-sm mb-4">
              {searchQuery
                ? `Try adjusting your search query "${searchQuery}"`
                : 'Click "Upload Mods" or drag and drop .jar files into the mods folder to add them to your server.'}
            </p>
            {!searchQuery && (
              <button
                onClick={handleUpload}
                className="flex items-center gap-1.5 px-4 py-2 bg-white text-zinc-950 rounded-full text-xs font-semibold shadow hover:bg-zinc-200 active:scale-95 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload .jar Mods</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {filteredMods.map((mod) => (
              <div
                key={mod.fileName}
                className={`flex items-center justify-between p-3.5 px-4 transition-colors hover:bg-surface-hover ${
                  !mod.enabled ? 'opacity-60 bg-zinc-950/20' : ''
                }`}
              >
                {/* Mod Info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Status Toggle Switch (Apple Style) */}
                  <button
                    onClick={() => handleToggle(mod)}
                    title={mod.enabled ? 'Click to disable mod' : 'Click to enable mod'}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mod.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        mod.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white truncate">
                        {mod.name}
                      </span>
                      {!mod.enabled && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-white/5">
                          Disabled
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-300 font-mono truncate mt-0.5">
                      {mod.fileName} • {formatSize(mod.sizeBytes)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleDelete(mod)}
                    title="Delete mod file"
                    className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
