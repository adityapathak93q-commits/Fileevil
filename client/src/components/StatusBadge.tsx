import type { PeerConnState, TransferStatus } from "@/lib/types";

const PEER_STYLES: Record<PeerConnState, { label: string; dot: string; text: string }> = {
  online: { label: "Online", dot: "bg-signal", text: "text-signal" },
  connecting: { label: "Connecting", dot: "bg-warn animate-pulse", text: "text-warn" },
  reconnecting: { label: "Reconnecting", dot: "bg-warn animate-pulse", text: "text-warn" },
  offline: { label: "Offline", dot: "bg-muted", text: "text-muted" },
};

export function PeerStatusBadge({ state }: { state: PeerConnState }) {
  const s = PEER_STYLES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const TRANSFER_STYLES: Record<TransferStatus, { label: string; className: string }> = {
  preparing: { label: "Preparing", className: "text-muted border-hairline" },
  connecting: { label: "Connecting", className: "text-warn border-warn/30" },
  transferring: { label: "Transferring", className: "text-transfer border-transfer/30" },
  paused: { label: "Paused", className: "text-warn border-warn/30" },
  completed: { label: "Completed", className: "text-signal border-signal/30" },
  failed: { label: "Failed", className: "text-danger border-danger/30" },
  cancelled: { label: "Cancelled", className: "text-muted border-hairline" },
  retrying: { label: "Retrying", className: "text-warn border-warn/30" },
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const s = TRANSFER_STYLES[status];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.className}`}>{s.label}</span>;
}
