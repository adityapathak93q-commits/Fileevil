"use client";

import { useState } from "react";
import { useRoom } from "@/lib/RoomProvider";
import { isValidDeviceName } from "@/lib/deviceName";

export function DeviceNameGate({ children }: { children: React.ReactNode }) {
  const { isDeviceNameSet, setDeviceName } = useRoom();
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  if (isDeviceNameSet) return <>{children}</>;

  const valid = isValidDeviceName(value);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-void/90 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-2xl animate-rise">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-signal/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="2" width="14" height="20" rx="2.5" stroke="#6EF2A6" strokeWidth="1.6" />
            <path d="M11 18h2" stroke="#6EF2A6" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-center font-display text-lg text-ink">What&apos;s your device name?</h1>
        <p className="mt-1.5 text-center text-sm text-muted">This is how other people in your room will see you. No account needed.</p>

        <form
          className="mt-5 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valid) setDeviceName(value.trim());
          }}
        >
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Aditya's Phone"
            maxLength={40}
            className="w-full rounded-lg border border-hairline bg-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-transfer"
          />
          {touched && !valid && <p className="text-xs text-danger">Enter a name between 1 and 40 characters.</p>}
          <button
            type="submit"
            className="mt-2 rounded-lg bg-signal py-2.5 text-sm font-semibold text-void transition-opacity hover:opacity-90"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
