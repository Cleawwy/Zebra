import React, { useState } from 'react';
import { Copy, Check, Square, Users, Radio, Globe, Download } from 'lucide-react';
import { HostStatus } from '../../electron/types';

interface ActiveHostBannerProps {
  status: HostStatus;
  onStop: () => void;
  isStopping: boolean;
}

export const ActiveHostBanner: React.FC<ActiveHostBannerProps> = ({
  status,
  onStop,
  isStopping,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedE4mc, setCopiedE4mc] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Determine primary display room code
  const roomCode = status.roomCode || status.worldName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const primaryAddress = roomCode || status.directIp || `localhost:${status.port}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode || primaryAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportMod = async () => {
    if (!window.zebra?.exportMod || exporting) return;
    setExporting(true);
    try {
      await window.zebra.exportMod();
    } catch (e) {
      console.warn('Failed to export mod:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-emerald-950/40 via-surface/90 to-surface/90 border-b border-emerald-500/20 px-6 py-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-4">
        {/* Radar Pulse */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            Zebra Relay Active
          </span>
        </div>

        <div className="h-4 w-[1px] bg-zinc-800" />

        {/* World Name */}
        <span className="text-xs font-medium text-zinc-200">
          {status.worldName}
        </span>

        <div className="h-4 w-[1px] bg-zinc-800" />

        {/* Room Code & 1-Click Copy */}
        <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-700/60 px-3 py-1 rounded-lg">
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs text-zinc-400">Room Code:</span>
          <span className="text-xs font-mono font-bold text-emerald-300 selection:bg-brand selection:text-white">
            {roomCode}
          </span>
          <button
            onClick={handleCopy}
            title="Copy room code to clipboard"
            className="ml-2 flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded transition-all font-sans font-medium cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        {/* Export Companion Mod for Friends */}
        <button
          onClick={handleExportMod}
          disabled={exporting}
          title="Export the universal Zebra Relay client mod (.jar) to send to your friends"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand rounded-lg text-[11px] font-medium transition-all cursor-pointer disabled:opacity-50"
        >
          <Download className="w-3 h-3" />
          <span>{exporting ? 'Exporting...' : 'Export Mod for Friends'}</span>
        </button>

        {/* e4mc Fallback Link */}
        {status.e4mcDomain && (
          <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-zinc-400">e4mc Link:</span>
            <span className="text-[11px] font-mono font-medium text-emerald-300">
              {status.e4mcDomain}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(status.e4mcDomain!);
                setCopiedE4mc(true);
                setTimeout(() => setCopiedE4mc(false), 2000);
              }}
              title="Copy e4mc fallback address"
              className="ml-1 text-[10px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded cursor-pointer transition-all"
            >
              {copiedE4mc ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Connected Players */}
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-surface-hover/80 px-2.5 py-1 rounded-lg border border-surface-border">
          <Users className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-mono font-medium text-zinc-200">
            {status.activePlayers.length}
          </span>
          <span className="text-zinc-500">/</span>
          <span className="font-mono text-zinc-400">{status.maxPlayers}</span>
        </div>

        {/* Stop Hosting */}
        <button
          onClick={onStop}
          disabled={isStopping}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50 cursor-pointer"
        >
          <Square className="w-3 h-3 fill-rose-400" />
          {isStopping ? 'Stopping...' : 'Stop Hosting'}
        </button>
      </div>
    </div>
  );
};
