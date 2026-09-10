"use client";

import type { Socket } from "socket.io-client";
import { Sha256Stream } from "./sha256Stream";
import type { ControlMessage, PeerConnState, TransferRecord } from "./types";
import { BUFFERED_AMOUNT_HIGH_WATERMARK, BUFFERED_AMOUNT_LOW_WATERMARK, CHUNK_SIZE } from "./types";

interface OutgoingTransfer {
  id: string;
  transferId16: number;
  file: File;
  totalChunks: number;
  nextChunk: number;
  hasher: Sha256Stream;
  cancelled: boolean;
  paused: boolean;
  transferredBytes: number;
  lastAckedChunk: number;
}

interface IncomingTransfer {
  id: string;
  transferId16: number;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  chunks: (ArrayBuffer | undefined)[];
  receivedChunks: number;
  receivedBytes: number;
  hasher: Sha256Stream;
  cancelled: boolean;
}

interface PeerConn {
  socketId: string;
  deviceId: string;
  deviceName: string;
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  isInitiator: boolean;
  state: PeerConnState;
  restartAttempts: number;
  outgoing: Map<number, OutgoingTransfer>;
  incoming: Map<number, IncomingTransfer>;
  nextTransferId: number;
  sendLoopRunning: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

export interface PeerManagerCallbacks {
  onPeerState: (socketId: string, state: PeerConnState, deviceName: string) => void;
  onTransferUpdate: (record: TransferRecord) => void;
  onError: (message: string) => void;
}

let transferSeq = 0;
function nextTransferRecordId(): string {
  transferSeq += 1;
  return `t-${Date.now().toString(36)}-${transferSeq}`;
}

export class PeerManager {
  private peers = new Map<string, PeerConn>();
  private transferMeta = new Map<string, TransferRecord>();

  constructor(
    private socket: Socket,
    private iceServers: RTCIceServer[],
    private selfDeviceName: () => string,
    private cb: PeerManagerCallbacks
  ) {
    this.socket.on("signal", ({ from, data }: { from: string; data: ControlSignalData }) => {
      void this.handleSignal(from, data);
    });
  }

  // ---- Connection lifecycle ------------------------------------------

  connectToPeer(socketId: string, deviceId: string, deviceName: string, initiator: boolean) {
    if (this.peers.has(socketId)) return;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: PeerConn = {
      socketId,
      deviceId,
      deviceName,
      pc,
      isInitiator: initiator,
      state: "connecting",
      restartAttempts: 0,
      outgoing: new Map(),
      incoming: new Map(),
      nextTransferId: 0,
      sendLoopRunning: false,
      pendingCandidates: [],
    };
    this.peers.set(socketId, peer);
    this.wirePeerConnection(peer);

    if (initiator) {
      const dc = pc.createDataChannel("files", { ordered: true });
      this.wireDataChannel(peer, dc);
      void this.negotiate(peer);
    } else {
      pc.ondatachannel = (ev) => this.wireDataChannel(peer, ev.channel);
    }
  }

  renamePeerDevice(socketId: string, deviceName: string) {
    const peer = this.peers.get(socketId);
    if (peer) peer.deviceName = deviceName;
  }

  disconnectPeer(socketId: string) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    peer.outgoing.forEach((t) => (t.cancelled = true));
    peer.dc?.close();
    peer.pc.close();
    this.peers.delete(socketId);
    this.cb.onPeerState(socketId, "offline", peer.deviceName);
  }

  disconnectAll() {
    for (const socketId of Array.from(this.peers.keys())) this.disconnectPeer(socketId);
  }

  connectedPeerIds(): string[] {
    return Array.from(this.peers.entries())
      .filter(([, p]) => p.state === "online")
      .map(([id]) => id);
  }

  // ---- Signaling --------------------------------------------------------

  private async negotiate(peer: PeerConn) {
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.socket.emit("signal", { to: peer.socketId, data: { kind: "offer", sdp: offer } });
    } catch (err) {
      this.cb.onError(`Failed to start connection to ${peer.deviceName}.`);
    }
  }

  private async handleSignal(from: string, data: ControlSignalData) {
    let peer = this.peers.get(from);
    if (!peer && data.kind === "offer") {
      // Answering side may not have a PeerConn yet if signaling arrives
      // before the app-level "user-joined" bookkeeping — create a shell.
      this.connectToPeer(from, from, "Unknown device", false);
      peer = this.peers.get(from);
    }
    if (!peer) return;

    try {
      if (data.kind === "offer") {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.socket.emit("signal", { to: from, data: { kind: "answer", sdp: answer } });
        await this.flushPendingCandidates(peer);
      } else if (data.kind === "answer") {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
        await this.flushPendingCandidates(peer);
      } else if (data.kind === "ice-candidate") {
        const candidate = data.candidate as RTCIceCandidateInit;
        if (peer.pc.remoteDescription) {
          await peer.pc.addIceCandidate(candidate);
        } else {
          peer.pendingCandidates.push(candidate);
        }
      }
    } catch {
      this.cb.onError(`Connection negotiation with ${peer.deviceName} failed.`);
    }
  }

  private async flushPendingCandidates(peer: PeerConn) {
    for (const c of peer.pendingCandidates.splice(0)) {
      try {
        await peer.pc.addIceCandidate(c);
      } catch {
        /* ignore stale candidate */
      }
    }
  }

  private wirePeerConnection(peer: PeerConn) {
    peer.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.socket.emit("signal", { to: peer.socketId, data: { kind: "ice-candidate", candidate: ev.candidate.toJSON() } });
      }
    };

    peer.pc.onconnectionstatechange = () => {
      const s = peer.pc.connectionState;
      if (s === "connected") {
        peer.restartAttempts = 0;
        this.setPeerState(peer, "online");
      } else if (s === "disconnected") {
        this.setPeerState(peer, "reconnecting");
      } else if (s === "failed") {
        this.attemptIceRestart(peer);
      } else if (s === "closed") {
        this.setPeerState(peer, "offline");
      } else if (s === "connecting" || s === "new") {
        this.setPeerState(peer, "connecting");
      }
    };
  }

  private async attemptIceRestart(peer: PeerConn) {
    this.setPeerState(peer, "reconnecting");
    if (!peer.isInitiator) return; // only the original offerer restarts, to avoid glare
    if (peer.restartAttempts >= 4) {
      this.setPeerState(peer, "offline");
      return;
    }
    peer.restartAttempts += 1;
    await new Promise((r) => setTimeout(r, 600 * peer.restartAttempts));
    try {
      const offer = await peer.pc.createOffer({ iceRestart: true });
      await peer.pc.setLocalDescription(offer);
      this.socket.emit("signal", { to: peer.socketId, data: { kind: "offer", sdp: offer } });
    } catch {
      /* next attempt or eventual offline state will follow */
    }
  }

  private setPeerState(peer: PeerConn, state: PeerConnState) {
    if (peer.state === state) return;
    peer.state = state;
    this.cb.onPeerState(peer.socketId, state, peer.deviceName);
  }

  private wireDataChannel(peer: PeerConn, dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_WATERMARK;
    peer.dc = dc;

    dc.onopen = () => {
      this.setPeerState(peer, "online");
      this.kickSendLoop(peer);
    };
    dc.onclose = () => this.setPeerState(peer, "reconnecting");
    dc.onerror = () => this.cb.onError(`Data channel error with ${peer.deviceName}.`);
    dc.onmessage = (ev) => this.handleChannelMessage(peer, ev.data);
  }

  // ---- Outbound file sending ---------------------------------------------

  /** Queues one or more files to be sent to a specific connected peer. */
  sendFiles(socketId: string, files: File[]): void {
    const peer = this.peers.get(socketId);
    if (!peer || !peer.dc) {
      this.cb.onError("That device isn't connected yet.");
      return;
    }
    for (const file of files) {
      const transferId16 = peer.nextTransferId++;
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      const recordId = nextTransferRecordId();

      const outgoing: OutgoingTransfer = {
        id: recordId,
        transferId16,
        file,
        totalChunks,
        nextChunk: 0,
        hasher: new Sha256Stream(),
        cancelled: false,
        paused: false,
        transferredBytes: 0,
        lastAckedChunk: 0,
      };
      peer.outgoing.set(transferId16, outgoing);

      this.upsertTransfer({
        id: recordId,
        direction: "outgoing",
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        peerDeviceId: peer.deviceId,
        peerDeviceName: peer.deviceName,
        status: "preparing",
        transferredBytes: 0,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        speedBps: 0,
      });

      this.sendControl(peer, {
        kind: "file-meta",
        transferId: String(transferId16),
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        totalChunks,
      });
      this.updateTransfer(recordId, { status: "transferring" });
    }
    this.kickSendLoop(peer);
  }

  cancelTransfer(transferId: string) {
    const record = this.transferMeta.get(transferId);
    if (!record) return;
    for (const peer of this.peers.values()) {
      for (const [tid, t] of peer.outgoing.entries()) {
        if (t.id === transferId) {
          t.cancelled = true;
          this.sendControl(peer, { kind: "file-cancel", transferId: String(tid), reason: "cancelled by sender" });
        }
      }
      for (const [tid, t] of peer.incoming.entries()) {
        if (t.id === transferId) {
          t.cancelled = true;
          this.sendControl(peer, { kind: "file-cancel", transferId: String(tid), reason: "cancelled by receiver" });
        }
      }
    }
    this.updateTransfer(transferId, { status: "cancelled" });
  }

  private kickSendLoop(peer: PeerConn) {
    if (peer.sendLoopRunning) return;
    peer.sendLoopRunning = true;
    void this.runSendLoop(peer).finally(() => {
      peer.sendLoopRunning = false;
    });
  }

  /** Round-robins chunks across all active outgoing transfers on this peer
   * connection so multiple files genuinely progress concurrently, rather
   * than sending strictly one-file-at-a-time. */
  private async runSendLoop(peer: PeerConn) {
    let lastProgressEmit = 0;
    let round = 0;
    for (;;) {
      const active = Array.from(peer.outgoing.values()).filter((t) => !t.cancelled && !t.paused && t.nextChunk < t.totalChunks);
      if (active.length === 0) break;
      if (!peer.dc || peer.dc.readyState !== "open") break;

      for (const t of active) {
        if (peer.dc.bufferedAmount > BUFFERED_AMOUNT_HIGH_WATERMARK) {
          await this.waitForBufferedAmountLow(peer.dc);
        }
        const start = t.nextChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, t.file.size);
        const buf = await t.file.slice(start, end).arrayBuffer();
        t.hasher.update(new Uint8Array(buf));

        const framed = new Uint8Array(2 + buf.byteLength);
        new DataView(framed.buffer).setUint16(0, t.transferId16, false);
        framed.set(new Uint8Array(buf), 2);
        peer.dc.send(framed.buffer);

        t.nextChunk += 1;
        t.transferredBytes = end;

        const now = Date.now();
        if (now - lastProgressEmit > 120 || t.nextChunk === t.totalChunks) {
          lastProgressEmit = now;
          this.emitOutgoingProgress(peer, t);
        }

        if (t.nextChunk >= t.totalChunks) {
          const sha256Hex = t.hasher.digestHex();
          this.sendControl(peer, { kind: "file-complete", transferId: String(t.transferId16), sha256Hex });
        }
      }
      round += 1;
      // Yield to the event loop periodically (not every single chunk) so
      // the UI stays responsive without needlessly throttling throughput —
      // browsers clamp a real setTimeout to ~4ms, which caps speed if done
      // every round; a microtask yield most rounds avoids that cap.
      if (round % 8 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      } else {
        await Promise.resolve();
      }
    }
  }

  private waitForBufferedAmountLow(dc: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        dc.removeEventListener("bufferedamountlow", handler);
        resolve();
      };
      dc.addEventListener("bufferedamountlow", handler);
    });
  }

  private emitOutgoingProgress(peer: PeerConn, t: OutgoingTransfer) {
    const record = this.transferMeta.get(t.id);
    const elapsedSec = record ? Math.max(0.05, (Date.now() - record.startedAt) / 1000) : 1;
    const speedBps = t.transferredBytes / elapsedSec;
    this.updateTransfer(t.id, {
      transferredBytes: t.transferredBytes,
      status: t.nextChunk >= t.totalChunks ? "transferring" : "transferring",
      speedBps,
    });
  }

  // ---- Inbound handling ---------------------------------------------------

  private handleChannelMessage(peer: PeerConn, data: ArrayBuffer | string) {
    if (typeof data === "string") {
      try {
        const msg = JSON.parse(data) as ControlMessage;
        this.handleControlMessage(peer, msg);
      } catch {
        /* ignore malformed control frame */
      }
      return;
    }
    const view = new DataView(data);
    const transferId16 = view.getUint16(0, false);
    const payload = data.slice(2);
    const t = peer.incoming.get(transferId16);
    if (!t || t.cancelled) return;

    t.chunks[t.receivedChunks] = payload;
    t.hasher.update(new Uint8Array(payload));
    t.receivedChunks += 1;
    t.receivedBytes += payload.byteLength;

    const record = this.transferMeta.get(t.id);
    const elapsedSec = record ? Math.max(0.05, (Date.now() - record.startedAt) / 1000) : 1;
    this.updateTransfer(t.id, {
      transferredBytes: t.receivedBytes,
      status: "transferring",
      speedBps: t.receivedBytes / elapsedSec,
    });

    // Lightweight periodic ack so a sender could resume after a drop.
    if (t.receivedChunks % 64 === 0) {
      this.sendControl(peer, { kind: "file-ack", transferId: String(transferId16), ok: true, receivedChunks: t.receivedChunks });
    }
  }

  private handleControlMessage(peer: PeerConn, msg: ControlMessage) {
    const transferId16 = Number(msg.transferId);

    if (msg.kind === "file-meta") {
      const recordId = nextTransferRecordId();
      const incoming: IncomingTransfer = {
        id: recordId,
        transferId16,
        name: msg.name,
        size: msg.size,
        mimeType: msg.mimeType,
        totalChunks: msg.totalChunks,
        chunks: new Array(msg.totalChunks),
        receivedChunks: 0,
        receivedBytes: 0,
        hasher: new Sha256Stream(),
        cancelled: false,
      };
      peer.incoming.set(transferId16, incoming);
      this.upsertTransfer({
        id: recordId,
        direction: "incoming",
        fileName: msg.name,
        fileSize: msg.size,
        mimeType: msg.mimeType,
        peerDeviceId: peer.deviceId,
        peerDeviceName: peer.deviceName,
        status: "transferring",
        transferredBytes: 0,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        speedBps: 0,
      });
      return;
    }

    if (msg.kind === "file-complete") {
      const t = peer.incoming.get(transferId16);
      if (!t) return;
      const computedHex = t.hasher.digestHex();
      if (computedHex !== msg.sha256Hex) {
        this.updateTransfer(t.id, { status: "failed", error: "Integrity check failed — file may be corrupted." });
        this.sendControl(peer, { kind: "file-ack", transferId: String(transferId16), ok: false, message: "hash mismatch" });
        return;
      }
      const blob = new Blob(t.chunks.filter(Boolean) as ArrayBuffer[], { type: t.mimeType });
      const url = URL.createObjectURL(blob);
      this.updateTransfer(t.id, { status: "completed", transferredBytes: t.size, downloadUrl: url });
      this.sendControl(peer, { kind: "file-ack", transferId: String(transferId16), ok: true });
      peer.incoming.delete(transferId16);
      return;
    }

    if (msg.kind === "file-cancel") {
      const inTransfer = peer.incoming.get(transferId16);
      const outTransfer = peer.outgoing.get(transferId16);
      const id = inTransfer?.id ?? outTransfer?.id;
      if (inTransfer) inTransfer.cancelled = true;
      if (outTransfer) outTransfer.cancelled = true;
      if (id) this.updateTransfer(id, { status: "cancelled", error: msg.reason });
      return;
    }

    if (msg.kind === "file-ack") {
      const t = peer.outgoing.get(transferId16);
      if (!t) return;
      if (!msg.ok) {
        this.updateTransfer(t.id, { status: "failed", error: msg.message ?? "Transfer failed." });
      } else if (msg.receivedChunks === undefined) {
        this.updateTransfer(t.id, { status: "completed" });
      }
      return;
    }
  }

  private sendControl(peer: PeerConn, msg: ControlMessage) {
    if (peer.dc && peer.dc.readyState === "open") {
      peer.dc.send(JSON.stringify(msg));
    }
  }

  // ---- Transfer record bookkeeping ---------------------------------------

  private upsertTransfer(record: TransferRecord) {
    this.transferMeta.set(record.id, record);
    this.cb.onTransferUpdate(record);
  }

  private updateTransfer(id: string, patch: Partial<TransferRecord>) {
    const existing = this.transferMeta.get(id);
    if (!existing) return;
    const updated: TransferRecord = { ...existing, ...patch, updatedAt: Date.now() };
    this.transferMeta.set(id, updated);
    this.cb.onTransferUpdate(updated);
  }
}

type ControlSignalData =
  | { kind: "offer"; sdp: unknown }
  | { kind: "answer"; sdp: unknown }
  | { kind: "ice-candidate"; candidate: unknown };
