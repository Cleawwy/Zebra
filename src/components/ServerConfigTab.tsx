import React, { useState } from 'react';
import {
  Save,
  Check,
  Upload,
  Image as ImageIcon,
  Gamepad2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Server,
  Eye,
  Settings2,
  Cpu,
} from 'lucide-react';
import { ServerInstance } from '../../electron/types';

interface ServerConfigTabProps {
  server: ServerInstance;
  onUpdateConfig: (id: string, update: any) => void;
}

export const ServerConfigTab: React.FC<ServerConfigTabProps> = ({ server, onUpdateConfig }) => {
  // General & Branding
  const [name, setName] = useState(server.name);
  const [motd, setMotd] = useState(server.motd || `Hosted via Zebra - ${server.name}`);
  const [iconPreview, setIconPreview] = useState<string | undefined>(server.iconBase64);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  // Gameplay
  const [gamemode, setGamemode] = useState(server.gamemode);
  const [difficulty, setDifficulty] = useState(server.difficulty);
  const [hardcore, setHardcore] = useState(server.hardcore ?? false);
  const [pvp, setPvp] = useState(server.pvp);
  const [allowFlight, setAllowFlight] = useState(server.allowFlight ?? true);
  const [allowCheats, setAllowCheats] = useState(server.allowCheats);
  // Spawn protection is ALWAYS 0 automatically by default
  const [spawnProtection, setSpawnProtection] = useState(server.spawnProtection ?? 0);

  // In-Game Limits & Visibility
  const [maxPlayers, setMaxPlayers] = useState(server.maxPlayers);
  const [whiteList, setWhiteList] = useState(server.whiteList ?? false);
  const [simulationDistance, setSimulationDistance] = useState(server.simulationDistance);
  const [viewDistance, setViewDistance] = useState(server.viewDistance);

  // Game Rules (Collapsible)
  const [gameRulesOpen, setGameRulesOpen] = useState(true);
  const [keepInventory, setKeepInventory] = useState(Boolean(server.gameRules?.keepInventory ?? false));
  const [doDaylightCycle, setDoDaylightCycle] = useState(server.gameRules?.doDaylightCycle !== false);
  const [doWeatherCycle, setDoWeatherCycle] = useState(server.gameRules?.doWeatherCycle !== false);
  const [mobGriefing, setMobGriefing] = useState(server.gameRules?.mobGriefing !== false);
  const [doFireTick, setDoFireTick] = useState(server.gameRules?.doFireTick !== false);
  const [naturalRegeneration, setNaturalRegeneration] = useState(server.gameRules?.naturalRegeneration !== false);
  const [doMobSpawning, setDoMobSpawning] = useState(server.gameRules?.doMobSpawning !== false);
  const [playersSleepingPercentage, setPlayersSleepingPercentage] = useState<number>(
    typeof server.gameRules?.playersSleepingPercentage === 'number'
      ? (server.gameRules.playersSleepingPercentage as number)
      : 100
  );
  const [customJavaPath, setCustomJavaPath] = useState(server.customJavaPath || '');

  const [saved, setSaved] = useState(false);

  const handleBrowseJava = async () => {
    if (!window.zebra) return;
    const file = await window.zebra.selectFile();
    if (file) {
      setCustomJavaPath(file);
    }
  };

  const handleUploadIcon = async () => {
    if (!window.zebra) return;
    setUploadingIcon(true);
    try {
      const base64 = await window.zebra.uploadServerIcon(server.id);
      if (base64) {
        setIconPreview(base64);
        onUpdateConfig(server.id, { iconBase64: base64 });
      }
    } catch (err) {
      console.warn('Failed to upload icon:', err);
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleSave = () => {
    onUpdateConfig(server.id, {
      name,
      motd,
      gamemode,
      difficulty,
      hardcore,
      allowCheats,
      pvp,
      allowFlight,
      spawnProtection: spawnProtection ?? 0,
      whiteList,
      maxPlayers,
      simulationDistance,
      viewDistance,
      gameRules: {
        keepInventory,
        doDaylightCycle,
        doWeatherCycle,
        mobGriefing,
        doFireTick,
        naturalRegeneration,
        doMobSpawning,
        playersSleepingPercentage,
      },
      customJavaPath: customJavaPath.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Title & Save Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Game Configuration & Rules</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Modify in-game properties, physics rules, MOTD, and multiplayer appearance.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 rounded-full text-xs font-semibold shadow-md transition-all cursor-pointer"
        >
          {saved ? <Check className="w-4 h-4 text-zinc-950" /> : <Save className="w-4 h-4 text-zinc-950" />}
          <span>{saved ? 'Saved Changes!' : 'Save Config'}</span>
        </button>
      </div>

      {/* Server Icon & Multiplayer MOTD Banner */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-brand" />
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Server Identity & Icon</h3>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">64 x 64 PNG</span>
        </div>

        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden shadow-lg shadow-black/50 flex-shrink-0">
            {iconPreview ? (
              <img src={iconPreview} alt="Server Icon" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-600 gap-1">
                <Server className="w-6 h-6 stroke-[1.5]" />
              </div>
            )}
          </div>

          <div className="flex-1">
            <p className="text-xs text-zinc-200 font-medium">Multiplayer Server Icon</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Upload any image from your computer. Zebra automatically converts and crops it to the native Minecraft 64x64 format.
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={handleUploadIcon}
                disabled={uploadingIcon}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 rounded-xl text-xs font-semibold border border-white/10 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 text-brand" />
                <span>{uploadingIcon ? 'Processing...' : 'Upload Server Icon'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-surface-border/50 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Message of the Day (MOTD)</label>
            <input
              type="text"
              value={motd}
              onChange={(e) => setMotd(e.target.value)}
              placeholder="A Minecraft Server hosted via Zebra"
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand"
            />
          </div>
        </div>
      </div>

      {/* Gameplay Rules */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Gameplay Rules</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Default Game Mode</label>
            <select
              value={gamemode}
              onChange={(e) => setGamemode(e.target.value as any)}
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand"
            >
              <option value="survival">Survival</option>
              <option value="creative">Creative</option>
              <option value="adventure">Adventure</option>
              <option value="spectator">Spectator</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand"
            >
              <option value="peaceful">Peaceful</option>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={pvp}
              onChange={(e) => setPvp(e.target.checked)}
              className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            PvP Enabled
          </label>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={hardcore}
              onChange={(e) => setHardcore(e.target.checked)}
              className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            Hardcore Mode
          </label>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={allowFlight}
              onChange={(e) => setAllowFlight(e.target.checked)}
              className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            Allow Flight
          </label>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={allowCheats}
              onChange={(e) => setAllowCheats(e.target.checked)}
              className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            Allow Cheats (/commands)
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-surface-border/50">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Max Players</label>
            <input
              type="number"
              min="1"
              max="200"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-400 block">Spawn Protection</label>
              <span className="text-[10px] text-emerald-400 font-semibold">0 = Disabled</span>
            </div>
            <input
              type="number"
              min="0"
              max="100"
              value={spawnProtection}
              onChange={(e) => setSpawnProtection(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-brand"
            />
          </div>

          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={whiteList}
                onChange={(e) => setWhiteList(e.target.checked)}
                className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
              />
              Enable Whitelist
            </label>
          </div>
        </div>
      </div>

      {/* Render & Simulation Distance */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Chunk Loading & Distances</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs text-zinc-300 mb-1">
              <span>View Distance</span>
              <span className="font-mono font-semibold text-zinc-200">{viewDistance} chunks</span>
            </div>
            <input
              type="range"
              min="4"
              max="32"
              value={viewDistance}
              onChange={(e) => setViewDistance(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-300 mb-1">
              <span>Simulation Distance</span>
              <span className="font-mono font-semibold text-zinc-200">{simulationDistance} chunks</span>
            </div>
            <input
              type="range"
              min="4"
              max="16"
              value={simulationDistance}
              onChange={(e) => setSimulationDistance(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>
        </div>
      </div>

      {/* Comprehensive Game Rules (Collapsible Accordion) */}
      <div className="bg-surface border border-surface-border rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setGameRulesOpen(!gameRulesOpen)}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-zinc-800/20 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <div>
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider block">Game Rules</span>
              <span className="text-[11px] text-zinc-400">Keep inventory, daylight cycle, mob griefing, fire physics, sleep percent</span>
            </div>
          </div>
          {gameRulesOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {gameRulesOpen && (
          <div className="p-5 pt-0 border-t border-surface-border/60 space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepInventory}
                  onChange={(e) => setKeepInventory(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Keep Inventory on Death
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doDaylightCycle}
                  onChange={(e) => setDoDaylightCycle(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Daylight Cycle (Sun/Moon)
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doWeatherCycle}
                  onChange={(e) => setDoWeatherCycle(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Weather Cycle (Rain/Thunder)
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mobGriefing}
                  onChange={(e) => setMobGriefing(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Creeper/Enderman Griefing
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doFireTick}
                  onChange={(e) => setDoFireTick(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Fire Spreading & Burning
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={naturalRegeneration}
                  onChange={(e) => setNaturalRegeneration(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Natural Health Regeneration
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doMobSpawning}
                  onChange={(e) => setDoMobSpawning(e.target.checked)}
                  className="rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
                />
                Natural Mob Spawning
              </label>
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-xs text-zinc-300 mb-1">
                <span>Players Sleeping Percentage to Skip Night</span>
                <span className="font-mono font-semibold text-brand">{playersSleepingPercentage}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={playersSleepingPercentage}
                onChange={(e) => setPlayersSleepingPercentage(Number(e.target.value))}
                className="w-full accent-brand"
              />
            </div>
          </div>
        )}
      </div>

      {/* Java Runtime (JVM) Environment */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-xs uppercase tracking-wider">
            <Cpu className="w-4 h-4 text-brand" />
            <span>Java Runtime (JVM)</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">
            Target: Java {server.version.startsWith('26') || server.version.startsWith('25') ? '25' : server.version.startsWith('1.21') || server.version.startsWith('1.20.5') ? '21' : '17'}
          </span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-zinc-300 font-medium">Java Executable Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customJavaPath}
              onChange={(e) => setCustomJavaPath(e.target.value)}
              placeholder="Auto-detected & managed by Zebra (Recommended)"
              className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={handleBrowseJava}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 hover:text-white rounded-xl text-xs font-semibold transition-all border border-white/5 cursor-pointer"
            >
              Browse...
            </button>
            {customJavaPath && (
              <button
                type="button"
                onClick={() => setCustomJavaPath('')}
                className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-xl text-xs transition-all border border-white/5 cursor-pointer"
                title="Reset to Auto-detect"
              >
                Reset
              </button>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Zebra automatically detects standard Java installations or downloads official Eclipse Adoptium runtimes. If you want this server to use a specific JVM binary, browse to your custom <code className="text-zinc-300 font-mono">java.exe</code>.
          </p>
        </div>
      </div>
    </div>
  );
};
