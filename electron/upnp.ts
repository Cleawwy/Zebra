// @ts-ignore
import * as natUpnp from 'nat-upnp';
import * as http from 'http';

export class UpnpManager {
  private client: natUpnp.Client | null = null;
  private mappedPort: number | null = null;

  constructor() {
    try {
      this.client = natUpnp.createClient();
    } catch (err) {
      console.warn('Failed to initialize UPnP client:', err);
    }
  }

  /**
   * Attempts to map the port on the local router using UPnP IGD
   */
  public async openPort(port: number): Promise<boolean> {
    if (!this.client) return false;

    return new Promise((resolve) => {
      this.client!.portMapping(
        {
          public: port,
          private: port,
          ttl: 0,
          description: 'Zebra Host Minecraft Server',
        },
        (err: any) => {
          if (err) {
            console.warn(`UPnP mapping failed for port ${port}:`, err.message);
            resolve(false);
          } else {
            this.mappedPort = port;
            console.log(`UPnP successfully opened port ${port} on router`);
            resolve(true);
          }
        }
      );
    });
  }

  /**
   * Closes the port mapping on the router
   */
  public async closePort(port?: number): Promise<void> {
    const targetPort = port || this.mappedPort;
    if (!this.client || !targetPort) return;

    return new Promise((resolve) => {
      this.client!.portUnmapping({ public: targetPort }, (err: any) => {
        if (err) {
          console.warn(`UPnP unmapping failed for port ${targetPort}:`, err.message);
        } else {
          console.log(`UPnP cleanly closed port ${targetPort}`);
        }
        this.mappedPort = null;
        resolve();
      });
    });
  }

  /**
   * Fetches public IP for direct connection
   */
  public async getPublicIp(): Promise<string | null> {
    // 1. Fast HTTP Public IP Resolver (resolves in ~150ms)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('https://api.ipify.org', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const ip = (await res.text()).trim();
        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
          return ip;
        }
      }
    } catch {}

    // Fallback resolver
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('https://checkip.amazonaws.com', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const ip = (await res.text()).trim();
        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
          return ip;
        }
      }
    } catch {}

    // 2. Fallback to UPnP gateway if HTTP endpoints failed
    if (this.client) {
      try {
        const upnpIp = await new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 2000);
          this.client!.externalIp((err: any, ip?: string) => {
            clearTimeout(timeout);
            if (!err && ip) resolve(ip);
            else resolve(null);
          });
        });
        if (upnpIp) return upnpIp;
      } catch {}
    }

    return null;
  }
}
