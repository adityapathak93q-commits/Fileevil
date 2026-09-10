"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRoom } from "@/lib/RoomProvider";
import { useToast } from "@/components/ToastProvider";

export default function CreateRoomPage() {
  const { room, connecting, createRoom, lastError, clearError } = useRoom();
  const router = useRouter();
  const toast = useToast();
  const requested = useRef(false);

  useEffect(() => {
    if (!requested.current) {
      requested.current = true;
      createRoom();
    }
  }, [createRoom]);

  useEffect(() => {
    if (room) {
      const t = setTimeout(() => router.push(`/room/${room.code}`), 900);
      return () => clearTimeout(t);
    }
  }, [room, router]);

  useEffect(() => {
    if (lastError) {
      toast.push(lastError.message, "error");
      clearError();
    }
  }, [lastError, toast, clearError]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-14 text-center">
      <Link href="/" className="mb-10 font-display text-sm text-muted hover:text-ink">
        ← FileSync
      </Link>

      {!room && (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-hairline border-t-signal" />
          <p className="mt-5 text-sm text-muted">{connecting ? "Creating your room…" : "Setting up…"}</p>
        </>
      )}

      {room && (
        <>
          <p className="text-xs uppercase tracking-widest text-muted" style={{ letterSpacing: "0.08em" }}>
            Room created
          </p>
          <p className="mt-3 font-mono text-5xl font-semibold tracking-[0.2em] text-signal">{room.code}</p>
          <p className="mt-5 text-sm text-muted">Share this code with anyone you want in the room.</p>
          <div className="mt-8 flex items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
            Waiting for users to join…
          </div>
        </>
      )}
    </main>
  );
}
