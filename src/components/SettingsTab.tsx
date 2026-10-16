import React, { useState, useEffect } from 'react';
import { HardDrive, Cpu, Network, Save, Check, RotateCcw, ShieldCheck, Radio, Server, Layers } from 'lucide-react';
import { AppSettings } from '../../electron/types';

interface SettingsTabProps {
  onSettingsSaved?: () => void;
}

const DEFAULT_SIGNALING_HOST = '163.245.213.207';
const DEFAULT_SIGNALING_PORT = 9090;
const DEFAULT_STUN_PORT = 19302;

export const SettingsTab: React.FC<SettingsTabProps> = ({ onSettingsSaved }) => {
  const [settings, setSettings] = useState<AppSettings>({
    serversRootPath: '',
    scanSingleplayerSaves: false,
    minimizeToTray: true,
    defaultRamMode: 'auto',
    defaultMaxRamGb: 6,
    defaultUpnp: true,
    defaultE4mc: true,
    signalingHost: DEFAULT_SIGNALING_HOST,
    signalingPort: DEFAULT_SIGNALING_PORT,
    stunPort: DEFAULT_STUN_PORT,
    p2pHolePunching: true,
    loopbackBypass: true,
    relayMode: 'auto',
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (window.zebra) {
      window.zebra.getSettings().then((s) => {
        setSettings({
          ...s,
          signalingHost: s.signalingHost || DEFAULT_SIGNALING_HOST,
          signalingPort: s.signalingPort || DEFAULT_SIGNALING_PORT,
          stunPort: s.stunPort || DEFAULT_STUN_PORT,
          p2pHolePunching: s.p2pHolePunching ?? true,
          loopbackBypass: s.loopbackBypass ?? true,
          relayMode: s.relayMode || 'auto',
        });
        setLoading(false);
      });
    }
  }, []);

  const handleChangeRootPath = async () => {
    if (!window.zebra) return;
    const selected = await window.zebra.selectDirectory();
    if (selected) {
      setSettings((prev) => ({ ...prev, serversRootPath: selected }));
    }
  };

  const handleResetNetworkDefaults = () => {
    setSettings((prev) => ({
      ...prev,
      signalingHost: DEFAULT_SIGNALING_HOST,
      signalingPort: DEFAULT_SIGNALING_PORT,
      stunPort: DEFAULT_STUN_PORT,
      p2pHolePunching: true,
      loopbackBypass: true,
      relayMode: 'auto',
      defaultUpnp: true,
      defaultE4mc: true,
    }));
  };

  const handleSave = async () => {
    if (!window.zebra) return;
    await window.zebra.saveSettings(settings);
    setSaved(true);
    if (onSettingsSaved) onSettingsSaved();
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
        Loading preferences...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto space-y-6">
      {/* Title & Save */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">App Preferences & Storage</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure storage locations, default server templates, and network tunneling protocols.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 rounded-full text-xs font-semibold shadow-md transition-all cursor-pointer"
        >
          {saved ? <Check className="w-3.5 h-3.5 text-zinc-950" /> : <Save className="w-3.5 h-3.5 text-zinc-950" />}
          <span>{saved ? 'Saved!' : 'Save Preferences'}</span>
        </button>
      </div>

      {/* Storage Root Directory */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <HardDrive className="w-4 h-4 text-brand" />
          <div>
            <h3 className="text-xs font-semibold text-zinc-200">Server Storage Location</h3>
            <p className="text-[11px] text-zinc-400">
              Where dedicated server files and world data are saved. You can choose any local or external drive.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 font-mono text-xs text-zinc-300 truncate">
            {settings.serversRootPath}
          </div>
          <button
            onClick={handleChangeRootPath}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-all flex-shrink-0 cursor-pointer"
          >
            Change Directory...
          </button>
        </div>
      </div>

      {/* Default Server RAM Template */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Cpu className="w-4 h-4 text-brand" />
          <div>
            <h3 className="text-xs font-semibold text-zinc-200">Default Server RAM Template</h3>
            <p className="text-[11px] text-zinc-400">
              Initial memory allocation applied when creating new servers. Each server also has its own independent RAM limits and min/max ranges in its Server Settings.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => setSettings((prev) => ({ ...prev, defaultRamMode: 'auto' }))}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              settings.defaultRamMode === 'auto'
                ? 'border-brand bg-brand/10 text-white shadow-sm'
                : 'border-surface-border bg-surface-hover/50 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">Dynamic Adaptive Scaling</span>
              {settings.defaultRamMode === 'auto' && <Check className="w-3.5 h-3.5 text-brand" />}
            </div>
            <p className="text-[11px] text-zinc-400">
              Allocates system memory dynamically on demand as chunks load. Desktop stays fluid when idle.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSettings((prev) => ({ ...prev, defaultRamMode: 'custom' }))}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              settings.defaultRamMode === 'custom'
                ? 'border-brand bg-brand/10 text-white shadow-sm'
                : 'border-surface-border bg-surface-hover/50 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">Custom Bound Template</span>
              {settings.defaultRamMode === 'custom' && <Check className="w-3.5 h-3.5 text-brand" />}
            </div>
            <p className="text-[11px] text-zinc-400">
              Default baseline ceiling for new servers (default: {settings.defaultMaxRamGb} GB).
            </p>
          </button>
        </div>
      </div>

      {/* Networking Stack & Traversal Preferences */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Network className="w-4 h-4 text-brand" />
            <div>
              <h3 className="text-xs font-semibold text-zinc-200">Zebra Relay & P2P Networking Infrastructure</h3>
              <p className="text-[11px] text-zinc-400">
                Manage NAT hole-punching, STUN discovery, and fallback proxy signaling.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetNetworkDefaults}
            className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] transition-all cursor-pointer"
            title="Reset to official dedicated VPS endpoints"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>
        </div>


        {/* Traversal Engine Modes */}
        <div className="space-y-3 pt-1">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.p2pHolePunching ?? true}
              onChange={(e) => setSettings((prev) => ({ ...prev, p2pHolePunching: e.target.checked }))}
              className="mt-0.5 rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            <div>
              <span className="text-xs font-medium text-zinc-200 block">
                Direct UDP NAT Hole-Punching (RFC 5389 STUN)
              </span>
              <span className="text-[11px] text-zinc-400 leading-relaxed block">
                Discovers reflexive public endpoints and coordinates simultaneous UDP punching for direct peer-to-peer gameplay with 0ms added relay ping.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.loopbackBypass ?? true}
              onChange={(e) => setSettings((prev) => ({ ...prev, loopbackBypass: e.target.checked }))}
              className="mt-0.5 rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            <div>
              <span className="text-xs font-medium text-zinc-200 block">
                Host Loopback Self-Join Optimization (0ms Loopback)
              </span>
              <span className="text-[11px] text-zinc-400 leading-relaxed block">
                Bypasses consumer router NAT hairpinning drops by directly connecting local Minecraft clients to 127.0.0.1 on the server's registered port.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.defaultUpnp}
              onChange={(e) => setSettings((prev) => ({ ...prev, defaultUpnp: e.target.checked }))}
              className="mt-0.5 rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            <div>
              <span className="text-xs font-medium text-zinc-200 block">
                UPnP Automated Router Port Mapping
              </span>
              <span className="text-[11px] text-zinc-400 leading-relaxed block">
                Automatically asks compatible consumer routers to open port 25565 when hosting.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.defaultE4mc}
              onChange={(e) => setSettings((prev) => ({ ...prev, defaultE4mc: e.target.checked }))}
              className="mt-0.5 rounded bg-surface-hover border-zinc-700 text-brand focus:ring-0"
            />
            <div>
              <span className="text-xs font-medium text-zinc-200 block">
                e4mc Public Web Proxy Link Fallback
              </span>
              <span className="text-[11px] text-zinc-400 leading-relaxed block">
                Provides a public domain (xyz.e4mc.link) for friends who do not have the companion mod installed.
              </span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
