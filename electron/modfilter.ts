import * as fs from 'fs';
import * as path from 'path';

// Known client-only rendering / GUI mods that crash a headless server
const CLIENT_ONLY_MOD_PATTERNS = [
  'sodium',
  'iris',
  'indium',
  'rubidium',
  'oculus',
  'embeddium',
  'optifine',
  'lambdynamiclights',
  'continuity',
  'reeses-sodium-options',
  'sodium-extra',
  'zoomify',
  'ok-zoomer',
  'wi-zoom',
  'freecam',
  'minihud',
  'tweakeroo',
  'itemscroller',
  'litematica',
  'modmenu',
  'controlling',
  'borderless-mining',
  'appleskin',
  'custom-crosshair',
  'dynamic-fps',
  'entityculling',
  'bobby',
  'farsight',
  'presence-footsteps',
  'sound-physics-remastered',
  'chat-heads',
  'skinlayers',
  '3dskinlayers',
  'not-enough-animations',
];

export class ModFilter {
  /**
   * Prepares a clean mods directory for headless hosting, filtering out client-only rendering mods.
   */
  public static prepareServerMods(instanceModsDir: string, targetModsDir: string): { total: number; filtered: number } {
    if (!fs.existsSync(instanceModsDir)) {
      return { total: 0, filtered: 0 };
    }

    if (!fs.existsSync(targetModsDir)) {
      fs.mkdirSync(targetModsDir, { recursive: true });
    }

    let total = 0;
    let filtered = 0;

    try {
      const files = fs.readdirSync(instanceModsDir);
      for (const file of files) {
        if (!file.endsWith('.jar')) continue;
        total++;

        const lower = file.toLowerCase();
        const isClientOnly = CLIENT_ONLY_MOD_PATTERNS.some((pattern) => lower.includes(pattern));

        if (isClientOnly) {
          filtered++;
          console.log(`[ModFilter] Silently excluding client-only mod from headless runner: ${file}`);
        } else {
          // Copy or link mod to target directory
          const src = path.join(instanceModsDir, file);
          const dest = path.join(targetModsDir, file);
          if (!fs.existsSync(dest)) {
            try {
              fs.copyFileSync(src, dest);
            } catch (err) {
              console.warn(`Could not copy mod ${file}:`, err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error preparing server mods:', err);
    }

    return { total, filtered };
  }

  /**
   * Scans a server's mods directory and renames any client-only jars to .client-disabled
   * to prevent crashing the headless dedicated server on startup.
   */
  public static sanitizeServerMods(modsDir: string, onLog?: (msg: string) => void): number {
    if (!fs.existsSync(modsDir)) return 0;
    let disabledCount = 0;
    try {
      const files = fs.readdirSync(modsDir);
      for (const file of files) {
        if (!file.endsWith('.jar')) continue;
        const lower = file.toLowerCase();
        const isClientOnly = CLIENT_ONLY_MOD_PATTERNS.some((pattern) => lower.includes(pattern));
        if (isClientOnly) {
          const oldPath = path.join(modsDir, file);
          const newPath = path.join(modsDir, `${file}.client-disabled`);
          try {
            fs.renameSync(oldPath, newPath);
            disabledCount++;
            if (onLog) {
              onLog(`[ModFilter] Auto-disabled client-only mod to prevent crash: ${file}`);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('Error sanitizing server mods:', err);
    }
    return disabledCount;
  }
}
