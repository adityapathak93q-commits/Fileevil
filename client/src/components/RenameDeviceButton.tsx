"use client";

import { useState } from "react";
import { useRoom } from "@/lib/RoomProvider";
import { isValidDeviceName } from "@/lib/deviceName";

export function RenameDeviceButton() {
  const { deviceName, setDeviceName } = useRoom();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(deviceName);

  if (editing) {
    return (
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (isValidDeviceName(value)) {
            setDeviceName(value.trim());
            setEditing(false);
          }
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={40}
          className="w-40 rounded-md border border-hairline bg-raised px-2 py-1 text-xs text-ink outline-none focus:border-transfer"
        />
        <button type="submit" className="text-xs font-medium text-signal">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted">
          Cancel
        </button>
      </form>
    );
  }

  return (
    <button
      onClick={() => {
        setValue(deviceName);
        setEditing(true);
      }}
      className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
    >
      <span className="text-ink">{deviceName}</span>
      <span className="underline decoration-dotted underline-offset-2">edit</span>
    </button>
  );
}
