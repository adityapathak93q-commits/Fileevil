import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { Server, Socket } from "socket.io";
import { RoomManager } from "./roomManager";
import { logger } from "./logger";
import type { Participant, SignalPayload } from "./types";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_ROOM_SIZE = Number(process.env.MAX_ROOM_SIZE ?? 8);
const ROOM_TTL_MINUTES = Number(process.env.ROOM_TTL_MINUTES ?? 180);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 240);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);

const STUN_URLS = (process.env.STUN_URLS ?? "stun:stun.l.google.com:19302")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TURN_URL = process.env.TURN_URL ?? "";
const TURN_USERNAME = process.env.TURN_USERNAME ?? "";
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL ?? "";

const app = express();
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGINS, credentials: false }));
app.use(express.json());

const rooms = new RoomManager({ maxRoomSize: MAX_ROOM_SIZE, ttlMinutes: ROOM_TTL_MINUTES });

// ---- Basic per-socket rate limiting (sliding window counter) -------------
const hitCounts = new Map<string, { count: number; windowStart: number }>();
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = hitCounts.get(key);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    hitCounts.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

// ---- HTTP endpoints --------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ ok: true, ...rooms.stats(), uptimeSec: Math.floor(process.uptime()) });
});

/** ICE server configuration handed to clients at connect time so STUN/TURN
 * credentials never need to be hardcoded in frontend source. */
app.get("/api/ice-config", (_req, res) => {
  const iceServers: RTCIceServerLike[] = [{ urls: STUN_URLS }];
  if (TURN_URL) {
    iceServers.push({ urls: TURN_URL.split(",").map((s) => s.trim()), username: TURN_USERNAME, credential: TURN_CREDENTIAL });
  }
  res.json({ iceServers });
});

interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGINS, methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e6, // signaling payloads are small; real file bytes never touch this server
});

function extractClientIp(socket: Socket): string {
  const fwd = socket.handshake.headers["x-forwarded-for"];
  let ip = typeof fwd === "string" && fwd.length > 0 ? fwd.split(",")[0].trim() : socket.handshake.address ?? "unknown";
  // Normalize IPv4-mapped IPv6 form ("::ffff:1.2.3.4") so two connections
  // reported inconsistently by different proxy layers still match.
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

function roomChannel(code: string) {
  return `room:${code}`;
}

io.on("connection", (socket: Socket) => {
  const clientIp = extractClientIp(socket);
  logger.info("socket.connected", { socketId: socket.id });

  function guardRate(): boolean {
    if (isRateLimited(socket.id)) {
      socket.emit("room-error", { code: "RATE_LIMITED", message: "Too many requests. Slow down a moment." });
      return true;
    }
    return false;
  }

  // ---- Room lifecycle ------------------------------------------------

  socket.on("create-room", (payload: { deviceId: string; deviceName: string }) => {
    if (guardRate()) return;
    const deviceName = sanitizeDeviceName(payload?.deviceName);
    if (!deviceName) {
      socket.emit("room-error", { code: "INVALID_NAME", message: "Device name is required." });
      return;
    }

    const room = rooms.createRoom();
    const participant: Participant = {
      socketId: socket.id,
      deviceId: String(payload.deviceId ?? socket.id).slice(0, 64),
      deviceName,
      joinedAt: Date.now(),
      isCreator: true,
    };
    rooms.addParticipant(room, participant, clientIp);
    socket.join(roomChannel(room.code));
    socket.emit("room-created", rooms.toSummary(room, socket.id));
  });

  socket.on("join-room", (payload: { code: string; deviceId: string; deviceName: string }) => {
    if (guardRate()) return;
    const deviceName = sanitizeDeviceName(payload?.deviceName);
    const code = String(payload?.code ?? "").toUpperCase().trim();

    if (!code || !/^[A-Z0-9]{4,10}$/.test(code)) {
      socket.emit("room-error", { code: "INVALID_CODE", message: "Enter a valid room code." });
      return;
    }
    if (!deviceName) {
      socket.emit("room-error", { code: "INVALID_NAME", message: "Device name is required." });
      return;
    }

    const room = rooms.getRoom(code);
    if (!room) {
      socket.emit("room-error", { code: "ROOM_NOT_FOUND", message: "That room doesn't exist or has expired." });
      return;
    }
    if (room.participants.size >= room.maxSize) {
      socket.emit("room-error", { code: "ROOM_FULL", message: "This room is full." });
      return;
    }

    const participant: Participant = {
      socketId: socket.id,
      deviceId: String(payload.deviceId ?? socket.id).slice(0, 64),
      deviceName,
      joinedAt: Date.now(),
      isCreator: false,
    };

    const existingPeers = Array.from(room.participants.values());
    rooms.addParticipant(room, participant, clientIp);
    socket.join(roomChannel(room.code));

    // Tell the joiner about the room + who's already there (so it knows who
    // to initiate WebRTC offers to).
    socket.emit("room-joined", { room: rooms.toSummary(room, socket.id), existingPeerIds: existingPeers.map((p) => p.socketId) });

    // Tell everyone already in the room that a new peer arrived.
    socket.to(roomChannel(room.code)).emit("user-joined", {
      socketId: socket.id,
      deviceId: participant.deviceId,
      deviceName: participant.deviceName,
    });
  });

  socket.on("leave-room", () => {
    handleLeave(socket);
  });

  socket.on("rename-device", (payload: { deviceName: string }) => {
    const found = findRoomForSocket(socket.id);
    if (!found) return;
    const name = sanitizeDeviceName(payload?.deviceName);
    if (!name) return;
    found.participant.deviceName = name;
    rooms.touch(found.room);
    io.to(roomChannel(found.room.code)).emit("device-renamed", { socketId: socket.id, deviceName: name });
  });

  // ---- WebRTC signaling relay (server never inspects payloads) -------

  socket.on("signal", (payload: { to: string; data: SignalPayload }) => {
    if (guardRate()) return;
    if (!payload?.to || !payload?.data) return;
    const found = findRoomForSocket(socket.id);
    if (!found) return;
    // Only allow relaying to a peer that is actually in the same room.
    if (!found.room.participants.has(payload.to)) return;
    rooms.touch(found.room);
    io.to(payload.to).emit("signal", { from: socket.id, data: payload.data });
  });

  // ---- Same-WiFi discovery heuristic -----------------------------------
  // Real mDNS/Bonjour discovery is not reachable from a browser sandbox.
  // As the closest reliable, non-fake substitute: the server groups sockets
  // that are requesting discovery AND share the same public IP as seen by
  // this server (i.e. behind the same NAT / router — a strong proxy for
  // "same local network"), and introduces them to each other in a shared
  // ephemeral discovery lobby so they can then create/join a room normally.
  socket.on("same-wifi:announce", (payload: { deviceId: string; deviceName: string }) => {
    if (guardRate()) return;
    const deviceName = sanitizeDeviceName(payload?.deviceName);
    if (!deviceName) return;
    socket.data.deviceId = payload.deviceId;
    socket.data.deviceName = deviceName;
    socket.join(`lan:${clientIp}`);
    logger.debug("same-wifi.announce", { socketId: socket.id, clientIp });

    const peers = Array.from(io.sockets.adapter.rooms.get(`lan:${clientIp}`) ?? [])
      .filter((id) => id !== socket.id)
      .map((id) => io.sockets.sockets.get(id))
      .filter((s): s is Socket => !!s)
      .map((s) => ({ socketId: s.id, deviceId: s.data.deviceId, deviceName: s.data.deviceName }));

    socket.emit("same-wifi:peers", peers);
    socket.to(`lan:${clientIp}`).emit("same-wifi:peer-joined", { socketId: socket.id, deviceId: payload.deviceId, deviceName });
  });

  socket.on("same-wifi:invite", (payload: { to: string; code: string }) => {
    if (guardRate()) return;
    if (!payload?.to || !payload?.code) return;
    // Safety: only allow inviting a peer the server itself discovered on the
    // same public IP / local network — never an arbitrary socket id.
    const lanPeers = io.sockets.adapter.rooms.get(`lan:${clientIp}`);
    if (!lanPeers || !lanPeers.has(payload.to)) return;
    io.to(payload.to).emit("same-wifi:invited", {
      code: payload.code.toUpperCase(),
      fromDeviceName: socket.data.deviceName ?? "Nearby device",
    });
  });

  socket.on("same-wifi:stop", () => {
    socket.leave(`lan:${clientIp}`);
    socket.to(`lan:${clientIp}`).emit("same-wifi:peer-left", { socketId: socket.id });
  });

  socket.on("disconnect", () => {
    handleLeave(socket);
    socket.to(`lan:${clientIp}`).emit("same-wifi:peer-left", { socketId: socket.id });
    logger.info("socket.disconnected", { socketId: socket.id });
  });

  function handleLeave(s: Socket) {
    const result = rooms.removeParticipantBySocket(s.id);
    if (!result) return;
    s.leave(roomChannel(result.room.code));
    io.to(roomChannel(result.room.code)).emit("user-left", { socketId: s.id, deviceId: result.participant.deviceId, deviceName: result.participant.deviceName });
  }

  function findRoomForSocket(socketId: string) {
    for (const code of socket.rooms) {
      if (!code.startsWith("room:")) continue;
      const room = rooms.getRoom(code.replace("room:", ""));
      const participant = room?.participants.get(socketId);
      if (room && participant) return { room, participant };
    }
    return null;
  }
});

function sanitizeDeviceName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Strip control chars, collapse whitespace, hard length cap. This is
  // display-only data broadcast to other clients — never trusted for logic.
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 40);
  return cleaned.length > 0 ? cleaned : null;
}

// Periodic cleanup of rooms that have gone stale (creator vanished without a
// clean disconnect event, e.g. laptop lid closed).
setInterval(() => rooms.cleanupExpired(), 5 * 60_000);

server.listen(PORT, () => {
  logger.info("server.listening", { port: PORT, clientOrigins: CLIENT_ORIGINS, turnConfigured: Boolean(TURN_URL) });
});
