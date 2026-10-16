declare module 'nat-upnp' {
  export interface Client {
    portMapping(options: any, callback: (err?: any) => void): void;
    portUnmapping(options: any, callback: (err?: any) => void): void;
    externalIp(callback: (err: any, ip?: string) => void): void;
  }
  export function createClient(options?: any): Client;
}
