"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchIceServers, getSocket } from "./socket";
import { PeerManager } from "./webrtc";
import { getOrCreateDeviceId, getSavedDeviceName, saveDeviceName } from "./deviceName";
import type { PeerConnState, RoomSummary, TransferRecord } from "./types";

interface RoomError {
  code: string;
  message: string;
}

interface LanPeer {
  socketId: string;
  deviceId: string;
  deviceName: string;
}

interface RoomContextValue {
  deviceId: string;
  deviceName: string;
  isDeviceNameSet: boolean;
  setDeviceName: (name: string) => void;

  room: RoomSummary | null;
  peerStates: Record<string, PeerConnState>;
  transfers: TransferRecord[];
  lastError: RoomError | null;
  clearError: () => void;
  connecting: boolean;

  createRoom: () => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  sendFiles: (files: File[], targetSocketId?: string) => void;
  cancelTransfer: (id: string) => void;

  lanPeers: LanPeer[];
  lanSearching: boolean;
  startLanDiscovery: () => void;
  stopLanDiscovery: () => void;
  inviteLanPeer: (socketId: string) => void;
  incomingInvite: { code: string; fromDeviceName: string } | null;
  clearIncomingInvite: () => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used within RoomProvider");
  return ctx;
}

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [deviceName, setDeviceNameState] = useState<string>("");
  const [isDeviceNameSet, setIsDeviceNameSet] = useState(false);

  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [peerStates, setPeerStates] = useState<Record<string, PeerConnState>>({});
  const [transfers, setTransfers] = useState<Record<string, TransferRecord>>({});
  const [lastError, setLastError] = useState<RoomError | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [lanPeers, setLanPeers] = useState<LanPeer[]>([]);
  const [lanSearching, setLanSearching] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState<{ code: string; fromDeviceName: string } | null>(null);

  const peerManagerRef = useRef<PeerManager | null>(null);
  const socketRef = useRef(getSocket());
  const roomRef = useRef<RoomSummary | null>(null);
  roomRef.current = room;

  useEffect(() => {
    const saved = getSavedDeviceName();
    if (saved) {
      setDeviceNameState(saved);
      setIsDeviceNameSet(true);
    }
  }, []);

  const setDeviceName = useCallback((name: string) => {
    saveDeviceName(name);
    setDeviceNameState(name);
    setIsDeviceNameSet(true);
    socketRef.current.emit("rename-device", { deviceName: name });
  }, []);

  // ---- Boot: fetch ICE config + construct PeerManager once ----------------
  useEffect(() => {
    const socket = socketRef.current;
    let cancelled = false;

    (async () => {
      const iceServers = await fetchIceServers();
      if (cancelled) return;
      peerManagerRef.current = new PeerManager(
        socket,
        iceServers,
        () => deviceName,
        {
          onPeerState: (socketId, state, name) => {
            setPeerStates((prev) => ({ ...prev, [socketId]: state }));
            setRoom((prev) => {
              if (!prev) return prev;
              const exists = prev.participants.some((p) => p.socketId === socketId);
              if (exists || state === "offline") return prev;
              return prev; // participant list is authoritative from server events
            });
            void name;
          },
          onTransferUpdate: (record) => {
            setTransfers((prev) => ({ ...prev, [record.id]: record }));
          },
          onError: (message) => setLastError({ code: "PEER_ERROR", message }),
        }
      );
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Socket event wiring --------------------------------------------
  useEffect(() => {
    const socket = socketRef.current;

    function onRoomCreated(summary: RoomSummary) {
      setRoom(summary);
      setConnecting(false);
    }

    function onRoomJoined({ room: summary, existingPeerIds }: { room: RoomSummary; existingPeerIds: string[] }) {
      setRoom(summary);
      setConnecting(false);
      // Pre-register each existing participant so their real device identity
      // is known, then wait for their incoming offer — do not initiate
      // ourselves, to avoid signaling glare (see connectToPeer(initiator=false)).
      const pm = peerManagerRef.current;
      for (const p of summary.participants) {
        if (existingPeerIds.includes(p.socketId)) {
          setPeerStates((prev) => ({ ...prev, [p.socketId]: "connecting" }));
          pm?.connectToPeer(p.socketId, p.deviceId, p.deviceName, false);
        }
      }
    }

    function onUserJoined(p: { socketId: string; deviceId: string; deviceName: string }) {
      setRoom((prev) => {
        if (!prev) return prev;
        if (prev.participants.some((existing) => existing.socketId === p.socketId)) return prev;
        return { ...prev, participants: [...prev.participants, { ...p, isCreator: false }] };
      });
      peerManagerRef.current?.connectToPeer(p.socketId, p.deviceId, p.deviceName, true);
    }

    function onUserLeft(p: { socketId: string }) {
      setRoom((prev) => (prev ? { ...prev, participants: prev.participants.filter((x) => x.socketId !== p.socketId) } : prev));
      setPeerStates((prev) => ({ ...prev, [p.socketId]: "offline" }));
      peerManagerRef.current?.disconnectPeer(p.socketId);
    }

    function onDeviceRenamed(p: { socketId: string; deviceName: string }) {
      setRoom((prev) =>
        prev
          ? { ...prev, participants: prev.participants.map((x) => (x.socketId === p.socketId ? { ...x, deviceName: p.deviceName } : x)) }
          : prev
      );
      peerManagerRef.current?.renamePeerDevice(p.socketId, p.deviceName);
    }

    function onRoomError(err: RoomError) {
      setConnecting(false);
      setLastError(err);
    }

    function onLanPeers(peers: LanPeer[]) {
      setLanPeers(peers);
    }
    function onLanPeerJoined(p: LanPeer) {
      setLanPeers((prev) => (prev.some((x) => x.socketId === p.socketId) ? prev : [...prev, p]));
    }
    function onLanPeerLeft(p: { socketId: string }) {
      setLanPeers((prev) => prev.filter((x) => x.socketId !== p.socketId));
    }
    function onSameWifiInvited(p: { code: string; fromDeviceName: string }) {
      setIncomingInvite(p);
    }

    socket.on("room-created", onRoomCreated);
    socket.on("room-joined", onRoomJoined);
    socket.on("user-joined", onUserJoined);
    socket.on("user-left", onUserLeft);
    socket.on("device-renamed", onDeviceRenamed);
    socket.on("room-error", onRoomError);
    socket.on("same-wifi:peers", onLanPeers);
    socket.on("same-wifi:peer-joined", onLanPeerJoined);
    socket.on("same-wifi:peer-left", onLanPeerLeft);
    socket.on("same-wifi:invited", onSameWifiInvited);

    return () => {
      socket.off("room-created", onRoomCreated);
      socket.off("room-joined", onRoomJoined);
      socket.off("user-joined", onUserJoined);
      socket.off("user-left", onUserLeft);
      socket.off("device-renamed", onDeviceRenamed);
      socket.off("room-error", onRoomError);
      socket.off("same-wifi:peers", onLanPeers);
      socket.off("same-wifi:peer-joined", onLanPeerJoined);
      socket.off("same-wifi:peer-left", onLanPeerLeft);
      socket.off("same-wifi:invited", onSameWifiInvited);
    };
  }, []);

  const createRoom = useCallback(() => {
    setConnecting(true);
    socketRef.current.emit("create-room", { deviceId, deviceName });
  }, [deviceId, deviceName]);

  const joinRoom = useCallback(
    (code: string) => {
      setConnecting(true);
      socketRef.current.emit("join-room", { code, deviceId, deviceName });
    },
    [deviceId, deviceName]
  );

  const leaveRoom = useCallback(() => {
    socketRef.current.emit("leave-room");
    peerManagerRef.current?.disconnectAll();
    setRoom(null);
    setPeerStates({});
    setTransfers({});
  }, []);

  const sendFiles = useCallback((files: File[], targetSocketId?: string) => {
    const pm = peerManagerRef.current;
    const currentRoom = roomRef.current;
    if (!pm || !currentRoom) return;
    const targets = targetSocketId
      ? [targetSocketId]
      : currentRoom.participants.filter((p) => !p.isSelf).map((p) => p.socketId);
    for (const socketId of targets) pm.sendFiles(socketId, files);
  }, []);

  const cancelTransfer = useCallback((id: string) => {
    peerManagerRef.current?.cancelTransfer(id);
  }, []);

  const startLanDiscovery = useCallback(() => {
    setLanSearching(true);
    setLanPeers([]);
    socketRef.current.emit("same-wifi:announce", { deviceId, deviceName });
  }, [deviceId, deviceName]);

  const stopLanDiscovery = useCallback(() => {
    setLanSearching(false);
    socketRef.current.emit("same-wifi:stop");
  }, []);

  const inviteLanPeer = useCallback(
    (socketId: string) => {
      const currentRoom = roomRef.current;
      if (currentRoom) {
        socketRef.current.emit("same-wifi:invite", { to: socketId, code: currentRoom.code });
      } else {
        setConnecting(true);
        socketRef.current.emit("create-room", { deviceId, deviceName });
        const onCreated = (summary: RoomSummary) => {
          socketRef.current.emit("same-wifi:invite", { to: socketId, code: summary.code });
          socketRef.current.off("room-created", onCreated);
        };
        socketRef.current.on("room-created", onCreated);
      }
    },
    [deviceId, deviceName]
  );

  const clearIncomingInvite = useCallback(() => setIncomingInvite(null), []);

  const clearError = useCallback(() => setLastError(null), []);

  const value = useMemo<RoomContextValue>(
    () => ({
      deviceId,
      deviceName,
      isDeviceNameSet,
      setDeviceName,
      room,
      peerStates,
      transfers: Object.values(transfers).sort((a, b) => b.startedAt - a.startedAt),
      lastError,
      clearError,
      connecting,
      createRoom,
      joinRoom,
      leaveRoom,
      sendFiles,
      cancelTransfer,
      lanPeers,
      lanSearching,
      startLanDiscovery,
      stopLanDiscovery,
      inviteLanPeer,
      incomingInvite,
      clearIncomingInvite,
    }),
    [
      deviceId,
      deviceName,
      isDeviceNameSet,
      setDeviceName,
      room,
      peerStates,
      transfers,
      lastError,
      clearError,
      connecting,
      createRoom,
      joinRoom,
      leaveRoom,
      sendFiles,
      cancelTransfer,
      lanPeers,
      lanSearching,
      startLanDiscovery,
      stopLanDiscovery,
      inviteLanPeer,
      incomingInvite,
      clearIncomingInvite,
    ]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
