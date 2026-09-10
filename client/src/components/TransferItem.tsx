"use client";

import type { TransferRecord } from "@/lib/types";
import { formatBytes, formatEta, formatSpeed, formatTime } from "@/lib/format";
import { TransferStatusBadge } from "./StatusBadge";
import { useRoom } from "@/lib/RoomProvider";

export function TransferItem({ t }: { t: TransferRecord }) {
  const { cancelTransfer } = useRoom();
  const pct = t.fileSize > 0 ? Math.min(100, Math.round((t.transferredBytes / t.fileSize) * 100)) : 0;
  const remaining = Math.max(0, t.fileSize - t.transferredBytes);
  const active = t.status === "transferring" || t.status === "connecting" || t.status === "preparing";

  return (
    <div className="rounded-lg border border-hairline bg-raised/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{t.fileName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {t.direction === "outgoing" ? `To ${t.peerDeviceName}` : `From ${t.peerDeviceName}`} · {formatBytes(t.fileSize)} · {formatTime(t.startedAt)}
          </p>
        </div>
        <TransferStatusBadge status={t.status} />
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-hairline">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ${t.status === "failed" ? "bg-danger" : t.status === "completed" ? "bg-signal" : "bg-transfer"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="font-mono">
          {formatBytes(t.transferredBytes)} / {formatBytes(t.fileSize)} ({pct}%)
        </span>
        <span className="font-mono">
          {active ? `${formatSpeed(t.speedBps)} · ${formatEta(remaining, t.speedBps)}` : t.error ?? ""}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        {active && (
          <button
            onClick={() => cancelTransfer(t.id)}
            className="rounded-md border border-hairline px-2.5 py-1 text-xs text-muted transition-colors hover:border-danger/40 hover:text-danger"
          >
            Cancel
          </button>
        )}
        {t.status === "completed" && t.direction === "incoming" && t.downloadUrl && (
          <a
            href={t.downloadUrl}
            download={t.fileName}
            className="rounded-md bg-signal/15 px-2.5 py-1 text-xs font-medium text-signal transition-colors hover:bg-signal/25"
          >
            Save file
          </a>
        )}
      </div>
    </div>
  );
}
