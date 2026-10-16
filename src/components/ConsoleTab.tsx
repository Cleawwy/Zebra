import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, Trash2, Users, Shield, UserX, UserMinus, AlertCircle } from 'lucide-react';
import { HostStatus } from '../../electron/types';
import { renderFormattedLogLine } from './ServerConsoleTab';

interface ConsoleTabProps {
  logs: string[];
  onClearLogs: () => void;
  status: HostStatus;
}

export const ConsoleTab: React.FC<ConsoleTabProps> = ({ logs, onClearLogs, status }) => {
  const [command, setCommand] = useState('');
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !window.zebra) return;

    window.zebra.sendCommand(command.trim());
    setCommand('');
  };

  const handleKick = (player: string) => {
    if (window.zebra) window.zebra.sendCommand(`kick ${player}`);
  };

  const handleBan = (player: string) => {
    if (window.zebra) window.zebra.sendCommand(`ban ${player}`);
  };

  const handleOp = (player: string) => {
    if (window.zebra) window.zebra.sendCommand(`op ${player}`);
  };

  return (
    <div className="flex-1 flex overflow-hidden p-6 gap-6">
      {/* Main Terminal Window */}
      <div className="flex-1 flex flex-col bg-surface border border-surface-border rounded-2xl overflow-hidden shadow-xl">
        {/* Terminal Header */}
        <div className="px-4 py-3 bg-zinc-900/90 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-brand" />
            <span className="text-xs font-semibold text-zinc-200">Server Console & Output</span>
            {status.isHosting && (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full ml-2">
                20.0 TPS
              </span>
            )}
          </div>

          <button
            onClick={onClearLogs}
            title="Clear logs"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Log Viewer */}
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 bg-zinc-950/90 select-text">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
              <Terminal className="w-8 h-8 opacity-40" />
              <span>No logs to display. Server is idle.</span>
            </div>
          ) : (
            logs.map((log, idx) => renderFormattedLogLine(log, idx))
          )}
          <div ref={logEndRef} />
        </div>

        {/* Command Input Bar */}
        <form onSubmit={handleSendCommand} className="p-3 bg-zinc-900 border-t border-surface-border flex gap-2">
          <input
            type="text"
            disabled={!status.isHosting}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={status.isHosting ? "Type command (e.g. /op <friend>, /gamemode creative)..." : "Start a world to send commands"}
            className="flex-1 bg-zinc-950 border border-zinc-700/60 rounded-xl px-4 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!status.isHosting || !command.trim()}
            className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-brand/20 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Connected Players Sidebar */}
      <div className="w-72 bg-surface border border-surface-border rounded-2xl flex flex-col overflow-hidden shadow-xl">
        <div className="p-4 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-semibold text-zinc-200">Online Players</span>
          </div>
          <span className="text-xs font-mono text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-full">
            {status.activePlayers.length}
          </span>
        </div>

        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {!status.isHosting ? (
            <div className="text-center py-12 text-zinc-600 text-xs">
              Server is offline
            </div>
          ) : status.activePlayers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              No players connected yet.<br />Share the join IP!
            </div>
          ) : (
            status.activePlayers.map((player) => (
              <div
                key={player}
                className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                    {player[0]?.toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-zinc-200 truncate">{player}</span>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleOp(player)}
                    title="Make Operator"
                    className="p-1 hover:text-brand hover:bg-zinc-800 rounded text-zinc-500"
                  >
                    <Shield className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleKick(player)}
                    title="Kick player"
                    className="p-1 hover:text-amber-400 hover:bg-zinc-800 rounded text-zinc-500"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleBan(player)}
                    title="Ban player"
                    className="p-1 hover:text-rose-400 hover:bg-zinc-800 rounded text-zinc-500"
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
  );
};
