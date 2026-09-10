/**
 * Shared wire types for the signaling layer. These mirror
 * client/src/lib/types.ts on the frontend — keep them in sync.
 * (In a monorepo these would live in a shared package; kept duplicated
 * here so each half of the project can be deployed independently.)
 */

export interface Participant {
  socketId: string;
  deviceId: string; // stable per-browser id, persisted client-side
  deviceName: string;
  joinedAt: number;
  isCreator: boolean;
}

export interface Room {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  participants: Map<string, Participant>; // keyed by socketId
  maxSize: number;
  /** Public IP (best-effort, from the socket handshake) of each participant's
   * connection to the signaling server — used only for the "Same WiFi"
   * heuristic (participants sharing a public IP are very likely on the same
   * NAT / local network). Never exposed to clients. */
  originIpBySocket: Map<string, string>;
}

export interface RoomSummary {
  code: string;
  createdAt: number;
  participants: Array<{
    socketId: string;
    deviceId: string;
    deviceName: string;
    isCreator: boolean;
    isSelf?: boolean;
  }>;
  maxSize: number;
}

export type SignalPayload =
  | { kind: "offer"; sdp: RTCSessionDescriptionInitLike }
  | { kind: "answer"; sdp: RTCSessionDescriptionInitLike }
  | { kind: "ice-candidate"; candidate: unknown };

// Avoid pulling in DOM lib types on the Node side.
export interface RTCSessionDescriptionInitLike {
  type: string;
  sdp?: string;
}
