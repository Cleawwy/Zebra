import * as dgram from 'dgram';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import WebSocket from 'ws';

// Framing Constants
const MAGIC_BYTE = 0x5a; // 'Z' for Zebra
const TYPE_PUNCH_SYN = 0x01;
const TYPE_PUNCH_ACK = 0x02;
const TYPE_DATA = 0x03;
const TYPE_ACK = 0x04;
const TYPE_PING = 0x05;
const TYPE_CLOSE = 0x06;

const HEADER_SIZE = 20; // 20-byte header with 64-bit SACK
const MAX_PAYLOAD_SIZE = 1280; // MTU-safe segment size avoiding IP fragmentation
const INIT_CWND = 512; // Initial congestion window in packets (~650 KB)
const MIN_CWND = 256; // High-throughput floor (~320 KB) preventing WAN starvation during modded chunk loads
const MAX_CWND = 4096; // Full BDP window (~5.2 MB) saturating high-bandwidth fiber
const INIT_SSTHRESH = 1024;
const PACING_BURST_LIMIT = 128; // Max packets per micro-burst (~160 KB burst per event loop turn)

interface PendingPacket {
  packet: Buffer;
  seq: number;
  payloadLength: number;
  sentAt: number;
  retries: number;
  sacked: boolean;
}

interface GuestSession {
  sessionId: string;
  guestIp: string;
  guestUdpPort: number;
  punched: boolean;
  useRelay?: boolean;
  localTcpSocket?: net.Socket;
  punchTimer?: NodeJS.Timeout;
  lastActive: number;

  // ARQ Reliable Transport & Congestion Control State (Reno / BBR style)
  nextSeq: number;
  expectedSeq: number;
  pendingPackets: Map<number, PendingPacket>;
  reorderBuffer: Map<number, Buffer>;
  sendQueue: Buffer[]; // Queue for paced packet egress

  cwnd: number; // Congestion window (packets)
  ssthresh: number; // Slow start threshold
  srtt: number; // Smoothed RTT in ms
  rttvar: number; // RTT variance in ms
  rto: number; // Dynamic RTO in ms

  lastCumulativeAck: number;
  dupAckCount: number;

  retransmitTimer?: NodeJS.Timeout;
  keepAliveTimer?: NodeJS.Timeout;
  pacerHandle?: NodeJS.Immediate;
}

export class P2PHostEngine {
  private udpSocket: dgram.Socket | null = null;
  private ws: WebSocket | null = null;
  private roomCode: string = '';
  private localMinecraftPort: number = 25565;
  private vpsHost: string = '163.245.213.207';
  private vpsWsPort: number = 9090;
  private stunHost: string = 'stun.l.google.com';
  private stunPort: number = 19302;

  private hostReflexiveIp: string | null = null;
  private hostReflexiveUdpPort: number | null = null;
  private e4mcDomain: string | null = null;
  private logCallback?: (msg: string) => void;

  private sessions = new Map<string, GuestSession>();
  private heartbeatInterval?: NodeJS.Timeout;
  private stunInterval?: NodeJS.Timeout;
  private isResolvingStun: boolean = false;
  private onNetworkRecoveredCallback?: () => void;
  private isRunning: boolean = false;
  private dweetPollInterval?: NodeJS.Timeout;
  private dweetStreamReq?: any;
  private ntfyWs: WebSocket | null = null;
  private processedGuestSessions: Set<string> = new Set();

  constructor(vpsHost?: string, vpsWsPort?: number, stunPort?: number, stunHost?: string) {
    if (vpsHost) this.vpsHost = vpsHost;
    if (vpsWsPort) this.vpsWsPort = vpsWsPort;
    if (stunPort) this.stunPort = stunPort;
    if (stunHost) this.stunHost = stunHost;

    if (!this.vpsHost) {
      try {
        const base = process.env.APPDATA || (process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Application Support')
          : path.join(os.homedir(), '.config'));
        const settingsPath = path.join(base, 'Zebra', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          const raw = fs.readFileSync(settingsPath, 'utf8');
          const data = JSON.parse(raw);
          if (data.signalingHost) {
            this.vpsHost = data.signalingHost.trim();
          }
          if (data.signalingPort) {
            this.vpsWsPort = Number(data.signalingPort) || 9090;
          }
          if (data.stunPort) {
            this.stunPort = Number(data.stunPort) || 19302;
          }
        }
      } catch (err: any) {
        console.warn('[P2P Host] Could not load settings fallback:', err?.message || err);
      }
    }
  }

  public setE4mcDomain(domain: string) {
    this.e4mcDomain = domain.trim().toLowerCase();
    this.syncRoomRegistry();
  }

  public getE4mcDomain(): string | null {
    return this.e4mcDomain;
  }

  public syncRoomRegistry() {
    if (!this.roomCode) return;
    const vpsEndpoint = this.vpsHost ? `${this.vpsHost}:${this.vpsWsPort || 9090}` : undefined;
    const query = new URLSearchParams({
      ip: this.e4mcDomain || this.hostReflexiveIp || '',
      port: this.localMinecraftPort.toString(),
      ...(this.hostReflexiveUdpPort ? { udpPort: this.hostReflexiveUdpPort.toString() } : {}),
      status: 'online',
      ...(this.e4mcDomain ? { e4mc: this.e4mcDomain } : {}),
      ...(this.hostReflexiveIp ? { directIp: this.hostReflexiveIp } : {}),
      ...(vpsEndpoint ? { vps: vpsEndpoint } : {}),
    });
    fetch(`https://dweet.cc/dweet/for/zebra-${this.roomCode}?${query.toString()}`).catch(() => {});

    // Broadcast room endpoint to instant ntfy.sh pubsub topic
    fetch(`https://ntfy.sh/zebra-${this.roomCode}`, {
      method: 'POST',
      headers: { 'Title': 'Room Discovery' },
      body: JSON.stringify({
        ip: this.e4mcDomain || this.hostReflexiveIp || '',
        port: this.localMinecraftPort,
        udpPort: this.hostReflexiveUdpPort,
        status: 'online',
        ...(this.e4mcDomain ? { e4mc: this.e4mcDomain } : {}),
        ...(this.hostReflexiveIp ? { directIp: this.hostReflexiveIp } : {}),
        ...(vpsEndpoint ? { vps: vpsEndpoint } : {}),
      }),
    }).catch(() => {});

    if (this.vpsHost) {
      const regPayload: any = {
        port: this.localMinecraftPort,
        status: 'online',
        ip: this.e4mcDomain || this.hostReflexiveIp || '',
        udpPort: this.hostReflexiveUdpPort,
        ...(this.e4mcDomain ? { e4mc: this.e4mcDomain } : {}),
      };
      fetch(`http://${this.vpsHost}:${this.vpsWsPort}/api/room/${this.roomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regPayload),
      }).catch(() => {});
    }
  }

  private log(msg: string) {
    if (this.logCallback) this.logCallback(msg);
    console.log(msg);
  }

  public async start(roomCode: string, localMinecraftPort: number, logCallback?: (msg: string) => void): Promise<boolean> {
    this.stop();
    this.logCallback = logCallback;
    this.roomCode = roomCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    this.localMinecraftPort = localMinecraftPort;
    this.isRunning = true;

    try {
      // 1. Initialize UDP socket
      this.udpSocket = dgram.createSocket('udp4');
      await new Promise<void>((resolve) => {
        this.udpSocket!.bind(0, '0.0.0.0', () => resolve());
      });

      try { this.udpSocket.setRecvBufferSize(4 * 1024 * 1024); } catch {}
      try { this.udpSocket.setSendBufferSize(4 * 1024 * 1024); } catch {}

      this.udpSocket.on('message', (msg, rinfo) => this.handleUdpMessage(msg, rinfo));
      this.udpSocket.on('error', (err) => console.warn('[P2P Host] UDP socket error:', err.message));

      // 2. Discover external reflexive address via RFC 5389 STUN
      const reflexive = await this.resolveStun();
      if (reflexive) {
        this.hostReflexiveIp = reflexive.ip;
        this.hostReflexiveUdpPort = reflexive.port;
        console.log(`[Zebra P2P] STUN discovered host reflexive endpoint: ${this.hostReflexiveIp}:${this.hostReflexiveUdpPort}`);
      }

      // 3. Connect to Signaling Server & Register Room
      this.connectSignaling();

      // 4. Start periodic STUN keep-alive & NAT mapping refresh
      this.startStunKeepAlive();

      // 5. Start Zero-Account Public Rendezvous Stream (ntfy.sh + dweet.cc + Google STUN)
      this.startRendezvousListeners();

      // 6. Attempt UPnP port mapping for local UDP socket to guarantee zero-firewall ingress
      try {
        const localPort = this.udpSocket.address().port;
        const natUpnp = require('nat-upnp');
        const upnpClient = natUpnp.createClient();
        upnpClient.portMapping({
          public: localPort,
          private: localPort,
          ttl: 0,
          protocol: 'udp',
          description: 'Zebra P2P UDP Direct',
        }, (err: any) => {
          if (!err) console.log(`[Zebra P2P] UPnP successfully forwarded UDP port ${localPort} on gateway`);
        });
      } catch {}

      return true;
    } catch (err: any) {
      console.warn('[P2P Host] Start failed:', err.message);
      return false;
    }
  }

  public getReflexiveIp(): string | null {
    return this.hostReflexiveIp;
  }

  public getReflexivePort(): number | null {
    return this.hostReflexiveUdpPort;
  }

  public setOnNetworkRecovered(cb: () => void) {
    this.onNetworkRecoveredCallback = cb;
  }

  public stop() {
    this.isRunning = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.stunInterval) {
      clearInterval(this.stunInterval);
      this.stunInterval = undefined;
    }
    if (this.dweetPollInterval) {
      clearInterval(this.dweetPollInterval);
      this.dweetPollInterval = undefined;
    }
    if (this.dweetStreamReq) {
      try { this.dweetStreamReq.destroy(); } catch {}
      this.dweetStreamReq = undefined;
    }
    if (this.ntfyWs) {
      try { this.ntfyWs.close(); } catch {}
      this.ntfyWs = null;
    }
    this.processedGuestSessions.clear();

    for (const session of this.sessions.values()) {
      this.cleanupSession(session);
    }
    this.sessions.clear();

    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    if (this.udpSocket) {
      try { this.udpSocket.close(); } catch {}
      this.udpSocket = null;
    }
  }

  private startRendezvousListeners() {
    if (!this.roomCode) return;
    const cleanRoom = this.roomCode;

    // 1. Ultra-fast real-time WebSocket pubsub via ntfy.sh (Zero accounts, ~30-50ms latency)
    try {
      if (this.ntfyWs) {
        try { this.ntfyWs.close(); } catch {}
        this.ntfyWs = null;
      }
      this.ntfyWs = new WebSocket(`wss://ntfy.sh/zebra-${cleanRoom}-join/ws`);
      this.ntfyWs.on('message', (data: any) => {
        try {
          const json = JSON.parse(data.toString());
          if (json.event === 'message' && json.message) {
            const content = typeof json.message === 'string' ? JSON.parse(json.message) : json.message;
            if (content && content.sessionId && content.guestIp && content.guestUdpPort) {
              console.log(`[Zebra P2P] Real-time ntfy join beacon received for [${content.sessionId}] from ${content.guestIp}:${content.guestUdpPort}`);
              this.handleGuestJoined(content.sessionId, content.guestIp, Number(content.guestUdpPort));
            }
          }
        } catch {}
      });
      this.ntfyWs.on('error', () => {});
      this.ntfyWs.on('close', () => {
        if (this.isRunning) {
          setTimeout(() => {
            if (this.isRunning) this.startRendezvousListeners();
          }, 3000);
        }
      });
    } catch {}

    // 2. Real-time stream via dweet.cc chunk stream with robust line buffering (filters : ping safely)
    try {
      let streamBuf = '';
      this.dweetStreamReq = https.get(`https://dweet.cc/listen/for/dweets/from/zebra-${cleanRoom}-join`, (res: any) => {
        res.on('data', (chunk: Buffer) => {
          streamBuf += chunk.toString();
          const lines = streamBuf.split('\n');
          streamBuf = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed.startsWith('data:')) {
              try {
                const data = JSON.parse(trimmed.substring(5).trim());
                if (data && data.content && data.content.sessionId) {
                  const { sessionId, guestIp, guestUdpPort } = data.content;
                  if (guestIp && guestUdpPort) {
                    this.handleGuestJoined(sessionId, guestIp, Number(guestUdpPort));
                  }
                }
              } catch {}
            }
          }
        });
        res.on('error', () => {});
      });
      this.dweetStreamReq.on('error', () => {});
    } catch {}

    // 3. Continuous backup polling every 1.0 second
    if (this.dweetPollInterval) clearInterval(this.dweetPollInterval);
    this.dweetPollInterval = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        const res = await fetch(`https://dweet.cc/get/latest/dweet/for/zebra-${cleanRoom}-join`);
        const json: any = await res.json();
        if (json && json.with && json.with[0] && json.with[0].content) {
          const { sessionId, guestIp, guestUdpPort } = json.with[0].content;
          if (sessionId && guestIp && guestUdpPort) {
            const existing = this.sessions.get(sessionId);
            if (!existing || (!existing.punched && Date.now() - existing.lastActive > 2500)) {
              this.handleGuestJoined(sessionId, guestIp, Number(guestUdpPort));
            }
          }
        }
      } catch {}
    }, 1000);
  }

  private cleanupSession(session: GuestSession) {
    if (session.punchTimer) clearInterval(session.punchTimer);
    if (session.retransmitTimer) clearInterval(session.retransmitTimer);
    if (session.keepAliveTimer) clearInterval(session.keepAliveTimer);
    if (session.pacerHandle) clearImmediate(session.pacerHandle);
    session.pendingPackets.clear();
    session.reorderBuffer.clear();
    session.sendQueue = [];
    if (session.localTcpSocket) {
      try { session.localTcpSocket.destroy(); } catch {}
    }
  }

  private connectSignaling() {
    if (!this.isRunning) return;

    if (!this.vpsHost) {
      // Decentralized mode: room registered via dweet/e4mc/UPnP; no dedicated VPS required.
      this.syncRoomRegistry();
      if (this.onNetworkRecoveredCallback) {
        try { this.onNetworkRecoveredCallback(); } catch {}
      }
      return;
    }

    const wsUrl = `ws://${this.vpsHost}:${this.vpsWsPort}`;
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err: any) {
      console.warn(`[Zebra P2P] Signaling notice: ${err.message}`);
      return;
    }

    this.ws.on('open', async () => {
      console.log(`[Zebra P2P] Connected to custom signaling at ${wsUrl}`);

      // Re-probe STUN to punch fresh router NAT pinhole & acquire fresh public IP/port upon network recovery
      try {
        const reflexive = await this.resolveStun();
        if (reflexive) {
          this.hostReflexiveIp = reflexive.ip;
          this.hostReflexiveUdpPort = reflexive.port;
          console.log(`[Zebra P2P] Network recovery STUN endpoint: ${this.hostReflexiveIp}:${this.hostReflexiveUdpPort}`);
        }
      } catch {}

      // Register host with room and fresh reflexive UDP endpoint
      this.ws?.send(JSON.stringify({
        type: 'host_register',
        room: this.roomCode,
        ip: this.hostReflexiveIp || '',
        udpPort: this.hostReflexiveUdpPort,
        port: this.localMinecraftPort,
        e4mc: this.e4mcDomain || '',
      }));

      // Synchronize HTTP matchmaker registry with real public endpoint & e4mc fallback
      this.syncRoomRegistry();

      // Notify host runner that network interface has recovered
      if (this.onNetworkRecoveredCallback) {
        try { this.onNetworkRecoveredCallback(); } catch {}
      }

      // Heartbeat every 10s to keep VPS connection active
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 10000);
    });

    this.ws.on('message', (data: any) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString();
        const msg = JSON.parse(raw);
        if (msg.type === 'guest_joined') {
          const udpPort = Number(msg.guestUdpPort || (msg.data && msg.data.guestUdpPort));
          if (udpPort) {
            this.handleGuestJoined(msg.sessionId, msg.guestIp, udpPort);
          }
        } else if (msg.type === 'signal' && msg.from === 'guest' && msg.data) {
          const udpPort = Number(msg.data.guestUdpPort || msg.data.udpPort || msg.data.port);
          const sId = msg.sessionId || msg.data.sessionId;
          const gIp = msg.data.guestIp || msg.guestIp;
          if (udpPort && sId && gIp) {
            this.handleGuestJoined(sId, gIp, udpPort);
          }
        } else if (msg.type === 'guest_left') {
          this.handleGuestLeft(msg.sessionId);
        }
      } catch (err: any) {
        console.warn('[Zebra P2P] Signaling message parse error:', err.message);
      }
    });

    this.ws.on('close', () => {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      if (this.isRunning) {
        setTimeout(() => this.connectSignaling(), 3000);
      }
    });

    this.ws.on('error', (err: any) => {
      console.warn(`[Zebra P2P] Signaling notice: ${err?.message || err}`);
    });
  }

  private handleGuestJoined(sessionId: string, guestIp: string, guestUdpPort: number) {
    console.log(`[Zebra P2P] Guest [${sessionId}] connecting from ${guestIp}:${guestUdpPort}...`);

    // Clean up any stale existing session from the same IP to prevent collision
    for (const [sId, existing] of this.sessions.entries()) {
      if (existing.guestIp === guestIp && sId !== sessionId) {
        if (existing.punched && Date.now() - existing.lastActive < 10000) {
          this.sessions.delete(sId);
          existing.sessionId = sessionId;
          this.sessions.set(sessionId, existing);
          return;
        }
        console.log(`[Zebra P2P] Resetting previous session [${sId}] for rejoining guest at ${guestIp}`);
        this.cleanupSession(existing);
        this.sessions.delete(sId);
      }
    }

    const session: GuestSession = {
      sessionId,
      guestIp,
      guestUdpPort,
      punched: false,
      lastActive: Date.now(),
      nextSeq: 0,
      expectedSeq: 0,
      pendingPackets: new Map(),
      reorderBuffer: new Map(),
      sendQueue: [],
      cwnd: INIT_CWND,
      ssthresh: INIT_SSTHRESH,
      srtt: 40,
      rttvar: 15,
      rto: 80,
      lastCumulativeAck: -1,
      dupAckCount: 0,
    };
    this.sessions.set(sessionId, session);

    // Multi-port hole-punch packets every 40ms for up to 10.0 seconds (250 attempts)
    let attempts = 0;
    const portDeltas = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    session.punchTimer = setInterval(() => {
      if (session.punched || !this.udpSocket || attempts >= 250) {
        clearInterval(session.punchTimer);
        if (!session.punched) {
          console.log(`[Zebra Network] Direct P2P UDP hole-punch timed out for guest [${sessionId}]. Guest will fall back to direct e4mc.`);
        }
        return;
      }

      attempts++;
      for (const delta of portDeltas) {
        const targetPort = guestUdpPort + delta;
        if (targetPort > 1024 && targetPort <= 65535) {
          this.sendRawUdp(TYPE_PUNCH_SYN, sessionId, 0, 0, 0n, Buffer.alloc(0), guestIp, targetPort);
        }
      }
    }, 40);
  }

  private handleGuestLeft(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.cleanupSession(session);
      this.sessions.delete(sessionId);
      console.log(`[P2P Host] Cleaned up guest session ${sessionId}`);
    }
  }

  private handleUdpMessage(msg: Buffer, rinfo: dgram.RemoteInfo) {
    if (msg.length < HEADER_SIZE || msg[0] !== MAGIC_BYTE) return;

    const type = msg[1];
    const sessionHash = msg.readUInt16BE(2);
    const seq = msg.readUInt32BE(4);
    const ack = msg.readInt32BE(8);
    const sackMask = msg.readBigUInt64BE(12);

    // Find matching session: exact sessionHash match first to prevent stale IP collisions
    let targetSession: GuestSession | null = null;
    for (const session of this.sessions.values()) {
      if (this.hashSessionId(session.sessionId) === sessionHash) {
        targetSession = session;
        break;
      }
    }
    if (!targetSession) {
      for (const session of this.sessions.values()) {
        if (session.guestIp === rinfo.address) {
          targetSession = session;
          break;
        }
      }
    }

    if (!targetSession) {
      if (type === TYPE_PUNCH_SYN || type === TYPE_PUNCH_ACK) {
        // Early UDP arrival before dweet rendezvous stream/polling event!
        // Instantly reply with PUNCH_ACK and create provisional session so zero packets are dropped
        const provSessionId = `prov_${sessionHash || rinfo.address}_${rinfo.port}`;
        targetSession = {
          sessionId: provSessionId,
          guestIp: rinfo.address,
          guestUdpPort: rinfo.port,
          punched: false,
          lastActive: Date.now(),
          nextSeq: 0,
          expectedSeq: 0,
          pendingPackets: new Map(),
          reorderBuffer: new Map(),
          sendQueue: [],
          cwnd: INIT_CWND,
          ssthresh: INIT_SSTHRESH,
          srtt: 40,
          rttvar: 15,
          rto: 80,
          lastCumulativeAck: -1,
          dupAckCount: 0,
        };
        this.sessions.set(provSessionId, targetSession);
        this.sendRawUdp(TYPE_PUNCH_ACK, provSessionId, 0, 0, 0n, Buffer.alloc(0), rinfo.address, rinfo.port);
      } else {
        return;
      }
    }

    targetSession.lastActive = Date.now();
    targetSession.guestIp = rinfo.address;
    targetSession.guestUdpPort = rinfo.port;

    // 1. Process cumulative ACK & RTT measurement
    let ackAdvanced = false;
    if (ack >= 0) {
      for (const pendingSeq of Array.from(targetSession.pendingPackets.keys())) {
        if (pendingSeq <= ack) {
          const pkt = targetSession.pendingPackets.get(pendingSeq);
          if (pkt && pkt.retries === 0) {
            // Karn's algorithm: sample RTT on packets that were not retransmitted
            const sampleRTT = Date.now() - pkt.sentAt;
            if (sampleRTT > 0 && sampleRTT < 3000) {
              const rttDiff = sampleRTT - targetSession.srtt;
              targetSession.srtt += 0.125 * rttDiff;
              targetSession.rttvar += 0.25 * (Math.abs(rttDiff) - targetSession.rttvar);
              targetSession.rto = Math.min(1000, Math.max(30, Math.round(targetSession.srtt + 4 * targetSession.rttvar)));
            }
          }
          targetSession.pendingPackets.delete(pendingSeq);
          ackAdvanced = true;
        }
      }

      // 2. Process SACK bitmask (marks out-of-order received packets)
      if (sackMask > 0n) {
        for (let i = 0; i < 64; i++) {
          if ((sackMask & (1n << BigInt(i))) !== 0n) {
            const sackedSeq = ack + 2 + i;
            const pkt = targetSession.pendingPackets.get(sackedSeq);
            if (pkt) {
              pkt.sacked = true;
            }
          }
        }
      }

      // 3. Congestion Window Update (TCP Reno)
      if (ackAdvanced) {
        if (targetSession.cwnd < targetSession.ssthresh) {
          // Slow Start: exponential growth
          targetSession.cwnd = Math.min(targetSession.cwnd + 1, MAX_CWND);
        } else {
          // Congestion Avoidance: linear growth
          targetSession.cwnd = Math.min(targetSession.cwnd + (1 / Math.floor(targetSession.cwnd)), MAX_CWND);
        }
        targetSession.dupAckCount = 0;
        targetSession.lastCumulativeAck = ack;
      } else if (ack === targetSession.lastCumulativeAck) {
        targetSession.dupAckCount = (targetSession.dupAckCount || 0) + 1;

        // Full SACK Scoreboard Fast Retransmit: immediately repair all un-sacked packet holes
        if (targetSession.dupAckCount >= 3 || sackMask > 0n) {
          const now = Date.now();
          let retransmitCount = 0;
          for (const [seq, pkt] of targetSession.pendingPackets.entries()) {
            if (seq <= ack) continue;
            if (!pkt.sacked && (now - pkt.sentAt > 30)) {
              pkt.sentAt = now;
              pkt.retries++;
              this.udpSocket?.send(pkt.packet, targetSession.guestUdpPort, targetSession.guestIp);
              retransmitCount++;
              if (retransmitCount >= 16) break; // Micro-pace retransmissions to prevent burst spikes
            }
          }
          if (retransmitCount > 0) {
            targetSession.ssthresh = Math.max(Math.floor(targetSession.cwnd * 0.8), MIN_CWND);
            targetSession.cwnd = targetSession.ssthresh;
          }
        }
      } else {
        targetSession.dupAckCount = 0;
        targetSession.lastCumulativeAck = ack;
      }

      // Drain send queue with newly available cwnd space
      this.drainSendQueue(targetSession);
    }

    // 4. Handle Packet Types
    if (type === TYPE_PUNCH_SYN) {
      this.sendRawUdp(TYPE_PUNCH_ACK, targetSession.sessionId, 0, targetSession.expectedSeq > 0 ? targetSession.expectedSeq - 1 : 0, 0n, Buffer.alloc(0), rinfo.address, rinfo.port);
      if (!targetSession.punched) {
        targetSession.punched = true;
        if (targetSession.punchTimer) {
          clearInterval(targetSession.punchTimer);
          targetSession.punchTimer = undefined;
        }
        this.log(`[Zebra Network] Guest connected via Direct P2P (0ms relay)`);
        this.initP2PSessionTransport(targetSession);
        this.ensureLocalTcpConnection(targetSession);
      }
    } else if (type === TYPE_PUNCH_ACK) {
      if (!targetSession.punched) {
        targetSession.punched = true;
        if (targetSession.punchTimer) {
          clearInterval(targetSession.punchTimer);
          targetSession.punchTimer = undefined;
        }
        this.log(`[Zebra Network] Guest connected via Direct P2P (0ms relay)`);
        this.initP2PSessionTransport(targetSession);
        this.ensureLocalTcpConnection(targetSession);
      }
    } else if (type === TYPE_DATA) {
      const payload = msg.subarray(HEADER_SIZE);
      this.handleIncomingDataPacket(targetSession, seq, payload);
    } else if (type === TYPE_ACK) {
      // ACK already processed above
    } else if (type === TYPE_PING) {
      // Keep-alive packet, updated lastActive
    } else if (type === TYPE_CLOSE) {
      if (targetSession.localTcpSocket) {
        targetSession.localTcpSocket.destroy();
      }
    }
  }

  private handleIncomingDataPacket(session: GuestSession, seq: number, payload: Buffer) {
    if (seq === session.expectedSeq) {
      // In-order packet: deliver directly to Minecraft server
      if (session.localTcpSocket && !session.localTcpSocket.destroyed) {
        session.localTcpSocket.write(payload);
      }
      session.expectedSeq++;

      // Drain any contiguous packets that arrived earlier out-of-order
      while (session.reorderBuffer.has(session.expectedSeq)) {
        const buffered = session.reorderBuffer.get(session.expectedSeq)!;
        session.reorderBuffer.delete(session.expectedSeq);
        if (session.localTcpSocket && !session.localTcpSocket.destroyed) {
          session.localTcpSocket.write(buffered);
        }
        session.expectedSeq++;
      }

      this.sendAck(session);
    } else if (seq > session.expectedSeq) {
      // Gap detected (out-of-order arrival): buffer payload
      if (!session.reorderBuffer.has(seq)) {
        session.reorderBuffer.set(seq, Buffer.from(payload));
      }
      // Send SACK immediately so host knows what arrived and can fast-retransmit the gap
      this.sendAck(session);
    } else {
      // Old duplicate packet: resend current ACK
      this.sendAck(session);
    }
  }

  private getSackMask(session: GuestSession): bigint {
    let mask = 0n;
    for (let i = 0; i < 64; i++) {
      if (session.reorderBuffer.has(session.expectedSeq + 1 + i)) {
        mask |= (1n << BigInt(i));
      }
    }
    return mask;
  }

  private sendAck(session: GuestSession) {
    const ack = session.expectedSeq > 0 ? session.expectedSeq - 1 : -1;
    const sackMask = this.getSackMask(session);
    this.sendRawUdp(TYPE_ACK, session.sessionId, 0, ack, sackMask, Buffer.alloc(0), session.guestIp, session.guestUdpPort);
  }

  private drainSendQueue(session: GuestSession) {
    if (!this.udpSocket || !session.punched) return;

    let inFlight = 0;
    for (const pkt of session.pendingPackets.values()) {
      if (!pkt.sacked) inFlight++;
    }

    const availableSlots = Math.max(0, Math.floor(session.cwnd) - inFlight);
    if (availableSlots <= 0 || session.sendQueue.length === 0) return;

    // Drain all available congestion window slots immediately
    const toSend = Math.min(availableSlots, session.sendQueue.length);
    for (let i = 0; i < toSend; i++) {
      const chunk = session.sendQueue.shift()!;
      const seq = session.nextSeq++;
      const ack = session.expectedSeq > 0 ? session.expectedSeq - 1 : -1;
      const sackMask = this.getSackMask(session);

      const packet = this.buildPacket(TYPE_DATA, session.sessionId, seq, ack, sackMask, chunk);
      session.pendingPackets.set(seq, {
        packet,
        seq,
        payloadLength: chunk.length,
        sentAt: Date.now(),
        retries: 0,
        sacked: false,
      });

      this.udpSocket.send(packet, session.guestUdpPort, session.guestIp);
    }

    // If more packets are queued, drain next micro-burst via immediate event loop scheduling
    if (session.sendQueue.length > 0 && !session.pacerHandle) {
      session.pacerHandle = setImmediate(() => {
        session.pacerHandle = undefined;
        this.drainSendQueue(session);
      });
    }
  }

  private initP2PSessionTransport(session: GuestSession) {
    // Retransmit timer (checks every 20ms with dynamic RTO and SACK skipping)
    session.retransmitTimer = setInterval(() => {
      if (!this.udpSocket || !session.punched) return;

      const now = Date.now();
      let timedOutCount = 0;
      for (const [seq, item] of session.pendingPackets.entries()) {
        if (item.sacked) continue; // Peer already confirmed receipt via SACK!

        if (now - item.sentAt > session.rto) {
          item.retries++;
          item.sentAt = now;
          this.udpSocket.send(item.packet, session.guestUdpPort, session.guestIp);
          timedOutCount++;

          if (timedOutCount === 1) {
            // First timeout: back off cwnd to avoid network collapse
            session.ssthresh = Math.max(Math.floor(session.cwnd / 2), MIN_CWND);
            session.cwnd = MIN_CWND;
          }
          // Pace retransmissions to prevent sudden flood
          if (timedOutCount >= 4) break;
        }
      }
    }, 10);

    // Keep-alive timer (every 5s to keep NAT pinhole alive and sync ACK state)
    session.keepAliveTimer = setInterval(() => {
      if (this.udpSocket && session.punched) {
        const ack = session.expectedSeq > 0 ? session.expectedSeq - 1 : 0;
        const sackMask = this.getSackMask(session);
        this.sendRawUdp(TYPE_PING, session.sessionId, 0, ack, sackMask, Buffer.alloc(0), session.guestIp, session.guestUdpPort);
      }
    }, 5000);
  }

  private ensureLocalTcpConnection(session: GuestSession) {
    if (session.localTcpSocket && !session.localTcpSocket.destroyed) return;

    const candidatePorts = [this.localMinecraftPort, 25566, 25565, 25567];
    const uniquePorts = Array.from(new Set(candidatePorts.filter(p => p > 0)));

    let attemptIndex = 0;
    const tryConnectNext = () => {
      if (session.localTcpSocket && !session.localTcpSocket.destroyed && !session.localTcpSocket.connecting) return;
      if (attemptIndex >= uniquePorts.length) {
        console.warn(`[P2P Host] Could not connect to local Minecraft server on candidate ports: ${uniquePorts.join(', ')}`);
        return;
      }
      const port = uniquePorts[attemptIndex++];
      const tcp = new net.Socket();
      session.localTcpSocket = tcp;
      tcp.setNoDelay(true);

      let connected = false;
      tcp.connect(port, '127.0.0.1', () => {
        connected = true;
        this.localMinecraftPort = port;
        console.log(`[P2P Host] Bridged session ${session.sessionId} to local Minecraft server on port ${port}`);
      });

      tcp.on('data', (data) => {
        if (session.punched) {
          // Enqueue slices into sendQueue and drain smoothly with token bucket pacing
          for (let offset = 0; offset < data.length; offset += MAX_PAYLOAD_SIZE) {
            const chunk = Buffer.from(data.subarray(offset, Math.min(offset + MAX_PAYLOAD_SIZE, data.length)));
            session.sendQueue.push(chunk);
          }
          this.drainSendQueue(session);
        }
      });

      tcp.on('close', () => {
        if (session.punched) {
          const ack = session.expectedSeq > 0 ? session.expectedSeq - 1 : 0;
          this.sendRawUdp(TYPE_CLOSE, session.sessionId, 0, ack, 0n, Buffer.alloc(0), session.guestIp, session.guestUdpPort);
        }
      });

      tcp.on('error', (err) => {
        if (!connected) {
          try { tcp.destroy(); } catch {}
          tryConnectNext();
        } else {
          console.warn(`[P2P Host] Local server bridge error for session ${session.sessionId}:`, err.message);
        }
      });
    };

    tryConnectNext();
  }

  private buildPacket(type: number, sessionId: string, seq: number, ack: number, sackMask: bigint, payload: Buffer): Buffer {
    const sessionHash = this.hashSessionId(sessionId);
    const header = Buffer.alloc(HEADER_SIZE);
    header[0] = MAGIC_BYTE;
    header[1] = type;
    header.writeUInt16BE(sessionHash, 2);
    header.writeUInt32BE(seq, 4);
    header.writeInt32BE(ack, 8);
    header.writeBigUInt64BE(sackMask, 12);
    return Buffer.concat([header, payload]);
  }

  private sendRawUdp(type: number, sessionId: string, seq: number, ack: number, sackMask: bigint, payload: Buffer, targetIp: string, targetPort: number) {
    if (!this.udpSocket) return;
    const packet = this.buildPacket(type, sessionId, seq, ack, sackMask, payload);
    this.udpSocket.send(packet, targetPort, targetIp, (err) => {
      if (err) console.warn('[P2P Host] UDP send error:', err.message);
    });
  }

  private hashSessionId(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) & 0xffff;
    }
    return hash;
  }

  private startStunKeepAlive() {
    if (this.stunInterval) clearInterval(this.stunInterval);
    // Ping STUN server every 25 seconds to keep the router's UDP NAT pinhole perpetually open
    // and detect if external IP or UDP port mapping changes during long idle periods.
    this.stunInterval = setInterval(async () => {
      if (!this.isRunning || !this.udpSocket) return;
      try {
        const reflexive = await this.resolveStun();
        if (reflexive) {
          const ipChanged = this.hostReflexiveIp !== reflexive.ip;
          const portChanged = this.hostReflexiveUdpPort !== reflexive.port;

          if (ipChanged || portChanged) {
            this.hostReflexiveIp = reflexive.ip;
            this.hostReflexiveUdpPort = reflexive.port;
            console.log(`[Zebra P2P] Host reflexive endpoint updated via STUN: ${this.hostReflexiveIp}:${this.hostReflexiveUdpPort}`);

            // Re-announce refreshed endpoint to VPS signaling server
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({
                type: 'host_register',
                room: this.roomCode,
                ip: this.hostReflexiveIp,
                udpPort: this.hostReflexiveUdpPort,
                port: this.localMinecraftPort,
              }));
            }

            // Re-announce to matchmaker registry
            this.syncRoomRegistry();
          }
        }
      } catch (err: any) {
        // Individual STUN ping failure ignored; next 25s cycle will retry
      }
    }, 25000);
  }

  private resolveStun(): Promise<{ ip: string; port: number } | null> {
    if (this.isResolvingStun) return Promise.resolve(null);
    this.isResolvingStun = true;

    return new Promise((resolve) => {
      if (!this.udpSocket) {
        this.isResolvingStun = false;
        return resolve(null);
      }

      const socket = this.udpSocket;
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 2500);

      const onMessage = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        if (msg.length >= 20 && msg.readUInt16BE(0) === 0x0101) {
          cleanup();
          try {
            // Find XOR-MAPPED-ADDRESS (0x0020) or MAPPED-ADDRESS (0x0001)
            let offset = 20;
            while (offset < msg.length) {
              const attrType = msg.readUInt16BE(offset);
              const attrLen = msg.readUInt16BE(offset + 2);
              if (attrType === 0x0020 && attrLen >= 8) {
                const xorPort = msg.readUInt16BE(offset + 6) ^ 0x2112;
                const ipBuf = Buffer.from([
                  msg[offset + 8] ^ 0x21,
                  msg[offset + 9] ^ 0x12,
                  msg[offset + 10] ^ 0xa4,
                  msg[offset + 11] ^ 0x42,
                ]);
                const ip = `${ipBuf[0]}.${ipBuf[1]}.${ipBuf[2]}.${ipBuf[3]}`;
                return resolve({ ip, port: xorPort });
              } else if (attrType === 0x0001 && attrLen >= 8) {
                const rawPort = msg.readUInt16BE(offset + 6);
                const ip = `${msg[offset + 8]}.${msg[offset + 9]}.${msg[offset + 10]}.${msg[offset + 11]}`;
                return resolve({ ip, port: rawPort });
              }
              offset += 4 + attrLen;
            }
          } catch {}
          resolve(null);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.isResolvingStun = false;
        socket.removeListener('message', onMessage);
      };

      socket.on('message', onMessage);

      // Send RFC 5389 Binding Request
      const req = Buffer.alloc(20);
      req.writeUInt16BE(0x0001, 0); // Binding Request
      req.writeUInt16BE(0x0000, 2); // Length
      req.writeUInt32BE(0x2112a442, 4); // Magic Cookie
      for (let i = 8; i < 20; i++) req[i] = Math.floor(Math.random() * 256);

      socket.send(req, this.stunPort, this.stunHost);
    });
  }
}
