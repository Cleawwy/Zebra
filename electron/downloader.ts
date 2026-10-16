import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';
import { VersionManifestManager } from './versionManifest';

export class ServerJarDownloader {
  /**
   * Resolves and downloads the official server jar, Fabric launcher, or Paper server
   */
  public static async resolveOrDownload(
    cacheDir: string,
    version: string,
    loader: string,
    loaderVersion?: string,
    onProgress?: (msg: string) => void
  ): Promise<string> {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '');
    const cleanLoader = loader.toLowerCase();
    const loaderSuffix = loaderVersion ? `-${loaderVersion.replace(/[^a-zA-Z0-9.-]/g, '')}` : '';
    const jarFileName = `server-${cleanLoader}-${safeVersion}${loaderSuffix}.jar`;
    const targetPath = path.join(cacheDir, jarFileName);

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000000) {
      return targetPath;
    }

    if (onProgress) onProgress(`Resolving ${loader} server for Minecraft ${version}...`);

    if (cleanLoader === 'fabric') {
      return await this.downloadFabricServer(targetPath, safeVersion, loaderVersion, onProgress);
    } else if (cleanLoader === 'paper') {
      return await this.downloadPaperServer(targetPath, safeVersion, onProgress);
    } else {
      return await this.downloadVanillaServer(targetPath, safeVersion, onProgress);
    }
  }

  private static async downloadFabricServer(
    targetPath: string,
    mcVersion: string,
    loaderVersion?: string,
    onProgress?: (msg: string) => void
  ): Promise<string> {
    try {
      // 1. Query Fabric Meta API for latest loader and installer
      const metaUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`;
      const res = await fetch(metaUrl);
      if (!res.ok) {
        throw new Error(`Fabric Meta returned ${res.status}`);
      }
      const data = (await res.json()) as any;
      if (!Array.isArray(data) || data.length === 0) {
        return await this.downloadVanillaServer(targetPath, mcVersion, onProgress);
      }

      const chosenLoader = loaderVersion || (data[0]?.loader?.version ?? '0.16.10');
      const installerVersion = '1.0.1'; // universal installer
      const jarUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${chosenLoader}/${installerVersion}/server/jar`;

      if (onProgress) onProgress(`Downloading Fabric server jar (${chosenLoader})...`);
      await this.downloadFile(jarUrl, targetPath);
      return targetPath;
    } catch (err) {
      console.warn('Fabric server resolution failed, falling back to vanilla:', err);
      return await this.downloadVanillaServer(targetPath, mcVersion, onProgress);
    }
  }

  private static async downloadPaperServer(
    targetPath: string,
    mcVersion: string,
    onProgress?: (msg: string) => void
  ): Promise<string> {
    try {
      const buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`;
      const res = await fetch(buildsUrl);
      if (res.ok) {
        const data = (await res.json()) as any;
        const builds = data.builds;
        if (Array.isArray(builds) && builds.length > 0) {
          const latestBuild = builds[builds.length - 1];
          const buildNum = latestBuild.build;
          const downloadName = latestBuild.downloads.application.name;
          const paperJarUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${buildNum}/downloads/${downloadName}`;

          if (onProgress) onProgress(`Downloading Paper server build #${buildNum}...`);
          await this.downloadFile(paperJarUrl, targetPath);
          return targetPath;
        }
      }
    } catch (err) {
      console.warn('Paper download failed, falling back to vanilla:', err);
    }
    return await this.downloadVanillaServer(targetPath, mcVersion, onProgress);
  }

  private static async downloadVanillaServer(
    targetPath: string,
    mcVersion: string,
    onProgress?: (msg: string) => void
  ): Promise<string> {
    const manifest = await VersionManifestManager.getManifest();
    let versionEntry = manifest.versions.find((v: any) => v.id === mcVersion);

    if (!versionEntry || !versionEntry.url) {
      // Fallback to first valid release entry with URL
      versionEntry = manifest.versions.find((v: any) => v.url && v.type === 'release') || manifest.versions[0];
    }

    if (!versionEntry || !versionEntry.url) {
      throw new Error(`Version ${mcVersion} not found in Mojang manifest`);
    }

    const versionPackageRes = await fetch(versionEntry.url);
    const versionPackage = (await versionPackageRes.json()) as any;

    const serverDownloadUrl = versionPackage.downloads?.server?.url;
    if (!serverDownloadUrl) throw new Error(`No server download available for ${mcVersion}`);

    if (onProgress) onProgress(`Downloading official Mojang server for ${versionEntry.id}...`);
    await this.downloadFile(serverDownloadUrl, targetPath);
    return targetPath;
  }

  public static async ensureFabricApi(
    modsDir: string,
    mcVersion: string,
    onProgress?: (msg: string) => void
  ): Promise<string | null> {
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }

    try {
      const existing = fs.readdirSync(modsDir);
      const hasFabricApi = existing.some((f) => f.toLowerCase().includes('fabric-api'));
      if (hasFabricApi) return null;

      if (onProgress) onProgress(`Resolving Fabric API for Minecraft ${mcVersion}...`);
      const url = `https://api.modrinth.com/v2/project/fabric-api/version?game_versions=${encodeURIComponent(
        JSON.stringify([mcVersion])
      )}&loaders=${encodeURIComponent(JSON.stringify(['fabric']))}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Zebra/1.0 (zebra-minecraft-host)' },
      });
      if (!res.ok) return null;

      const data = (await res.json()) as any[];
      if (Array.isArray(data) && data.length > 0) {
        const primaryFile = data[0].files.find((f: any) => f.primary) || data[0].files[0];
        if (primaryFile && primaryFile.url) {
          const dest = path.join(modsDir, primaryFile.filename || `fabric-api-${mcVersion}.jar`);
          if (onProgress) onProgress(`Downloading Fabric API (${primaryFile.filename})...`);
          await this.downloadFile(primaryFile.url, dest);
          return dest;
        }
      }
    } catch (err) {
      console.warn('Failed to ensure Fabric API:', err);
    }
    return null;
  }

  public static async downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tempDest = `${dest}.tmp`;
      const file = fs.createWriteStream(tempDest);

      const client = url.startsWith('https') ? https : http;
      const request = (targetUrl: string) => {
        client.get(targetUrl, (response) => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            request(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            file.close();
            if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest);
            reject(new Error(`Download failed with status ${response.statusCode}`));
            return;
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close(() => {
              if (fs.existsSync(dest)) fs.unlinkSync(dest);
              fs.renameSync(tempDest, dest);
              resolve();
            });
          });
        }).on('error', (err) => {
          file.close();
          if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest);
          reject(err);
        });
      };

      request(url);
    });
  }

  /**
   * Recursively finds a java executable inside a folder (supports Windows bin, Linux bin, macOS Contents/Home/bin)
   */
  public static findJavaExecutable(dir: string): string | null {
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'java.exe' : 'java';

    if (!fs.existsSync(dir)) return null;

    const direct = path.join(dir, 'bin', binName);
    if (fs.existsSync(direct)) return direct;

    const search = (currentDir: string, depth: number): string | null => {
      if (depth > 5 || !fs.existsSync(currentDir)) return null;
      try {
        const directCandidate = path.join(currentDir, 'bin', binName);
        if (fs.existsSync(directCandidate)) return directCandidate;

        // macOS App bundle structure
        const homeCandidate = path.join(currentDir, 'Contents', 'Home', 'bin', binName);
        if (fs.existsSync(homeCandidate)) return homeCandidate;

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const res = search(path.join(currentDir, entry.name), depth + 1);
            if (res) return res;
          }
        }
      } catch {}
      return null;
    };

    return search(dir, 0);
  }

  /**
   * Automatically downloads and unpacks portable Adoptium Temurin JRE/JDK if not installed
   */
  public static async ensureJava(
    majorVersion: number = 21,
    onProgress?: (msg: string) => void
  ): Promise<string | null> {
    const isWin = process.platform === 'win32';
    const runtimesDir = path.join(os.homedir(), '.zebra', 'runtimes', `java-${majorVersion}`);

    const existingJava = this.findJavaExecutable(runtimesDir);
    if (existingJava) return existingJava;

    if (!fs.existsSync(runtimesDir)) fs.mkdirSync(runtimesDir, { recursive: true });

    const osName = isWin ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
    const archName = process.arch === 'arm64' ? 'aarch64' : 'x64';
    const ext = isWin ? 'zip' : 'tar.gz';

    onProgress?.(`Downloading portable Java ${majorVersion} runtime (${osName}/${archName})...`);
    const archivePath = path.join(runtimesDir, `runtime-${majorVersion}.${ext}`);
    const jreUrl = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/${osName}/${archName}/jre/hotspot/normal/eclipse`;
    const jdkUrl = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/${osName}/${archName}/jdk/hotspot/normal/eclipse`;

    try {
      try {
        await this.downloadFile(jreUrl, archivePath);
      } catch {
        // Fallback to JDK if JRE binary is unavailable
        await this.downloadFile(jdkUrl, archivePath);
      }

      onProgress?.(`Extracting portable Java ${majorVersion} runtime...`);
      if (isWin) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(runtimesDir, true);
      } else {
        const { execSync } = require('child_process');
        execSync(`tar -xzf "${archivePath}" -C "${runtimesDir}"`, { stdio: 'ignore' });
      }

      try { fs.unlinkSync(archivePath); } catch {}

      const resolvedBin = this.findJavaExecutable(runtimesDir);
      if (resolvedBin && !isWin) {
        try { fs.chmodSync(resolvedBin, 0o755); } catch {}
      }

      return resolvedBin;
    } catch (err) {
      console.warn(`Failed to auto-download Java ${majorVersion}:`, err);
    }
    return null;
  }

  public static async ensureJava21(onProgress?: (msg: string) => void): Promise<string | null> {
    return this.ensureJava(21, onProgress);
  }
}
