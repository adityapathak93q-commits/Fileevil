"use client";

import { useRoom } from "@/lib/RoomProvider";
import { PeerStatusBadge } from "./StatusBadge";

export function ParticipantList() {
  const { room, peerStates } = useRoom();
  if (!room) return null;

  return (
    <div className="rounded-xl border border-hairline bg-surface/60 p-5">
      <h2 className="font-display text-sm tracking-tight text-ink">Connected devices</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {room.participants.map((p) => (
          <li key={p.socketId} className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-raised/50 px-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-transfer/15 text-[11px] font-semibold text-transfer">
                {p.deviceName.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate text-sm text-ink">{p.deviceName}</span>
              {p.isCreator && <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">host</span>}
              {p.isSelf && <span className="shrink-0 text-[10px] text-muted">(you)</span>}
            </div>
            {!p.isSelf && <PeerStatusBadge state={peerStates[p.socketId] ?? "connecting"} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
