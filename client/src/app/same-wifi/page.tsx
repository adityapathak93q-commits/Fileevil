"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRoom } from "@/lib/RoomProvider";
import { useToast } from "@/components/ToastProvider";

export default function SameWifiPage() {
  const { lanPeers, lanSearching, startLanDiscovery, stopLanDiscovery, inviteLanPeer, incomingInvite, clearIncomingInvite, room } = useRoom();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    startLanDiscovery();
    return () => stopLanDiscovery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (room) router.push(`/room/${room.code}`);
  }, [room, router]);

  useEffect(() => {
    if (incomingInvite) {
      toast.push(`Connecting to ${incomingInvite.fromDeviceName}'s room…`, "info");
      router.push(`/room/${incomingInvite.code}`);
      clearIncomingInvite();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingInvite]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center px-6 py-14 text-center">
      <Link href="/" className="mb-10 self-start font-display text-sm text-muted hover:text-ink">
        ← FileSync
      </Link>

      <div className="relative flex h-32 w-32 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-pulseRing rounded-full border border-signal/40" />
        <span className="absolute inline-flex h-2/3 w-2/3 rounded-full border border-signal/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-signal" />
      </div>

      <h1 className="mt-6 font-display text-xl text-ink">{lanSearching ? "Searching for nearby devices…" : "Discovery paused"}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Devices are matched by shared network conditions as seen by the signaling server — the most reliable
        signal a browser can use, since browsers can&apos;t run raw mDNS/Bonjour discovery directly.
      </p>

      <div className="mt-8 w-full">
        {lanPeers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline px-4 py-8 text-sm text-muted">
            No devices found yet. Open this same page on another device connected to the same WiFi network
            (not mobile data) — discovery can take a few seconds.
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {lanPeers.map((p) => (
              <li key={p.socketId} className="flex items-center justify-between rounded-lg border border-hairline bg-raised/50 px-4 py-3">
                <span className="text-sm text-ink">{p.deviceName}</span>
                <button
                  onClick={() => inviteLanPeer(p.socketId)}
                  className="rounded-md bg-transfer px-3 py-1.5 text-xs font-semibold text-void transition-opacity hover:opacity-90"
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={() => {
          stopLanDiscovery();
          startLanDiscovery();
        }}
        className="mt-6 text-xs text-muted underline decoration-dotted underline-offset-4 hover:text-ink"
      >
        Search again
      </button>
    </main>
  );
}
