import { customAlphabet } from "nanoid";
import { logger } from "./logger";
import type { Participant, Room, RoomSummary } from "./types";

// Excludes visually ambiguous characters (0/O, 1/I/L) so codes are easy to
// read aloud and type on a phone keyboard.
const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const generateCode = customAlphabet(ROOM_CODE_ALPHABET, 6);

export class RoomManager {
  private rooms = new Map<string, Room>();
  private readonly maxRoomSize: number;
  private readonly ttlMs: number;

  constructor(opts: { maxRoomSize: number; ttlMinutes: number }) {
    this.maxRoomSize = opts.maxRoomSize;
    this.ttlMs = opts.ttlMinutes * 60_000;
  }

  /** Creates a room with a guaranteed-unique code. */
  createRoom(): Room {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const room: Room = {
      code,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      participants: new Map(),
      maxSize: this.maxRoomSize,
      originIpBySocket: new Map(),
    };
    this.rooms.set(code, room);
    logger.info("room.created", { code });
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Best-effort match: any room that currently has a participant connecting
   * from the same public IP. Used purely for the "Same WiFi" convenience
   * flow — it is a heuristic, not a security boundary. */
  findRoomsByOriginIp(ip: string, excludeSocketId?: string): Room[] {
    const matches: Room[] = [];
    for (const room of this.rooms.values()) {
      for (const [socketId, roomIp] of room.originIpBySocket.entries()) {
        if (roomIp === ip && socketId !== excludeSocketId) {
          matches.push(room);
          break;
        }
      }
    }
    return matches;
  }

  addParticipant(room: Room, participant: Participant, originIp: string): void {
    room.participants.set(participant.socketId, participant);
    room.originIpBySocket.set(participant.socketId, originIp);
    room.lastActivityAt = Date.now();
  }

  removeParticipantBySocket(socketId: string): { room: Room; participant: Participant } | null {
    for (const room of this.rooms.values()) {
      const participant = room.participants.get(socketId);
      if (participant) {
        room.participants.delete(socketId);
        room.originIpBySocket.delete(socketId);
        room.lastActivityAt = Date.now();
        if (room.participants.size === 0) {
          this.rooms.delete(room.code);
          logger.info("room.emptied_and_removed", { code: room.code });
        }
        return { room, participant };
      }
    }
    return null;
  }

  touch(room: Room): void {
    room.lastActivityAt = Date.now();
  }

  toSummary(room: Room, selfSocketId?: string): RoomSummary {
    return {
      code: room.code,
      createdAt: room.createdAt,
      maxSize: room.maxSize,
      participants: Array.from(room.participants.values()).map((p) => ({
        socketId: p.socketId,
        deviceId: p.deviceId,
        deviceName: p.deviceName,
        isCreator: p.isCreator,
        isSelf: p.socketId === selfSocketId,
      })),
    };
  }

  /** Sweeps rooms that have had no activity for longer than the TTL.
   * Run on an interval from server.ts. */
  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [code, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt > this.ttlMs) {
        this.rooms.delete(code);
        removed++;
        logger.info("room.expired", { code });
      }
    }
    return removed;
  }

  stats() {
    return { activeRooms: this.rooms.size };
  }
}
