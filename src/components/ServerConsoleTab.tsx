import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Send,
  Trash2,
  Users,
  Shield,
  UserX,
  UserMinus,
  MessageSquare,
  TerminalSquare,
  UserCheck,
  Check,
  Copy,
  ArrowDown,
  Cpu,
  Activity,
  HardDrive,
  Radio,
  AlertTriangle,
  X,
} from 'lucide-react';
import { ServerInstance } from '../../electron/types';

interface ServerConsoleTabProps {
  server: ServerInstance;
  logs: string[];
  onClearLogs: () => void;
}

export const renderFormattedLogLine = (log: string, idx: number) => {
  const isCmd = log.startsWith('>');

  // Split only genuine log bracket tags [xxx] (alphanumeric/thread names/levels) and player chat <player>
  const tokens = log.split(/(\[[A-Za-z0-9_# \/.:-]+\]|<[a-zA-Z0-9_]{1,16}>)/g);

  return (
    <div
      key={idx}
      className={`font-mono text-xs leading-5 hover:bg-white/[0.02] px-1 whitespace-pre-wrap break-all ${
        isCmd ? 'text-sky-300 font-medium' : 'text-zinc-300'
      }`}
    >
      {tokens.map((token, tIdx) => {
        if (!token) return null;

        // Bracketed token: [...]
        if (token.startsWith('[') && token.endsWith(']')) {
          const inner = token.slice(1, -1);

          // Timestamp: [12:34:56]
          if (/^\d{2}:\d{2}:\d{2}$/.test(inner)) {
            return (
              <span key={tIdx} className="text-zinc-500 font-mono">
                {token}
              </span>
            );
          }

          // Error / Exception / Fatal
          if (inner.includes('ERROR') || inner.includes('FATAL') || inner.includes('Exception') || inner.includes('STDERR')) {
            return (
              <span key={tIdx} className="text-rose-400 font-bold">
                {token}
              </span>
            );
          }

          // Warning
          if (inner.includes('WARN')) {
            return (
              <span key={tIdx} className="text-amber-400 font-semibold">
                {token}
              </span>
            );
          }

          // Info
          if (inner.includes('INFO')) {
            return (
              <span key={tIdx} className="text-sky-400 font-semibold">
                {token}
              </span>
            );
          }

          // Zebra Branding & Network
          if (inner.includes('Zebra') || inner.includes('Network') || inner.includes('P2P')) {
            return (
              <span key={tIdx} className="text-emerald-400 font-semibold">
                {token}
              </span>
            );
          }

          // Host Chat
          if (inner.includes('Host Chat') || inner === 'Host') {
            return (
              <span key={tIdx} className="text-fuchsia-400 font-semibold">
                {token}
              </span>
            );
          }

          // Generic thread / mod tag
          return (
            <span key={tIdx} className="text-indigo-400 font-medium">
              {token}
            </span>
          );
        }

        // Chat handle: <Player>
        if (token.startsWith('<') && token.endsWith('>')) {
          return (
            <span key={tIdx} className="text-cyan-400 font-semibold">
              {token}
            </span>
          );
        }

        // Clean normal text
        return <span key={tIdx}>{token}</span>;
      })}
    </div>
  );
};

export const ServerConsoleTab: React.FC<ServerConsoleTabProps> = ({
  server,
  logs,
  onClearLogs,
}) => {
  const [inputMode, setInputMode] = useState<'command' | 'chat'>('command');
  const [inputText, setInputText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [crashReport, setCrashReport] = useState<{ fileName: string; content: string } | null>(null);
  const [showCrashModal, setShowCrashModal] = useState(false);
  const [copiedCrash, setCopiedCrash] = useState(false);
  const [crashFeedback, setCrashFeedback] = useState<string | null>(null);
  const [whitelistPlayerName, setWhitelistPlayerName] = useState('');
  const [whitelistStatus, setWhitelistStatus] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const isOnline = server.status === 'online';
  const isRunning = server.status === 'online' || server.status === 'starting';
  const usedRamGb = isRunning && server.memoryUsedMb > 0 ? (server.memoryUsedMb / 1024).toFixed(1) : '0';
  const ramDisplay = server.ramMode === 'auto'
    ? `${usedRamGb}G ~ Dynamic`
    : `${usedRamGb}G / ${server.maxRamGb}G`;
  const ramPercent = isRunning && server.memoryUsedMb > 0
    ? server.ramMode === 'auto'
      ? Math.min((server.memoryUsedMb / (Math.max(server.maxRamGb || 8, 8) * 1024)) * 100, 100)
      : Math.min((server.memoryUsedMb / (server.maxRamGb * 1024)) * 100, 100)
    : 0;

  const formatStorage = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    if (!showCrashModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCrashModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCrashModal]);

  const handleCopyLogs = () => {
    if (logs.length === 0) return;
    navigator.clipboard.writeText(logs.join('\n'));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleCheckCrash = async () => {
    if (!window.zebra) return;
    try {
      const report = await window.zebra.getLatestCrashReport(server.path);
      if (report) {
        setCrashReport(report);
        setShowCrashModal(true);
      } else {
        setCrashFeedback('No crashes');
        setTimeout(() => setCrashFeedback(null), 2500);
      }
    } catch {
      setCrashFeedback('No crashes');
      setTimeout(() => setCrashFeedback(null), 2500);
    }
  };

  const handleCopyCrash = () => {
    if (!crashReport) return;
    navigator.clipboard.writeText(crashReport.content);
    setCopiedCrash(true);
    setTimeout(() => setCopiedCrash(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setInputText(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInputText('');
      } else {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInputText(history[nextIndex]);
      }
    }
  };

  const handleWhitelistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const player = whitelistPlayerName.trim();
    if (!player || !window.zebra) return;

    window.zebra.sendCommand(`/whitelist add ${player}`, server.id);
    setWhitelistStatus(`Whitelisted ${player}!`);
    setWhitelistPlayerName('');
    setTimeout(() => setWhitelistStatus(null), 2500);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !window.zebra) return;

    // Save to command history
    setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 50));
    setHistoryIndex(-1);

    if (inputMode === 'command') {
      const cmd = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
      window.zebra.sendCommand(cmd, server.id);
    } else {
      window.zebra.sendCommand(trimmed, server.id);
    }

    setInputText('');
  };

  const handleOp = (player: string) => {
    if (window.zebra) window.zebra.sendCommand(`/op ${player}`, server.id);
  };

  const handleKick = (player: string) => {
    if (window.zebra) window.zebra.sendCommand(`/kick ${player}`, server.id);
  };

  const handleBan = (player: string) => {
    if (window.zebra) window.zebra.sendCommand(`/ban ${player}`, server.id);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-4">
      {/* Hardware Telemetry Bar (Isolated exclusively to Console Tab) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* CPU Usage */}
        <div className="bg-surface/90 border border-surface-border rounded-2xl p-3 flex items-center gap-3 shadow-sm">
          <div className="p-2 rounded-xl bg-zinc-800 text-brand">
            <Cpu className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-zinc-300 font-medium">CPU</span>
              <span className="text-xs font-mono font-bold text-white">
                {isRunning ? `${server.cpuPercent}%` : '0%'}
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
              <div
                className="bg-brand h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${isRunning ? Math.min(server.cpuPercent, 100) : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* RAM Usage */}
        <div className="bg-surface/90 border border-surface-border rounded-2xl p-3 flex items-center gap-3 shadow-sm">
          <div className="p-2 rounded-xl bg-zinc-800 text-sky-400">
            <Activity className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1 gap-2">
              <span className="text-[11px] text-zinc-400 font-medium whitespace-nowrap shrink-0">RAM</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-mono font-bold text-white whitespace-nowrap">
                  {usedRamGb}G
                </span>
                {server.ramMode === 'auto' ? (
                  <span className="text-[10px] font-semibold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 whitespace-nowrap">
                    Dynamic
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-zinc-400 whitespace-nowrap">
                    / {server.maxRamGb}G
                  </span>
                )}
              </div>
            </div>
            <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
              <div
                className="bg-sky-400 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${ramPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Players */}
        <div className="bg-surface/90 border border-surface-border rounded-2xl p-3 flex items-center gap-3 shadow-sm">
          <div className="p-2 rounded-xl bg-zinc-800 text-emerald-400">
            <Users className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-zinc-300 font-medium">Players</span>
              <span className="text-xs font-mono font-bold text-white">
                {server.activePlayers.length} / {server.maxPlayers}
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min((server.activePlayers.length / server.maxPlayers) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Server Folder Size */}
        <div
          className="bg-surface/90 border border-surface-border rounded-2xl p-3 flex items-center gap-3 shadow-sm min-w-0"
          title={`Server folder size on disk: ${formatStorage(server.sizeBytes)}`}
        >
          <div className="p-2 rounded-xl bg-zinc-800 text-cyan-400 shrink-0">
            <HardDrive className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1 gap-1">
              <span className="text-[11px] text-zinc-300 font-medium whitespace-nowrap shrink-0">Folder Size</span>
              <span className="text-xs font-mono font-bold text-white whitespace-nowrap truncate">
                {formatStorage(server.sizeBytes)}
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(((server.sizeBytes || 0) / (5 * 1024 * 1024 * 1024)) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Console & Sidebar Row */}
      <div className="flex-1 flex overflow-hidden gap-4 min-h-0">
        {/* Terminal View */}
        <div className="flex-1 flex flex-col bg-surface border border-surface-border rounded-2xl overflow-hidden shadow-xl min-h-0">
          <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-surface-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-zinc-300" />
              <span className="text-xs font-semibold text-white">Live Terminal Output</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCheckCrash}
                title="Inspect latest server crash report"
                className="px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/5"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>{crashFeedback || 'Crash Report'}</span>
              </button>

              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                title={autoScroll ? 'Disable Auto-scroll' : 'Enable Auto-scroll'}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1 border ${
                  autoScroll
                    ? 'bg-zinc-800 text-white border-white/10'
                    : 'bg-transparent text-zinc-400 border-white/5 hover:text-zinc-200'
                }`}
              >
                <ArrowDown className="w-3 h-3" />
                <span>Scroll</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLogs}
                title="Copy logs to clipboard"
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all cursor-pointer"
              >
                {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={onClearLogs}
                title="Clear logs"
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Logs Terminal Area */}
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 bg-zinc-950/90 select-text min-h-0">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-2">
                <Terminal className="w-8 h-8 opacity-30" />
                <span className="text-xs font-medium">
                  {isOnline ? 'Waiting for output...' : 'Server is offline. Press Start Server to launch.'}
                </span>
              </div>
            ) : (
              logs.map((log, idx) => renderFormattedLogLine(log, idx))
            )}
            <div ref={logEndRef} />
          </div>

          {/* Command Input Area */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-zinc-900/90 border-t border-surface-border flex items-center gap-2"
          >
            <div className="flex items-center bg-zinc-950 border border-zinc-700/60 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setInputMode('command')}
                title="Command mode: execute /say, /op, /gamemode"
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  inputMode === 'command'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <TerminalSquare className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setInputMode('chat')}
                title="Chat mode: talk as [Host] to in-game players"
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  inputMode === 'chat'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </div>

            <input
              type="text"
              value={inputText}
              disabled={!isOnline}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !isOnline
                  ? 'Server is offline'
                  : inputMode === 'command'
                  ? 'Type command (↑/↓ history, e.g. /op friend, /time set day)...'
                  : 'Send message to players in-game as [Host]...'
              }
              className="flex-1 bg-zinc-950 border border-zinc-700/60 rounded-xl px-4 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/30 disabled:opacity-40"
            />

            <button
              type="submit"
              disabled={!isOnline || !inputText.trim()}
              className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-30 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Online Players & Whitelist Sidebar */}
        <div className="w-72 bg-surface border border-surface-border rounded-2xl flex flex-col overflow-hidden shadow-xl min-h-0">
          {/* Whitelist Player Box */}
          <div className="p-3.5 bg-zinc-900/90 border-b border-surface-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-zinc-200">
                <UserCheck className="w-3.5 h-3.5 text-white" />
                <span className="text-xs font-semibold text-white">Whitelist Player</span>
              </div>
              {whitelistStatus && (
                <span className="text-[10px] text-emerald-400 font-medium animate-fade-in">
                  {whitelistStatus}
                </span>
              )}
            </div>

            <form onSubmit={handleWhitelistSubmit} className="flex gap-2">
              <input
                type="text"
                value={whitelistPlayerName}
                onChange={(e) => setWhitelistPlayerName(e.target.value)}
                placeholder="Player username..."
                className="flex-1 bg-zinc-950 border border-zinc-700/60 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/30"
              />
              <button
                type="submit"
                disabled={!whitelistPlayerName.trim()}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition-all border border-white/10 disabled:opacity-30 cursor-pointer"
              >
                Add
              </button>
            </form>
          </div>

          {/* Connected Players Header */}
          <div className="px-4 py-2 bg-zinc-900/60 border-b border-surface-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-semibold text-white">Connected Players</span>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-white/5">
              {server.activePlayers.length} / {server.maxPlayers}
            </span>
          </div>

          {/* Connected Players List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
            {server.activePlayers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400">
                <Users className="w-6 h-6 opacity-30 mb-2" />
                <span className="text-xs font-medium text-zinc-300">No players connected</span>
                <span className="text-[11px] text-zinc-400 mt-1">
                  Share your server address with friends to play together!
                </span>
              </div>
            ) : (
              server.activePlayers.map((player) => (
                <div
                  key={player}
                  className="bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 rounded-xl p-2.5 flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-7 h-7 rounded-lg bg-zinc-800 border border-white/10 overflow-hidden flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      <span>{player[0]?.toUpperCase() || 'P'}</span>
                      <img
                        src={`https://mc-heads.net/avatar/${encodeURIComponent(player)}/28`}
                        alt={player}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-white">{player}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOp(player)}
                      title="Make Operator (/op)"
                      className="p-1 hover:bg-zinc-700 text-zinc-400 hover:text-amber-400 rounded-lg transition-colors cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleKick(player)}
                      title="Kick Player (/kick)"
                      className="p-1 hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleBan(player)}
                      title="Ban Player (/ban)"
                      className="p-1 hover:bg-zinc-700 text-zinc-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Crash Report Inspector Modal */}
      {showCrashModal && crashReport && (
        <div
          onClick={() => setShowCrashModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fade-in cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border border-surface-border w-full max-w-4xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl cursor-default"
          >
            {/* Header */}
            <div className="px-5 py-3.5 bg-zinc-900/90 border-b border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-white truncate">Crash Report: {crashReport.fileName}</span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleCopyCrash}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Copy full crash report to clipboard"
                >
                  {copiedCrash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCrash ? 'Copied!' : 'Copy Report'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCrashModal(false)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-all cursor-pointer"
                  title="Close crash modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 bg-zinc-950 p-4 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-zinc-200 bg-black/40 rounded-xl p-4 select-text whitespace-pre-wrap break-all border border-white/5">
                {crashReport.content}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
