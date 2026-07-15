export const STOREFRONT_SNAPSHOT_KEY = "storefront-cache/last-known-good-v1.json";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

type SnapshotBucket = Pick<R2Bucket, "get" | "put">;

type SnapshotEnvelope<T> = {
  version: 1;
  savedAt: string;
  data: T;
};

export type ResilientStorefrontResult<T> = {
  data: T;
  source: "google-sheets" | "r2-stale";
  savedAt: string;
  attempts: number;
};

type ResilientStorefrontOptions<T> = {
  loadFresh: (signal: AbortSignal) => Promise<T>;
  validate: (value: unknown) => value is T;
  shouldRetry: (error: unknown) => boolean;
  bucket?: SnapshotBucket;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
};

class StorefrontTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Google Sheets request exceeded ${timeoutMs} ms`);
    this.name = "StorefrontTimeoutError";
  }
}

export async function loadResilientStorefront<T>(
  options: ResilientStorefrontOptions<T>,
): Promise<ResilientStorefrontResult<T>> {
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const retryDelayMs = nonNegativeInteger(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? delay;
  const snapshotPromise = readSnapshot(options.bucket, options.validate);
  let lastError: unknown = new Error("โหลดข้อมูลหน้าร้านไม่สำเร็จ");
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsMade = attempt;
    try {
      const data = await loadWithTimeout(options.loadFresh, timeoutMs);
      if (!options.validate(data)) throw new InvalidFreshStorefrontError();
      const savedAt = now().toISOString();
      await writeSnapshot(options.bucket, { version: 1, savedAt, data });
      return { data, source: "google-sheets", savedAt, attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof StorefrontTimeoutError || options.shouldRetry(error);
      if (!retryable || attempt === maxAttempts) break;
      if (retryDelayMs > 0) await sleep(retryDelayMs * attempt);
    }
  }

  const snapshot = await snapshotPromise;
  if (snapshot) {
    return {
      data: snapshot.data,
      source: "r2-stale",
      savedAt: snapshot.savedAt,
      attempts: attemptsMade,
    };
  }

  throw lastError;
}

class InvalidFreshStorefrontError extends Error {
  constructor() {
    super("Fresh storefront data failed validation");
    this.name = "InvalidFreshStorefrontError";
  }
}

async function loadWithTimeout<T>(
  loadFresh: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new StorefrontTimeoutError(timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => loadFresh(controller.signal)),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readSnapshot<T>(
  bucket: SnapshotBucket | undefined,
  validate: (value: unknown) => value is T,
): Promise<SnapshotEnvelope<T> | null> {
  if (!bucket) return null;
  try {
    const object = await bucket.get(STOREFRONT_SNAPSHOT_KEY);
    if (!object) return null;
    const value = await object.json<unknown>();
    if (!isRecord(value) || value.version !== 1 || typeof value.savedAt !== "string" || !validate(value.data)) {
      return null;
    }
    if (!Number.isFinite(Date.parse(value.savedAt))) return null;
    return { version: 1, savedAt: value.savedAt, data: value.data };
  } catch {
    return null;
  }
}

async function writeSnapshot<T>(
  bucket: SnapshotBucket | undefined,
  snapshot: SnapshotEnvelope<T>,
): Promise<void> {
  if (!bucket) return;
  try {
    await bucket.put(STOREFRONT_SNAPSHOT_KEY, JSON.stringify(snapshot), {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { savedAt: snapshot.savedAt, version: "1" },
    });
  } catch {
    // A cache write must never hide fresh Google Sheets data from customers.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? -1) >= 0 ? value as number : fallback;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
