type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "patio-pro-log:subscription-pending-operations:v1";
const memoryStorage = new Map<string, string>();

function getStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function readPending(storage: StorageLike | null) {
  if (!storage) return Object.fromEntries(memoryStorage);
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) || "{}") as Record<string, string>;
    return { ...Object.fromEntries(memoryStorage), ...stored };
  } catch {
    return {};
  }
}

function writePending(storage: StorageLike | null, pending: Record<string, string>) {
  if (!storage) {
    memoryStorage.clear();
    for (const [key, value] of Object.entries(pending)) memoryStorage.set(key, value);
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // A full or unavailable sessionStorage falls back to in-memory retry support.
    for (const [key, value] of Object.entries(pending)) memoryStorage.set(key, value);
  }
}

function requestKey(actorUid: string, payload: unknown) {
  return JSON.stringify({ actorUid, payload });
}

export function getOrCreateSubscriptionOperationId(
  actorUid: string,
  payload: unknown,
  options: { storage?: StorageLike | null; createId?: () => string } = {},
) {
  const storage = options.storage === undefined ? getStorage() : options.storage;
  const pending = readPending(storage);
  const key = requestKey(actorUid, payload);
  if (pending[key]) return pending[key];
  const id = (options.createId || (() => globalThis.crypto.randomUUID()))();
  pending[key] = id;
  writePending(storage, pending);
  return id;
}

export function clearSubscriptionOperationId(
  actorUid: string,
  payload: unknown,
  options: { storage?: StorageLike | null } = {},
) {
  const storage = options.storage === undefined ? getStorage() : options.storage;
  const pending = readPending(storage);
  delete pending[requestKey(actorUid, payload)];
  writePending(storage, pending);
}
