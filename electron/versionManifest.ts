import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface McVersionEntry {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  releaseTime: string;
}

export interface McVersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: McVersionEntry[];
}

export class VersionManifestManager {
  private static cachedManifest: McVersionManifest | null = null;
  private static cacheFile = path.join(os.homedir(), '.zebra', 'cache', 'version_manifest.json');

  public static async getManifest(): Promise<McVersionManifest> {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }

    // Try reading disk cache first
    if (fs.existsSync(this.cacheFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        const age = Date.now() - (data._timestamp || 0);
        // Cache valid for 4 hours
        if (age < 4 * 60 * 60 * 1000 && data.versions?.length > 0) {
          this.cachedManifest = data;
          return data;
        }
      } catch (e) {
        // ignore disk cache read error
      }
    }

    try {
      const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      if (res.ok) {
        const manifest = (await res.json()) as McVersionManifest;
        (manifest as any)._timestamp = Date.now();
        this.cachedManifest = manifest;

        // Persist to disk
        const dir = path.dirname(this.cacheFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.cacheFile, JSON.stringify(manifest));
        return manifest;
      }
    } catch (err) {
      console.warn('Failed to fetch Mojang version manifest online, checking cache:', err);
    }

    // Fallback if offline
    if (fs.existsSync(this.cacheFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      } catch {}
    }

    // Absolute fallback
    return {
      latest: { release: '26.3', snapshot: '26.4-snapshot-3' },
      versions: [
        { id: '26.3', type: 'release', url: '', releaseTime: new Date().toISOString() },
        { id: '1.21.4', type: 'release', url: '', releaseTime: new Date().toISOString() },
        { id: '1.21.1', type: 'release', url: '', releaseTime: new Date().toISOString() },
        { id: '1.20.4', type: 'release', url: '', releaseTime: new Date().toISOString() },
        { id: '1.20.1', type: 'release', url: '', releaseTime: new Date().toISOString() },
        { id: '1.19.4', type: 'release', url: '', releaseTime: new Date().toISOString() },
        { id: '1.18.2', type: 'release', url: '', releaseTime: new Date().toISOString() },
        { id: '1.16.5', type: 'release', url: '', releaseTime: new Date().toISOString() },
      ],
    };
  }

  public static async getVersionList(includeSnapshots: boolean = false): Promise<string[]> {
    const manifest = await this.getManifest();
    return manifest.versions
      .filter((v) => v.type === 'release' || (includeSnapshots && v.type === 'snapshot'))
      .map((v) => v.id);
  }
}
