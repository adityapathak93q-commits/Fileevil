"use client";

import { useRoom } from "@/lib/RoomProvider";
import { TransferItem } from "./TransferItem";

function EmptyState({ label }: { label: string }) {
  return <p className="rounded-lg border border-dashed border-hairline px-4 py-8 text-center text-xs text-muted">{label}</p>;
}

export function TransferList() {
  const { transfers } = useRoom();
  const outgoing = transfers.filter((t) => t.direction === "outgoing");
  const incoming = transfers.filter((t) => t.direction === "incoming");

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-hairline bg-surface/60 p-5">
        <h2 className="font-display text-sm tracking-tight text-ink">Files I shared</h2>
        <div className="mt-4 flex flex-col gap-3">
          {outgoing.length === 0 ? <EmptyState label="Nothing sent yet — choose files above to share them." /> : outgoing.map((t) => <TransferItem key={t.id} t={t} />)}
        </div>
      </section>

      <section className="rounded-xl border border-hairline bg-surface/60 p-5">
        <h2 className="font-display text-sm tracking-tight text-ink">Files others shared</h2>
        <div className="mt-4 flex flex-col gap-3">
          {incoming.length === 0 ? <EmptyState label="Incoming files will appear here in real time." /> : incoming.map((t) => <TransferItem key={t.id} t={t} />)}
        </div>
      </section>
    </div>
  );
}
