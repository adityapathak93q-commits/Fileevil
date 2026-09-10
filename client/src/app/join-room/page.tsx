"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRoom } from "@/lib/RoomProvider";
import { useToast } from "@/components/ToastProvider";

export default function JoinRoomPage() {
  const { room, connecting, joinRoom, lastError, clearError } = useRoom();
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (room) router.push(`/room/${room.code}`);
  }, [room, router]);

  useEffect(() => {
    if (lastError) {
      setSubmitted(false);
      toast.push(lastError.message, "error");
      clearError();
    }
  }, [lastError, toast, clearError]);

  const codeValid = /^[A-Z0-9]{4,10}$/.test(code.toUpperCase());

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6 py-14">
      <Link href="/" className="mb-10 self-start font-display text-sm text-muted hover:text-ink">
        ← FileSync
      </Link>

      <div className="w-full text-center">
        <h1 className="font-display text-2xl text-ink">Join a room</h1>
        <p className="mt-2 text-sm text-muted">Enter the code shown on the other device.</p>

        <form
          className="mt-8 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!codeValid) return;
            setSubmitted(true);
            joinRoom(code.toUpperCase());
          }}
        >
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
            placeholder="X7K9P2"
            className="w-full rounded-xl border border-hairline bg-raised px-4 py-4 text-center font-mono text-2xl tracking-[0.3em] text-ink placeholder:text-muted/40 outline-none focus:border-transfer"
          />
          <button
            type="submit"
            disabled={!codeValid || submitted || connecting}
            className="rounded-xl bg-transfer py-3 text-sm font-semibold text-void transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitted || connecting ? "Connecting…" : "Join room"}
          </button>
        </form>
      </div>
    </main>
  );
}
