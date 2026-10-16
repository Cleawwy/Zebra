import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorldInfo } from './types';
import { NbtManager } from './nbt';

export class WorldScanner {
  private customDirs: string[] = [];

  constructor(customDirs: string[] = []) {
    this.customDirs = customDirs;
  }

  public setCustomDirs(dirs: string[]) {
    this.customDirs = dirs;
  }

  /**
   * Scans all known Minecraft launcher directories for singleplayer worlds
   */
  public async scanAll(): Promise<WorldInfo[]> {
    const searchTargets: { dir: string; type: WorldInfo['instanceType']; instanceName: string }[] = [];

    const homeDir = os.homedir();
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    // 1. Standard Vanilla .minecraft
    const vanillaSavesDirs: string[] = [];
    if (isWin) {
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      vanillaSavesDirs.push(path.join(appData, '.minecraft', 'saves'));
    } else if (isMac) {
      vanillaSavesDirs.push(path.join(homeDir, 'Library', 'Application Support', 'minecraft', 'saves'));
    } else {
      vanillaSavesDirs.push(path.join(homeDir, '.minecraft', 'saves'));
      vanillaSavesDirs.push(path.join(homeDir, '.var', 'app', 'com.mojang.Minecraft', '.minecraft', 'saves'));
    }

    for (const vDir of vanillaSavesDirs) {
      if (fs.existsSync(vDir)) {
        searchTargets.push({ dir: vDir, type: 'vanilla', instanceName: '.minecraft' });
      }
    }

    // 2. CurseForge App Instances
    const curseforgeRoots: string[] = [
      path.join(homeDir, 'curseforge', 'minecraft', 'Instances'),
      path.join(homeDir, 'Documents', 'curseforge', 'minecraft', 'Instances'),
    ];
    for (const curseforgeRoot of curseforgeRoots) {
      if (fs.existsSync(curseforgeRoot)) {
        try {
          const instances = fs.readdirSync(curseforgeRoot);
          for (const inst of instances) {
            const saves = path.join(curseforgeRoot, inst, 'saves');
            if (fs.existsSync(saves)) {
              searchTargets.push({ dir: saves, type: 'curseforge', instanceName: inst });
            }
          }
        } catch {}
      }
    }

    // 3. Modrinth App Profiles
    const modrinthRoots: string[] = [];
    if (isWin) {
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      modrinthRoots.push(path.join(appData, 'com.modrinth.theseus', 'profiles'));
    } else if (isMac) {
      modrinthRoots.push(path.join(homeDir, 'Library', 'Application Support', 'com.modrinth.theseus', 'profiles'));
    } else {
      modrinthRoots.push(path.join(homeDir, '.config', 'com.modrinth.theseus', 'profiles'));
      modrinthRoots.push(path.join(homeDir, '.local', 'share', 'com.modrinth.theseus', 'profiles'));
    }

    for (const modrinthRoot of modrinthRoots) {
      if (fs.existsSync(modrinthRoot)) {
        try {
          const profiles = fs.readdirSync(modrinthRoot);
          for (const prof of profiles) {
            const saves = path.join(modrinthRoot, prof, 'saves');
            if (fs.existsSync(saves)) {
              searchTargets.push({ dir: saves, type: 'modrinth', instanceName: prof });
            }
          }
        } catch {}
      }
    }

    // 4. Prism Launcher Instances
    const prismRoots: string[] = [];
    if (isWin) {
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      prismRoots.push(path.join(appData, 'PrismLauncher', 'instances'));
    } else if (isMac) {
      prismRoots.push(path.join(homeDir, 'Library', 'Application Support', 'PrismLauncher', 'instances'));
    } else {
      prismRoots.push(path.join(homeDir, '.local', 'share', 'PrismLauncher', 'instances'));
      prismRoots.push(path.join(homeDir, '.var', 'app', 'org.prismlauncher.PrismLauncher', 'data', 'PrismLauncher', 'instances'));
    }

    for (const prismRoot of prismRoots) {
      if (fs.existsSync(prismRoot)) {
        try {
          const instances = fs.readdirSync(prismRoot);
          for (const inst of instances) {
            const saves = path.join(prismRoot, inst, '.minecraft', 'saves');
            const altSaves = path.join(prismRoot, inst, 'minecraft', 'saves');
            if (fs.existsSync(saves)) {
              searchTargets.push({ dir: saves, type: 'prism', instanceName: inst });
            } else if (fs.existsSync(altSaves)) {
              searchTargets.push({ dir: altSaves, type: 'prism', instanceName: inst });
            }
          }
        } catch {}
      }
    }

    // 5. Custom Directories
    for (const custom of this.customDirs) {
      if (fs.existsSync(custom)) {
        searchTargets.push({
          dir: custom,
          type: 'custom',
          instanceName: path.basename(custom),
        });
      }
    }

    // Collect all worlds
    const worlds: WorldInfo[] = [];
    const seenPaths = new Set<string>();

    for (const target of searchTargets) {
      try {
        const entries = fs.readdirSync(target.dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const worldDir = path.join(target.dir, entry.name);
            if (!seenPaths.has(worldDir)) {
              seenPaths.add(worldDir);
              const metadata = await NbtManager.readWorldMetadata(
                worldDir,
                target.type,
                target.instanceName
              );
              if (metadata) {
                worlds.push(metadata);
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error scanning directory ${target.dir}:`, err);
      }
    }

    // Sort by last played descending
    return worlds.sort((a, b) => b.lastPlayed - a.lastPlayed);
  }
}
