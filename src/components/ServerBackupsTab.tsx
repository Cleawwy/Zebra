import React, { useState, useEffect } from 'react';
import { Archive, Plus, RotateCcw, Clock, HardDrive, Check, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { ServerInstance, BackupInfo } from '../../electron/types';

interface ServerBackupsTabProps {
  server: ServerInstance;
  onUpdateConfig: (id: string, update: any) => void;
}

export const ServerBackupsTab: React.FC<ServerBackupsTabProps> = ({ server, onUpdateConfig }) => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadBackups = async () => {
    setLoading(true);
    try {
      if (window.zebra) {
        const list = await window.zebra.listBackups(server.path);
        setBackups(list);
      }
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, [server.path]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      if (window.zebra) {
        await window.zebra.createBackup(server.path);
        await loadBackups();
      }
    } catch (err) {
      console.error('Failed to create backup:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (backup: BackupInfo) => {
    const confirm = window.confirm(`Restore world from ${backup.fileName}? Current world data will be replaced.`);
    if (!confirm) return;

    setRestoring(backup.fileName);
    try {
      if (window.zebra) {
        await window.zebra.restoreBackup(server.path, backup.filePath);
        alert('Backup restored successfully!');
      }
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(null);
    }
  };

  const handleDeleteBackup = async (backup: BackupInfo) => {
    const confirm = window.confirm(`Permanently delete backup "${backup.fileName}"? This cannot be undone.`);
    if (!confirm) return;

    setDeleting(backup.fileName);
    try {
      if (window.zebra) {
        await window.zebra.deleteBackup(backup.filePath);
        await loadBackups();
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden space-y-6">
      {/* Top Banner */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand/10 text-brand">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">World Snapshots & Backups</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Protect your builds, inventories, and maps before friends connect.
            </p>
          </div>
        </div>

        <button
          onClick={handleCreateBackup}
          disabled={creating || server.status === 'online'}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-semibold shadow-md shadow-brand/20 transition-all disabled:opacity-40"
        >
          {creating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Backing up...</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Create Backup Now</span>
            </>
          )}
        </button>
      </div>

      {/* Auto Backup Toggle */}
      <div className="bg-surface/60 border border-surface-border rounded-xl p-4 flex items-center justify-between">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={server.autoBackup}
            onChange={(e) => onUpdateConfig(server.id, { autoBackup: e.target.checked })}
            className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
          />
          <div>
            <span className="text-xs font-medium text-zinc-200 block">
              Auto-Backup Before Server Start
            </span>
            <span className="text-[11px] text-zinc-400">
              Automatically creates a snapshot of the world every time you hit Start.
            </span>
          </div>
        </label>
      </div>

      {/* Backups List */}
      <div className="flex-1 bg-surface border border-surface-border rounded-2xl overflow-hidden flex flex-col shadow-xl">
        <div className="px-4 py-3 bg-zinc-900/90 border-b border-surface-border text-xs font-semibold text-zinc-300">
          Saved Backups ({backups.length})
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {backups.length === 0 ? (
            <div className="text-center py-20 text-zinc-500 text-xs leading-relaxed">
              No backups created for this server yet.<br />
              Click "Create Backup Now" to create your first snapshot.
            </div>
          ) : (
            backups.map((backup) => (
              <div
                key={backup.fileName}
                className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex items-center justify-between hover:border-zinc-700 transition-all"
              >
                <div className="flex items-center gap-3">
                  <Archive className="w-4 h-4 text-brand" />
                  <div>
                    <span className="text-xs font-semibold text-zinc-200 block font-mono">
                      {backup.fileName}
                    </span>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(backup.timestamp).toLocaleString()}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {formatSize(backup.sizeBytes)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(backup)}
                    disabled={restoring === backup.fileName || deleting === backup.fileName || server.status === 'online'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {restoring === backup.fileName ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Restoring...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleDeleteBackup(backup)}
                    disabled={restoring === backup.fileName || deleting === backup.fileName}
                    title="Delete snapshot"
                    className="p-1.5 bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 rounded-lg transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {deleting === backup.fileName ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
