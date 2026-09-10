export interface RoomParticipant {
  socketId: string;
  deviceId: string;
  deviceName: string;
  isCreator: boolean;
  isSelf?: boolean;
}

export interface RoomSummary {
  code: string;
  createdAt: number;
  maxSize: number;
  participants: RoomParticipant[];
}

export type PeerConnState = "connecting" | "online" | "reconnecting" | "offline";

export type TransferDirection = "outgoing" | "incoming";

export type TransferStatus =
  | "preparing"
  | "connecting"
  | "transferring"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

export interface TransferRecord {
  id: string;
  direction: TransferDirection;
  fileName: string;
  fileSize: number;
  mimeType: string;
  peerDeviceId: string;
  peerDeviceName: string;
  status: TransferStatus;
  transferredBytes: number;
  startedAt: number;
  updatedAt: number;
  speedBps: number;
  error?: string;
  /** Populated on the receiving side once a transfer completes — an
   * object URL for the reassembled Blob, ready to download/save. */
  downloadUrl?: string;
}

export const CHUNK_SIZE = 256 * 1024; // 256KB — comfortably under SCTP message limits, ~4x fewer round trips than 64KB
export const BUFFERED_AMOUNT_HIGH_WATERMARK = 16 * CHUNK_SIZE; // pause sending above this (4MB)
export const BUFFERED_AMOUNT_LOW_WATERMARK = 4 * CHUNK_SIZE; // resume sending below this (1MB)

// ---- Data channel wire protocol (JSON control + binary chunks) -----------

export interface FileMetaMessage {
  kind: "file-meta";
  transferId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
}

export interface FileCompleteMessage {
  kind: "file-complete";
  transferId: string;
  sha256Hex: string;
}

export interface FileCancelMessage {
  kind: "file-cancel";
  transferId: string;
  reason: string;
}

export interface FileAckMessage {
  kind: "file-ack";
  transferId: string;
  ok: boolean;
  message?: string;
  /** Chunks the receiver has confirmed contiguous receipt of so far — lets a
   * sender resume from the right offset after a connection drop instead of
   * restarting the whole file. */
  receivedChunks?: number;
}

export interface FileResumeRequestMessage {
  kind: "file-resume-request";
  transferId: string;
  fromChunk: number;
}

export type ControlMessage =
  | FileMetaMessage
  | FileCompleteMessage
  | FileCancelMessage
  | FileAckMessage
  | FileResumeRequestMessage;
