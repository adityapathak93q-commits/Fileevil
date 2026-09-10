"use client";

import { io, Socket } from "socket.io-client";

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

/** Lazily creates a single shared Socket.IO connection for the whole tab. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SIGNALING_URL, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
  return socket;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Fetches STUN/TURN configuration from the signaling server so nothing
 * needs to be hardcoded (or leak secrets) in frontend source. */
export async function fetchIceServers(): Promise<IceServerConfig[]> {
  try {
    const res = await fetch(`${SIGNALING_URL}/api/ice-config`);
    if (!res.ok) throw new Error(`ice-config ${res.status}`);
    const data = await res.json();
    return data.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }];
  } catch {
    // Fail safe to public STUN only — cross-network transfer may still work
    // for peers behind simple NATs even without a reachable signaling server
    // config endpoint, though TURN-dependent connections will fail.
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}
