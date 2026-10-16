import React, { useState, useEffect } from 'react';
import { Folder, File, ExternalLink, RefreshCw, FolderOpen, Box, X, Check, Save, Edit3, Copy } from 'lucide-react';
import { ServerInstance, FileItem } from '../../electron/types';

interface ServerFilesTabProps {
  server: ServerInstance;
}

export const ServerFilesTab: React.FC<ServerFilesTabProps> = ({ server }) => {
  const [currentPath, setCurrentPath] = useState(server.path);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedFile, setCopiedFile] = useState(false);

  const loadFiles = async (dirPath: string) => {
    setLoading(true);
    try {
      if (window.zebra) {
        const list = await window.zebra.listFiles(dirPath);
        setFiles(list);
        setCurrentPath(dirPath);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles(server.path);
  }, [server.path]);

  useEffect(() => {
    if (!editingFile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingFile(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingFile]);

  const handleOpenExplorer = () => {
    if (window.zebra) {
      window.zebra.openFolder(currentPath);
    }
  };

  const handleNavigate = (targetPath: string) => {
    loadFiles(targetPath);
  };

  const isEditable = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['properties', 'json', 'txt', 'yml', 'yaml', 'toml', 'log', 'cfg', 'mcmeta', 'ini', 'sh', 'bat', 'cmd'].includes(ext || '');
  };

  const handleFileClick = async (file: FileItem) => {
    if (file.isDirectory) {
      handleNavigate(file.path);
      return;
    }
    if (isEditable(file.name) && window.zebra) {
      const content = await window.zebra.readFileContent(file.path);
      if (content !== null) {
        setEditingFile({ path: file.path, name: file.name, content });
      }
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile || !window.zebra) return;
    setSavingFile(true);
    try {
      const success = await window.zebra.saveFileContent(editingFile.path, editingFile.content);
      if (success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } finally {
      setSavingFile(false);
    }
  };

  const handleCopyFileContent = () => {
    if (!editingFile) return;
    navigator.clipboard.writeText(editingFile.content);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  };

  const handleGoUp = () => {
    if (currentPath !== server.path) {
      const parent = currentPath.substring(0, currentPath.lastIndexOf('\\') || currentPath.lastIndexOf('/'));
      if (parent.startsWith(server.path)) {
        loadFiles(parent);
      } else {
        loadFiles(server.path);
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden space-y-4">
      {/* File Explorer Header */}
      <div className="bg-surface border border-surface-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-300 truncate">
          <FolderOpen className="w-4 h-4 text-brand flex-shrink-0" />
          <span className="truncate">{currentPath}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {currentPath !== server.path && (
            <button
              onClick={handleGoUp}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-all"
            >
              Back
            </button>
          )}

          <button
            onClick={() => loadFiles(currentPath)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-all"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              if (window.zebra) {
                const modsPath = `${server.path}\\mods`;
                window.zebra.openFolder(modsPath);
              }
            }}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 hover:text-white rounded-xl text-xs font-medium border border-cyan-500/20 transition-all flex items-center gap-1.5"
            title="Open mods directory to drag & drop mod jars"
          >
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mods Folder</span>
          </button>

          <button
            onClick={handleOpenExplorer}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-medium shadow-md shadow-brand/20 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in Explorer</span>
          </button>
        </div>
      </div>

      {/* Files List */}
      <div className="flex-1 bg-surface border border-surface-border rounded-2xl overflow-hidden flex flex-col shadow-xl">
        <div className="grid grid-cols-12 px-4 py-2.5 bg-zinc-900/90 border-b border-surface-border text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          <div className="col-span-7">Name</div>
          <div className="col-span-3 text-right">Size</div>
          <div className="col-span-2 text-right">Modified</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
          {files.length === 0 ? (
            <div className="text-center py-20 text-zinc-500 text-xs">
              This directory is empty
            </div>
          ) : (
            files.map((file) => {
              const editable = !file.isDirectory && isEditable(file.name);
              return (
                <div
                  key={file.name}
                  onClick={() => handleFileClick(file)}
                  className={`grid grid-cols-12 px-4 py-2.5 text-xs items-center transition-all ${
                    file.isDirectory || editable
                      ? 'cursor-pointer hover:bg-zinc-800/50 text-zinc-200'
                      : 'text-zinc-400 hover:bg-zinc-800/20'
                  }`}
                >
                  <div className="col-span-7 flex items-center gap-2.5 truncate">
                    {file.isDirectory ? (
                      <Folder className="w-4 h-4 text-brand flex-shrink-0" />
                    ) : file.name.endsWith('.jar') ? (
                      <Box className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    )}
                    <span className="truncate font-medium">{file.name}</span>
                    {editable && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-zinc-800 text-zinc-400 border border-white/5">
                        Edit
                      </span>
                    )}
                  </div>

                  <div className="col-span-3 text-right font-mono text-[11px] text-zinc-400">
                    {formatSize(file.sizeBytes)}
                  </div>

                  <div className="col-span-2 text-right font-mono text-[11px] text-zinc-500">
                    {new Date(file.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* In-App File Editor Modal */}
      {editingFile && (
        <div
          onClick={() => setEditingFile(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fade-in cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border border-surface-border w-full max-w-4xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl cursor-default"
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-zinc-900/90 border-b border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <Edit3 className="w-4 h-4 text-brand flex-shrink-0" />
                <span className="text-sm font-semibold text-white truncate">{editingFile.name}</span>
                <span className="text-[11px] font-mono text-zinc-400 truncate hidden md:inline">({editingFile.path})</span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleCopyFileContent}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Copy file content to clipboard"
                >
                  {copiedFile ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFile ? 'Copied!' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveFile}
                  disabled={savingFile}
                  className="px-4 py-1.5 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  {saveSuccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{saveSuccess ? 'Saved!' : savingFile ? 'Saving...' : 'Save File'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingFile(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-all cursor-pointer"
                  title="Close editor"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Monospace Textarea */}
            <div className="flex-1 bg-zinc-950 p-4 overflow-hidden flex flex-col">
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                spellCheck={false}
                className="flex-1 w-full h-full bg-transparent text-zinc-100 font-mono text-xs leading-relaxed resize-none focus:outline-none select-text p-2"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
