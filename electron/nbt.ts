import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as nbt from 'prismarine-nbt';
import { WorldInfo } from './types';

export class NbtManager {
  /**
   * Fast metadata extraction from level.dat and icon.png
   */
  public static async readWorldMetadata(
    worldDir: string,
    instanceType: WorldInfo['instanceType'],
    instanceName: string
  ): Promise<WorldInfo | null> {
    const levelDatPath = path.join(worldDir, 'level.dat');
    if (!fs.existsSync(levelDatPath)) {
      return null;
    }

    try {
      const buffer = fs.readFileSync(levelDatPath);
      const { parsed } = await nbt.parse(buffer);
      const data = (parsed.value as any)?.Data?.value;
      if (!data) return null;

      const name = data.LevelName?.value || path.basename(worldDir);
      const version = data.Version?.value?.Name?.value || 'Unknown';
      const lastPlayed = Number(data.LastPlayed?.value || fs.statSync(levelDatPath).mtimeMs);
      const gameTypeInt = data.GameType?.value ?? 0;
      const cheats = Boolean(data.allowCommands?.value ?? false);

      const gameTypes: Record<number, WorldInfo['gameType']> = {
        0: 'survival',
        1: 'creative',
        2: 'adventure',
        3: 'spectator',
      };

      // Detect loader from instance files
      const loader = this.detectLoader(worldDir);

      // Icon check
      let iconBase64: string | undefined = undefined;
      const iconPath = path.join(worldDir, 'icon.png');
      if (fs.existsSync(iconPath)) {
        try {
          iconBase64 = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
        } catch {
          // ignore icon read errors
        }
      }

      // Calculate approximate directory size
      const sizeBytes = this.getDirectorySize(worldDir);

      return {
        id: Buffer.from(worldDir).toString('base64url'),
        name,
        folderName: path.basename(worldDir),
        path: worldDir,
        instanceType,
        instanceName,
        version,
        loader,
        lastPlayed,
        sizeBytes,
        iconBase64,
        gameType: gameTypes[gameTypeInt] || 'survival',
        cheatsEnabled: cheats,
      };
    } catch (err) {
      console.error(`Failed to parse level.dat in ${worldDir}:`, err);
      return null;
    }
  }

  /**
   * Detects whether world is Vanilla, Fabric, Forge, or NeoForge based on instance layout
   */
  private static detectLoader(worldDir: string): WorldInfo['loader'] {
    const instanceDir = path.dirname(worldDir); // usually <instance>/saves
    const rootDir = path.dirname(instanceDir);  // <instance>

    // Check instance root for loader indicators
    if (fs.existsSync(path.join(rootDir, '.fabric')) || fs.existsSync(path.join(rootDir, 'fabric-server-launch.jar'))) {
      return 'Fabric';
    }
    if (fs.existsSync(path.join(rootDir, 'neoforge')) || fs.existsSync(path.join(rootDir, 'run.bat'))) {
      return 'NeoForge';
    }
    if (fs.existsSync(path.join(rootDir, 'forge')) || fs.existsSync(path.join(rootDir, 'usercache.json'))) {
      // Check mods folder
      const modsDir = path.join(rootDir, 'mods');
      if (fs.existsSync(modsDir)) {
        try {
          const files = fs.readdirSync(modsDir);
          if (files.some(f => f.toLowerCase().includes('fabric'))) return 'Fabric';
          if (files.some(f => f.toLowerCase().includes('forge'))) return 'Forge';
          if (files.length > 0) return 'Fabric'; // Default modern modded to Fabric
        } catch {}
      }
    }
    return 'Vanilla';
  }

  private static getDirectorySize(dir: string): number {
    let size = 0;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.isFile()) {
          size += stat.size;
        } else if (stat.isDirectory() && ['region', 'entities', 'poi', 'data'].includes(file)) {
          // sample region folders
          try {
            const subFiles = fs.readdirSync(full);
            for (const sf of subFiles) {
              size += fs.statSync(path.join(full, sf)).size;
            }
          } catch {}
        }
      }
    } catch {}
    return size;
  }

  /**
   * Synchronizes singleplayer host inventory from level.dat to playerdata/<uuid>.dat
   */
  public static async syncPlayerToDedicated(worldDir: string, hostUuid: string): Promise<boolean> {
    const levelDatPath = path.join(worldDir, 'level.dat');
    const playerdataDir = path.join(worldDir, 'playerdata');
    const targetDatPath = path.join(playerdataDir, `${hostUuid}.dat`);

    if (!fs.existsSync(levelDatPath)) return false;
    if (!fs.existsSync(playerdataDir)) {
      fs.mkdirSync(playerdataDir, { recursive: true });
    }

    try {
      const buffer = fs.readFileSync(levelDatPath);
      const { parsed } = await nbt.parse(buffer);
      const playerData = (parsed.value as any)?.Data?.value?.Player;
      if (!playerData) return false;

      // Wrap playerData as root compound
      const wrapped = {
        type: 'compound' as const,
        name: '',
        value: playerData.value,
      };

      const compressed = await nbt.writeUncompressed(wrapped);
      const gzipped = zlib.gzipSync(compressed);
      fs.writeFileSync(targetDatPath, gzipped);
      return true;
    } catch (err) {
      console.warn('Could not sync level.dat to playerdata:', err);
      return false;
    }
  }

  /**
   * Synchronizes multiplayer playerdata/<uuid>.dat back to level.dat
   */
  public static async syncPlayerToSingleplayer(worldDir: string, hostUuid: string): Promise<boolean> {
    const levelDatPath = path.join(worldDir, 'level.dat');
    const playerDatPath = path.join(worldDir, 'playerdata', `${hostUuid}.dat`);

    if (!fs.existsSync(levelDatPath) || !fs.existsSync(playerDatPath)) return false;

    try {
      const playerBuf = fs.readFileSync(playerDatPath);
      const { parsed: parsedPlayer } = await nbt.parse(playerBuf);

      const levelBuf = fs.readFileSync(levelDatPath);
      const { parsed: parsedLevel } = await nbt.parse(levelBuf);

      if ((parsedLevel.value as any)?.Data?.value) {
        (parsedLevel.value as any).Data.value.Player = {
          type: 'compound',
          value: parsedPlayer.value,
        };

        const uncompressed = await nbt.writeUncompressed(parsedLevel);
        const gzipped = zlib.gzipSync(uncompressed);
        fs.writeFileSync(levelDatPath, gzipped);
        return true;
      }
    } catch (err) {
      console.warn('Could not sync playerdata to level.dat:', err);
    }
    return false;
  }
}
