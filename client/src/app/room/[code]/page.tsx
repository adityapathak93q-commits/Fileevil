"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRoom } from "@/lib/RoomProvider";
import { useToast } from "@/components/ToastProvider";
import { ParticipantList } from "@/components/ParticipantList";
import { FileDropzone } from "@/components/FileDropzone";
import { TransferList } from "@/components/TransferList";
import { RenameDeviceButton } from "@/components/RenameDeviceButton";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = String(params.code ?? "").toUpperCase();
  const { room, connecting, joinRoom, leaveRoom, sendFiles, transfers, lastError, clearError } = useRoom();
  const router = useRouter();
  const toast = useToast();
  const attempted = useRef(false);
  const knownStatuses = useRef<Record<string, string>>({});

  useEffect(() => {
    for (const t of transfers) {
      const prevStatus = knownStatuses.current[t.id];
      if (prevStatus !== t.status) {
        knownStatuses.current[t.id] = t.status;
        if (prevStatus && t.status === "completed") {
          toast.push(`${t.direction === "incoming" ? "Received" : "Sent"} "${t.fileName}"`, "success");
        } else if (prevStatus && t.status === "failed") {
          toast.push(`"${t.fileName}" failed${t.error ? `: ${t.error}` : ""}`, "error");
        }
      }
    }
  }, [transfers, toast]);

  useEffect(() => {
    if (room?.code === code) return;
    if (attempted.current) return;
    attempted.current = true;
    joinRoom(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code]);

  useEffect(() => {
    if (lastError) {
      toast.push(lastError.message, "error");
      clearError();
      if (lastError.code === "ROOM_NOT_FOUND" || lastError.code === "ROOM_FULL") {
        router.push("/join-room");
      }
    }
  }, [lastError, toast, clearError, router]);

  const matched = room?.code === code;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-5">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-display text-sm text-muted hover:text-ink">
            FileSync
          </Link>
          <span className="text-muted">/</span>
          <span className="font-mono text-sm tracking-widest text-signal">{code}</span>
        </div>
        <div className="flex items-center gap-4">
          <RenameDeviceButton />
          <button
            onClick={() => {
              leaveRoom();
              router.push("/");
            }}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:border-danger/40 hover:text-danger"
          >
            Leave room
          </button>
        </div>
      </header>

      {!matched && (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-transfer" />
          <p className="text-sm text-muted">{connecting ? "Connecting to room…" : "Loading room…"}</p>
        </div>
      )}

      {matched && room && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <ParticipantList />
            <div className="flex flex-col gap-4">
              <FileDropzone onFiles={(files) => sendFiles(files)} disabled={room.participants.length < 2} />
              {room.participants.length < 2 && (
                <p className="text-center text-xs text-muted">Waiting for another device to join before you can send files.</p>
              )}
            </div>
          </div>

          <TransferList />
        </div>
      )}
    </main>
  );
}
