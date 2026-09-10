const DEVICE_NAME_KEY = "filesync.deviceName";
const DEVICE_ID_KEY = "filesync.deviceId";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Stable per-browser identifier. Not tied to any account — purely so the
 * same physical device is recognized across reconnects/refreshes. */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomId();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getSavedDeviceName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DEVICE_NAME_KEY);
}

export function saveDeviceName(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEVICE_NAME_KEY, name.trim().slice(0, 40));
}

export function isValidDeviceName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 40;
}
