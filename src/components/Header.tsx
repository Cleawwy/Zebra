import React from 'react';
import { Layers, Compass, Terminal, Settings, Search, RefreshCw, Zap } from 'lucide-react';

interface HeaderProps {
  currentTab: 'worlds' | 'explore' | 'console' | 'settings';
  setCurrentTab: (tab: 'worlds' | 'explore' | 'console' | 'settings') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isHosting: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  worldsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  searchQuery,
  setSearchQuery,
  isHosting,
  onRefresh,
  isRefreshing,
  worldsCount,
}) => {
  return (
    <header className="h-16 border-b border-surface-border bg-surface/50 backdrop-blur-md px-6 flex items-center justify-between select-none">
      {/* Brand & Tabs */}
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand to-sky-400 flex items-center justify-center shadow-lg shadow-brand/20">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-white leading-none">ZEBRA</span>
            <span className="text-[10px] text-zinc-400 font-medium tracking-widest uppercase">Host</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <nav className="flex items-center gap-1 bg-surface-hover/70 p-1 rounded-xl border border-surface-border">
          <button
            onClick={() => setCurrentTab('worlds')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'worlds'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Worlds
            {worldsCount > 0 && (
              <span className="text-[10px] bg-zinc-700/60 text-zinc-300 px-1.5 py-0.5 rounded-full font-mono">
                {worldsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('explore')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'explore'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Explore (+)
          </button>

          <button
            onClick={() => setCurrentTab('console')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all relative ${
              currentTab === 'console'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Console
            {isHosting && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-online opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-online"></span>
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'settings'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
        </nav>
      </div>

      {/* Right Search & Controls */}
      <div className="flex items-center gap-3">
        {currentTab === 'worlds' && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter worlds... (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 pl-9 pr-3 py-1.5 bg-surface-hover/80 border border-surface-border rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40 transition-all font-sans"
            />
          </div>
        )}

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh singleplayer saves"
          className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-surface-hover rounded-xl border border-surface-border transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
};
