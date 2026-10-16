import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import AdmZip from 'adm-zip';
import { ModpackInfo, ServerInstance } from './types';
import { ServerManager } from './serverManager';

export interface ModpackVersionItem {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  files: {
    url: string;
    filename: string;
    primary: boolean;
    size: number;
  }[];
}

export function classifyModpackSource(hit: any): 'modrinth' | 'curseforge' | 'ftb' | 'technic' {
  const title = (hit.title || '').toLowerCase();
  const slug = (hit.slug || '').toLowerCase();
  const desc = (hit.description || '').toLowerCase();
  const author = (hit.author || '').toLowerCase();
  const org = (hit.organization || '').toLowerCase();

  // 1. FTB Detection
  if (
    title.startsWith('ftb ') ||
    title.includes('feed the beast') ||
    title.includes('stoneblock') ||
    author.includes('feed the beast') ||
    org.includes('feed the beast') ||
    slug.startsWith('ftb-')
  ) {
    return 'ftb';
  }

  // 2. Technic / Tekkit Ecosystem Detection
  if (
    title.includes('tekkit') ||
    title.includes('technic') ||
    title.includes('hexxit') ||
    title.includes('attack of the b-team') ||
    title.includes('voltz') ||
    title.includes('blightfall') ||
    title.includes('the 1.7.10 pack') ||
    title.includes('yogbox') ||
    slug.includes('tekkit') ||
    slug.includes('technic') ||
    slug.includes('hexxit') ||
    desc.includes('technic pack') ||
    desc.includes('tekkit')
  ) {
    return 'technic';
  }

  // 3. CurseForge Ecosystem Detection (Iconic CurseForge Studios, Creators & Syndicated Flagships)
  const curseforgeOrgsAndAuthors = [
    'luna pixel studios',
    'shxskie',
    'shxrkie',
    'elocindev',
    'allthemods',
    'atm team',
    'shivaxi',
    'sharkietv',
    'pixelmon',
    'bisecthosting',
    'darkosto',
    'vazkii',
    'sshmoob',
    'flamefire',
    'lumyverse',
    'muzzlecraft',
    'youngfool',
  ];
  const isCurseforgeCreator = curseforgeOrgsAndAuthors.some(
    (c) => author.includes(c) || org.includes(c)
  );

  const curseforgePacks = [
    'better mc',
    'bmc',
    'prominence',
    'medieval mc',
    'dawncraft',
    'all the mods',
    'rlcraft',
    'deceasedcraft',
    'vault hunters',
    'cisco',
    'dungeons arise',
    'roguelike adventures',
    'sevtech',
    'skyfactory',
    'crucial',
    'create+',
    'create: astral',
    'the pixelmon modpack',
    'zombie invade',
    'battlearmory',
  ];
  const isCurseforgePack = curseforgePacks.some(
    (p) => title.includes(p) || slug.includes(p.replace(/\s+/g, '-'))
  );

  if (isCurseforgeCreator || isCurseforgePack || desc.includes('curseforge') || desc.includes('curse forge')) {
    return 'curseforge';
  }

  return 'modrinth';
}

export class ModpackProvisioner {
  /**
   * Fetch official modpacks from the public Feed The Beast API
   */
  private static async fetchFtbModpacks(query: string = '', limit = 16): Promise<ModpackInfo[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      let packIds: number[] = [];
      if (query.trim()) {
        const searchUrl = `https://api.feed-the-beast.com/v1/modpacks/public/modpack/search/${limit}?term=${encodeURIComponent(query.trim())}`;
        const res = await fetch(searchUrl, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as any;
          packIds = (data.packs || []).slice(0, limit);
        }
      } else {
        const popUrl = `https://api.feed-the-beast.com/v1/modpacks/public/modpack/popular/installs/${limit}`;
        const res = await fetch(popUrl, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as any;
          packIds = (data.packs || []).slice(0, limit);
        }
      }
      clearTimeout(timeout);

      if (!packIds || packIds.length === 0) return [];

      const packDetails = await Promise.all(
        packIds.map(async (id) => {
          try {
            const detailRes = await fetch(`https://api.feed-the-beast.com/v1/modpacks/public/modpack/${id}`, {
              headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
            });
            if (!detailRes.ok) return null;
            const p = (await detailRes.json()) as any;
            const squareArt = (p.art || []).find((a: any) => a.type === 'square') || (p.art || [])[0];
            const latestVersion = (p.versions && p.versions.length > 0) ? p.versions[p.versions.length - 1] : null;
            const gameTarget = latestVersion?.targets?.find((t: any) => t.type === 'game');
            const modloaderTarget = latestVersion?.targets?.find((t: any) => t.type === 'modloader');

            return {
              id: `ftb_${p.id}`,
              title: p.name,
              summary: p.synopsis || p.description || '',
              iconUrl: squareArt?.url || '',
              author: (p.authors && p.authors.length > 0) ? p.authors.map((a: any) => a.name).join(', ') : 'Feed The Beast',
              downloads: p.installs || p.plays || 0,
              latestVersion: latestVersion?.name || 'Release',
              supportedMcVersions: gameTarget ? [gameTarget.version] : ['1.20.1'],
              loader: modloaderTarget ? (modloaderTarget.name.toLowerCase().includes('fabric') ? 'Fabric' : 'Forge') : 'Forge',
              source: 'ftb' as const,
            } as ModpackInfo;
          } catch {
            return null;
          }
        })
      );

      return packDetails.filter((p): p is ModpackInfo => p !== null);
    } catch (err) {
      console.warn('[ModpackProvisioner] FTB fetch notice:', err);
      return [];
    }
  }

  /**
   * Fetch CurseForge modpacks via the open modpacks.ch / FTB bridge API
   */
  private static async fetchCurseForgeModpacks(query: string = '', limit = 16): Promise<ModpackInfo[]> {
    if (!query.trim()) return [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      const searchUrl = `https://api.feed-the-beast.com/v1/modpacks/public/modpack/search/${limit}?term=${encodeURIComponent(query.trim())}`;
      const res = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return [];

      const data = (await res.json()) as any;
      const cfIds: number[] = (data.curseforge || []).slice(0, limit);
      if (!cfIds || cfIds.length === 0) return [];

      const packDetails = await Promise.all(
        cfIds.map(async (id) => {
          try {
            const detailRes = await fetch(`https://api.feed-the-beast.com/v1/modpacks/public/curseforge/${id}`, {
              headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
            });
            if (!detailRes.ok) return null;
            const p = (await detailRes.json()) as any;
            const squareArt = (p.art || []).find((a: any) => a.type === 'square') || (p.art || [])[0];
            const latestVersion = (p.versions && p.versions.length > 0) ? p.versions[0] : null;
            const gameTarget = latestVersion?.targets?.find((t: any) => t.type === 'game');
            const modloaderTarget = latestVersion?.targets?.find((t: any) => t.type === 'modloader');

            return {
              id: `cf_${p.id}`,
              title: p.name,
              summary: p.synopsis || p.description || '',
              iconUrl: squareArt?.url || '',
              author: (p.authors && p.authors.length > 0) ? p.authors.map((a: any) => a.name).join(', ') : 'CurseForge',
              downloads: p.installs || p.plays || 0,
              latestVersion: latestVersion?.name || 'Release',
              supportedMcVersions: gameTarget ? [gameTarget.version] : ['1.20.1'],
              loader: modloaderTarget ? (modloaderTarget.name.toLowerCase().includes('fabric') ? 'Fabric' : 'Forge') : 'Forge',
              source: 'curseforge' as const,
            } as ModpackInfo;
          } catch {
            return null;
          }
        })
      );

      return packDetails.filter((p): p is ModpackInfo => p !== null);
    } catch (err) {
      console.warn('[ModpackProvisioner] CurseForge search notice:', err);
      return [];
    }
  }

  /**
   * Search modpacks across Modrinth, CurseForge, FTB, and Technic platforms
   */
  public static async searchModpacks(
    query: string = '',
    version?: string,
    platform: 'all' | 'modrinth' | 'curseforge' | 'ftb' | 'technic' = 'all'
  ): Promise<ModpackInfo[]> {
    try {
      // 1. FTB Platform Request
      if (platform === 'ftb') {
        const ftbPacks = await this.fetchFtbModpacks(query, 20);
        return ftbPacks;
      }

      // 2. Technic Platform Request
      if (platform === 'technic') {
        let rawHits: any[] = [];
        if (query.trim()) {
          const res = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(query.trim())}&limit=30&facets=[[%22project_type:modpack%22]]`, {
            headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
          });
          if (res.ok) {
            const data = (await res.json()) as any;
            rawHits = data.hits || [];
          }
        } else {
          // Aggregate popular Technic / Tekkit ecosystem packs
          const [tekRes, techRes, hexRes] = await Promise.all([
            fetch('https://api.modrinth.com/v2/search?query=tekkit&limit=20&facets=[[%22project_type:modpack%22]]', { headers: { 'User-Agent': 'Zebra/1.0' } }).then((r) => r.json()).catch(() => ({})),
            fetch('https://api.modrinth.com/v2/search?query=technic&limit=20&facets=[[%22project_type:modpack%22]]', { headers: { 'User-Agent': 'Zebra/1.0' } }).then((r) => r.json()).catch(() => ({})),
            fetch('https://api.modrinth.com/v2/search?query=hexxit&limit=15&facets=[[%22project_type:modpack%22]]', { headers: { 'User-Agent': 'Zebra/1.0' } }).then((r) => r.json()).catch(() => ({})),
          ]);
          const seen = new Set<string>();
          for (const h of [...(tekRes.hits || []), ...(techRes.hits || []), ...(hexRes.hits || [])]) {
            if (h.project_id && !seen.has(h.project_id)) {
              seen.add(h.project_id);
              rawHits.push(h);
            }
          }
        }
        return rawHits.map((hit: any) => ({
          id: hit.project_id || hit.slug,
          title: hit.title,
          summary: hit.description || '',
          iconUrl: hit.icon_url || '',
          author: hit.author || 'Unknown',
          downloads: hit.downloads || 0,
          latestVersion: hit.latest_version || '',
          supportedMcVersions: hit.versions || [],
          loader: (hit.categories || []).find((c: string) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c.toLowerCase())) || 'Forge',
          source: 'technic' as const,
        }));
      }

      // 3. CurseForge Platform Request
      if (platform === 'curseforge') {
        let rawHits: ModpackInfo[] = [];
        if (query.trim()) {
          // Query CurseForge catalog via open API bridge (SkyFactory, Better MC, ATM, etc.)
          const cfBridgeHits = await this.fetchCurseForgeModpacks(query.trim(), 16);

          // Also search Modrinth for any community ports
          const res = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(query.trim())}&limit=20&facets=[[%22project_type:modpack%22]]`, {
            headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
          });
          let modrinthHits: ModpackInfo[] = [];
          if (res.ok) {
            const data = (await res.json()) as any;
            modrinthHits = (data.hits || []).map((hit: any) => ({
              id: hit.project_id || hit.slug,
              title: hit.title,
              summary: hit.description || '',
              iconUrl: hit.icon_url || '',
              author: hit.author || 'Unknown',
              downloads: hit.downloads || 0,
              latestVersion: hit.latest_version || '',
              supportedMcVersions: hit.versions || [],
              loader: (hit.categories || []).find((c: string) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c.toLowerCase())) || 'Fabric',
              source: 'curseforge' as const,
            }));
          }

          // Merge & deduplicate by title
          const seen = new Set<string>();
          for (const pack of [...cfBridgeHits, ...modrinthHits]) {
            const normTitle = pack.title.toLowerCase().trim();
            if (!seen.has(normTitle)) {
              seen.add(normTitle);
              rawHits.push(pack);
            }
          }
          return rawHits;
        } else {
          // Aggregate iconic CurseForge flagships & creators (Better MC, Prominence, ATM, Create+, Pixelmon, etc.)
          const [popRes, cfRes] = await Promise.all([
            fetch('https://api.modrinth.com/v2/search?limit=80&index=downloads&facets=[[%22project_type:modpack%22]]', { headers: { 'User-Agent': 'Zebra/1.0' } }).then((r) => r.json()).catch(() => ({})),
            fetch('https://api.modrinth.com/v2/search?query=curseforge&limit=25&facets=[[%22project_type:modpack%22]]', { headers: { 'User-Agent': 'Zebra/1.0' } }).then((r) => r.json()).catch(() => ({})),
          ]);
          const seen = new Set<string>();
          const packs: ModpackInfo[] = [];
          for (const h of [...(popRes.hits || []), ...(cfRes.hits || [])]) {
            if (h.project_id && !seen.has(h.project_id)) {
              seen.add(h.project_id);
              if (classifyModpackSource(h) === 'curseforge') {
                packs.push({
                  id: h.project_id || h.slug,
                  title: h.title,
                  summary: h.description || '',
                  iconUrl: h.icon_url || '',
                  author: h.author || 'Unknown',
                  downloads: h.downloads || 0,
                  latestVersion: h.latest_version || '',
                  supportedMcVersions: h.versions || [],
                  loader: (h.categories || []).find((c: string) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c.toLowerCase())) || 'Fabric',
                  source: 'curseforge' as const,
                });
              }
            }
          }
          return packs;
        }
      }

      // 4. Modrinth Native Platform Request
      if (platform === 'modrinth') {
        const params = new URLSearchParams({
          query: query.trim(),
          limit: '30',
          index: 'downloads',
          facets: JSON.stringify(version ? [['project_type:modpack'], [`versions:${version}`]] : [['project_type:modpack']]),
        });
        const res = await fetch(`https://api.modrinth.com/v2/search?${params.toString()}`, {
          headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        const hits = (data.hits || []).filter((h: any) => classifyModpackSource(h) === 'modrinth');
        return hits.map((hit: any) => ({
          id: hit.project_id || hit.slug,
          title: hit.title,
          summary: hit.description || '',
          iconUrl: hit.icon_url || '',
          author: hit.author || 'Unknown',
          downloads: hit.downloads || 0,
          latestVersion: hit.latest_version || '',
          supportedMcVersions: hit.versions || [],
          loader: (hit.categories || []).find((c: string) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c.toLowerCase())) || 'Fabric',
          source: 'modrinth' as const,
        }));
      }

      // 5. 'All Sources' Request
      const params = new URLSearchParams({
        query: query.trim(),
        limit: '24',
        index: 'downloads',
        facets: JSON.stringify(version ? [['project_type:modpack'], [`versions:${version}`]] : [['project_type:modpack']]),
      });
      const res = await fetch(`https://api.modrinth.com/v2/search?${params.toString()}`, {
        headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
      });
      let allHits: ModpackInfo[] = [];
      if (res.ok) {
        const data = (await res.json()) as any;
        allHits = (data.hits || []).map((hit: any) => ({
          id: hit.project_id || hit.slug,
          title: hit.title,
          summary: hit.description || '',
          iconUrl: hit.icon_url || '',
          author: hit.author || 'Unknown',
          downloads: hit.downloads || 0,
          latestVersion: hit.latest_version || '',
          supportedMcVersions: hit.versions || [],
          loader: (hit.categories || []).find((c: string) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c.toLowerCase())) || 'Fabric',
          source: classifyModpackSource(hit),
        }));
      }

      // Also merge in official FTB and CurseForge packs when browsing or searching all sources
      try {
        const [ftbHits, cfHits] = await Promise.all([
          this.fetchFtbModpacks(query.trim(), query.trim() ? 6 : 8),
          query.trim() ? this.fetchCurseForgeModpacks(query.trim(), 10) : Promise.resolve([]),
        ]);
        const seen = new Set<string>();
        const combined: ModpackInfo[] = [];
        for (const p of [...allHits, ...cfHits, ...ftbHits]) {
          const norm = p.title.toLowerCase().trim();
          if (!seen.has(norm)) {
            seen.add(norm);
            combined.push(p);
          }
        }
        combined.sort((a, b) => b.downloads - a.downloads);
        return combined;
      } catch {
        return allHits;
      }
    } catch (err) {
      console.error('Failed to search modpacks:', err);
      return [];
    }
  }

  /**
   * Fetch versions for a selected modpack project
   */
  public static async getModpackVersions(projectId: string): Promise<ModpackVersionItem[]> {
    try {
      // FTB Modpack Versions
      if (projectId.startsWith('ftb_')) {
        const ftbId = projectId.replace(/^ftb_/, '');
        const res = await fetch(`https://api.feed-the-beast.com/v1/modpacks/public/modpack/${ftbId}`, {
          headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        const versions = (data.versions || []).slice(-15).reverse();

        return versions.map((v: any) => {
          const gameTarget = (v.targets || []).find((t: any) => t.type === 'game');
          const modloaderTarget = (v.targets || []).find((t: any) => t.type === 'modloader');
          return {
            id: `ftbv_${v.id}`,
            name: v.name,
            versionNumber: v.name,
            gameVersions: [gameTarget?.version || '1.20.1'],
            loaders: [modloaderTarget?.name || 'forge'],
            files: [
              {
                url: `https://api.feed-the-beast.com/v1/modpacks/public/modpack/${ftbId}/${v.id}`,
                filename: `${v.name}.json`,
                primary: true,
                size: 0,
              },
            ],
          };
        });
      }

      // CurseForge Modpack Versions (via open bridge)
      if (projectId.startsWith('cf_')) {
        const cfId = projectId.replace(/^cf_/, '');
        const res = await fetch(`https://api.feed-the-beast.com/v1/modpacks/public/curseforge/${cfId}`, {
          headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        const versions = (data.versions || []).slice(0, 15);

        return versions.map((v: any) => {
          const gameTarget = (v.targets || []).find((t: any) => t.type === 'game');
          const modloaderTarget = (v.targets || []).find((t: any) => t.type === 'modloader');
          return {
            id: `cfv_${v.id}`,
            name: v.name,
            versionNumber: v.name,
            gameVersions: [gameTarget?.version || '1.20.1'],
            loaders: [modloaderTarget?.name || 'forge'],
            files: [
              {
                url: `https://api.feed-the-beast.com/v1/modpacks/public/curseforge/${cfId}/${v.id}`,
                filename: `${v.name}.json`,
                primary: true,
                size: 0,
              },
            ],
          };
        });
      }

      // Modrinth Modpack Versions
      const url = `https://api.modrinth.com/v2/project/${projectId}/version`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
      });
      if (!res.ok) return [];

      const versions = (await res.json()) as any[];
      return versions.slice(0, 15).map((v) => ({
        id: v.id,
        name: v.name,
        versionNumber: v.version_number,
        gameVersions: v.game_versions || [],
        loaders: v.loaders || ['fabric'],
        files: (v.files || []).map((f: any) => ({
          url: f.url,
          filename: f.filename,
          primary: f.primary ?? false,
          size: f.size || 0,
        })),
      }));
    } catch (err) {
      console.error('Failed to fetch modpack versions:', err);
      return [];
    }
  }

  /**
   * Installs and provisions a modpack into a clean dedicated server instance
   */
  public static async installModpack(
    modpack: ModpackInfo,
    selectedVersion: ModpackVersionItem,
    serverManager: ServerManager
  ): Promise<ServerInstance> {
    const mcVersion = selectedVersion.gameVersions[0] || '1.21.1';
    const rawLoader = (selectedVersion.loaders[0] || modpack.loader || 'Fabric').toLowerCase();
    const loader = rawLoader.includes('forge') ? 'Forge' : 'Fabric';

    // 1. Create instance in ~/.zebra/servers/
    const instance = await serverManager.createServer({
      name: `${modpack.title} (${selectedVersion.versionNumber || mcVersion})`,
      version: mcVersion,
      loader: loader as any,
      ramMode: 'auto',
      maxRamGb: 6,
      motd: `Hosted via Zebra - ${modpack.title}`,
    });

    // 2. Install files based on platform origin
    const primaryFile = selectedVersion.files.find((f) => f.primary) || selectedVersion.files[0];

    // FTB & CurseForge Server Provisioning (manifest files schema)
    const isBridgePack = modpack.source === 'ftb' || modpack.id.startsWith('ftb_') || modpack.id.startsWith('cf_') || (primaryFile?.url && primaryFile.url.includes('feed-the-beast.com'));
    if (isBridgePack && primaryFile && primaryFile.url) {
      try {
        const res = await fetch(primaryFile.url);
        if (res.ok) {
          const vData = (await res.json()) as any;
          const files = (vData.files || []).filter((f: any) => !f.clientonly);
          for (const file of files) {
            if (file.url && file.name) {
              if (file.type === 'cf-extract') {
                try {
                  const tempZip = path.join(instance.path, 'cf_overrides.tmp');
                  await this.downloadFile(file.url, tempZip);
                  if (fs.existsSync(tempZip)) {
                    const zip = new AdmZip(tempZip);
                    const zipEntries = zip.getEntries();
                    for (const entry of zipEntries) {
                      if (entry.entryName.startsWith('overrides/')) {
                        const targetSub = entry.entryName.replace(/^overrides\//, '');
                        if (targetSub && !entry.isDirectory) {
                          const targetFilePath = path.join(instance.path, targetSub);
                          const targetDir = path.dirname(targetFilePath);
                          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                          fs.writeFileSync(targetFilePath, entry.getData());
                        }
                      }
                    }
                    try { fs.unlinkSync(tempZip); } catch {}
                  }
                } catch (e) {
                  console.warn('[CF Install] Error extracting overrides:', e);
                }
              } else if (file.path) {
                const relDir = file.path.replace(/^\.\//, '');
                const targetDir = path.join(instance.path, relDir);
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                const targetPath = path.join(targetDir, file.name);
                try {
                  await this.downloadFile(file.url, targetPath);
                } catch (e) {
                  console.warn('[Server Provision] Error downloading file:', file.name, e);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to provision modpack server files:', err);
      }
    } else if (primaryFile && primaryFile.url) {
      // Modrinth mrpack archive provisioning
      try {
        const tempMrpack = path.join(instance.path, 'modpack.tmp');
        await this.downloadFile(primaryFile.url, tempMrpack);

        if (fs.existsSync(tempMrpack)) {
          try {
            const zip = new AdmZip(tempMrpack);
            const zipEntries = zip.getEntries();

            // 1. Process modrinth.index.json
            const indexEntry = zip.getEntry('modrinth.index.json');
            if (indexEntry) {
              try {
                const indexData = JSON.parse(indexEntry.getData().toString('utf8'));
                const files = indexData.files || [];
                const serverFiles = files.filter((f: any) => !f.env || f.env.server !== 'unsupported');

                for (const sf of serverFiles) {
                  if (sf.downloads && sf.downloads.length > 0) {
                    const downloadUrl = sf.downloads[0];
                    const relPath = sf.path;
                    const targetFile = path.join(instance.path, relPath);
                    const targetDir = path.dirname(targetFile);
                    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                    try {
                      await this.downloadFile(downloadUrl, targetFile);
                    } catch (e) {
                      console.warn('Failed to download modpack mod:', relPath, e);
                    }
                  }
                }

                if (indexData.dependencies && indexData.dependencies['fabric-loader']) {
                  serverManager.updateServerConfig(instance.id, {
                    loaderVersion: indexData.dependencies['fabric-loader'],
                  });
                }
              } catch (e) {
                console.warn('Failed to process modrinth.index.json:', e);
              }
            }

            // 2. Extract overrides & server-overrides
            for (const entry of zipEntries) {
              if (entry.entryName.startsWith('overrides/')) {
                const targetSub = entry.entryName.replace(/^overrides\//, '');
                if (targetSub) {
                  zip.extractEntryTo(entry, instance.path, true, true);
                }
              } else if (entry.entryName.startsWith('server-overrides/')) {
                const targetSub = entry.entryName.replace(/^server-overrides\//, '');
                if (targetSub) {
                  zip.extractEntryTo(entry, instance.path, true, true);
                }
              }
            }
          } catch (e) {
            console.warn('Could not extract mrpack overrides:', e);
          }
          try { fs.unlinkSync(tempMrpack); } catch {}
        }
      } catch (err) {
        console.warn('Failed to download mrpack archive:', err);
      }
    }

    // 3. Download modpack icon if available
    if (modpack.iconUrl) {
      try {
        const iconTemp = path.join(instance.path, 'icon_dl.png');
        await this.downloadFile(modpack.iconUrl, iconTemp);
        await serverManager.setServerIconFromFile(instance.id, iconTemp);
        try { fs.unlinkSync(iconTemp); } catch {}
      } catch {}
    }

    return instance;
  }

  private static async downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url, { headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' } });
    if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    await fs.promises.writeFile(dest, Buffer.from(arrayBuf));
  }
}
