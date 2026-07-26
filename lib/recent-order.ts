import { isValidOrderId } from "./order-tracking";

export const RECENT_ORDER_STORAGE_KEY = "jae_noi_recent_order_v1";
export const RECENT_ORDER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type RecentOrder = Readonly<{
  orderId: string;
  savedAt: number;
}>;

type RecentOrderStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredRecentOrder = {
  version: 1;
  orderId: string;
  savedAt: number;
  expiresAt: number;
};

export function saveRecentOrder(storage: RecentOrderStorage | null, orderId: string, now = Date.now()): boolean {
  if (!storage || !isValidOrderId(orderId)) return false;
  try {
    const value: StoredRecentOrder = {
      version: 1,
      orderId,
      savedAt: now,
      expiresAt: now + RECENT_ORDER_TTL_MS,
    };
    storage.setItem(RECENT_ORDER_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readRecentOrder(storage: RecentOrderStorage | null, now = Date.now()): RecentOrder | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RECENT_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const value = parseStoredRecentOrder(JSON.parse(raw), now);
    if (!value) storage.removeItem(RECENT_ORDER_STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}

export function clearRecentOrder(storage: RecentOrderStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(RECENT_ORDER_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function browserRecentOrderStorage(): RecentOrderStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseStoredRecentOrder(value: unknown, now: number): RecentOrder | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Partial<StoredRecentOrder>;
  if (
    stored.version !== 1
    || typeof stored.orderId !== "string"
    || !isValidOrderId(stored.orderId)
    || typeof stored.savedAt !== "number"
    || !Number.isFinite(stored.savedAt)
    || typeof stored.expiresAt !== "number"
    || !Number.isFinite(stored.expiresAt)
    || stored.expiresAt <= now
  ) return null;
  return { orderId: stored.orderId, savedAt: stored.savedAt };
}
