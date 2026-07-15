export const MONITORING_DEDUPE_WINDOW_MS = 15 * 60 * 1000;
export const MONITORING_DAILY_LIMIT = 100;

const MONITORING_PREFIX = "monitoring/v1";
const SENTRY_CLIENT = "jae-noi-monitoring/1.0";
const SENTRY_TIMEOUT_MS = 2_000;

export type MonitoringLevel = "warning" | "error" | "fatal";

export type MonitoringEventName =
  | "storefront_stale_snapshot"
  | "storefront_unavailable"
  | "order_storage_unavailable"
  | "order_write_failed"
  | "order_tracking_failed"
  | "slipok_unavailable"
  | "admin_cms_read_failed"
  | "admin_cms_write_failed"
  | "admin_login_failed"
  | "admin_logout_failed"
  | "admin_order_update_failed"
  | "admin_product_image_failed"
  | "admin_slip_read_failed"
  | "client_render_failed"
  | "worker_unhandled_exception"
  | "monitoring_daily_cap_reached";

type VersionMetadata = {
  id?: string;
  tag?: string;
  timestamp?: string;
};

export type MonitoringBindings = {
  UPLOADS?: Pick<R2Bucket, "get" | "put">;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  CF_VERSION_METADATA?: VersionMetadata;
};

export type OperationalErrorInput = {
  event: MonitoringEventName;
  operation: string;
  error?: unknown;
  level?: MonitoringLevel;
  path?: string;
  method?: string;
  tags?: Record<string, string | number | boolean | null | undefined>;
};

export type MonitoringResult =
  | { status: "sent"; incidentId: string }
  | { status: "logged-only"; incidentId: string }
  | { status: "duplicate-suppressed" }
  | { status: "daily-cap-suppressed" }
  | { status: "delivery-failed"; incidentId: string }
  | { status: "invalid-config"; incidentId: string };

type MonitoringOptions = {
  now?: () => Date;
  fetch?: typeof fetch;
};

type DailyCounter = {
  count: number;
  expiresAt: number;
};

type GateResult = "accepted" | "duplicate" | "daily-cap";

type SentryDsn = {
  endpoint: string;
  publicKey: string;
  dsn: string;
};

const memoryDedupe = new Map<string, number>();
let memoryDay = "";
let memoryCount = 0;
let memoryCapNoticeSent = false;

const safeDescriptions: Record<MonitoringEventName, string> = {
  storefront_stale_snapshot: "Storefront is serving its last-known-good snapshot",
  storefront_unavailable: "Storefront data is unavailable",
  order_storage_unavailable: "Order storage binding is unavailable",
  order_write_failed: "An order could not be written",
  order_tracking_failed: "Order tracking could not be completed",
  slipok_unavailable: "Slip verification service is unavailable",
  admin_cms_read_failed: "Admin CMS data could not be loaded",
  admin_cms_write_failed: "Admin CMS data could not be saved",
  admin_login_failed: "Admin login service failed",
  admin_logout_failed: "Admin logout service failed",
  admin_order_update_failed: "Admin order update failed",
  admin_product_image_failed: "Admin product image upload failed",
  admin_slip_read_failed: "Admin slip retrieval failed",
  client_render_failed: "The customer interface could not render",
  worker_unhandled_exception: "The Worker caught an unexpected exception",
  monitoring_daily_cap_reached: "The local monitoring daily event cap was reached",
};

export async function reportOperationalError(
  input: OperationalErrorInput,
  bindings: MonitoringBindings,
  options: MonitoringOptions = {},
): Promise<MonitoringResult> {
  const now = options.now?.() ?? new Date();
  const normalized = normalizeInput(input);
  const fingerprint = await sha256Hex(
    `${normalized.event}|${normalized.operation}|${normalized.errorType}`,
  );
  const gate = await claimGate(bindings.UPLOADS, fingerprint, now).catch((error: unknown) => {
    console.error({
      monitoringEvent: "monitoring_gate_unavailable",
      errorType: errorType(error),
    });
    return claimMemoryGate(fingerprint, now);
  });

  if (gate === "duplicate") return { status: "duplicate-suppressed" };
  if (gate === "daily-cap") {
    await reportDailyCapOnce(bindings, now, options.fetch ?? fetch);
    return { status: "daily-cap-suppressed" };
  }

  const incidentId = crypto.randomUUID();
  console.error({
    monitoringEvent: normalized.event,
    incidentId,
    level: normalized.level,
    operation: normalized.operation,
    path: normalized.path,
    method: normalized.method,
    errorType: normalized.errorType,
    release: releaseFrom(bindings),
  });

  const dsnValue = bindings.SENTRY_DSN?.trim();
  if (!dsnValue) return { status: "logged-only", incidentId };
  const dsn = parseSentryDsn(dsnValue);
  if (!dsn) {
    console.error({ monitoringEvent: "monitoring_config_invalid", incidentId });
    return { status: "invalid-config", incidentId };
  }

  const delivered = await sendSentryEnvelope(
    dsn,
    sentryEvent(normalized, bindings, fingerprint, incidentId, now),
    options.fetch ?? fetch,
  );
  return delivered
    ? { status: "sent", incidentId }
    : { status: "delivery-failed", incidentId };
}

export function stripSensitiveErrorDetails(error: unknown): {
  errorType: string;
  stackFrames: string[];
} {
  const stack = error instanceof Error && typeof error.stack === "string"
    ? error.stack.split("\n").slice(1, 25)
    : [];
  return {
    errorType: errorType(error),
    stackFrames: stack.map(sanitizeStackLine).filter(Boolean),
  };
}

export function resetMonitoringMemoryForTests(): void {
  memoryDedupe.clear();
  memoryDay = "";
  memoryCount = 0;
  memoryCapNoticeSent = false;
}

function normalizeInput(input: OperationalErrorInput) {
  const details = stripSensitiveErrorDetails(input.error);
  return {
    event: input.event,
    operation: safeToken(input.operation, 80) || "unknown",
    level: input.level ?? "error",
    path: safePath(input.path),
    method: safeMethod(input.method),
    tags: safeTags(input.tags),
    errorType: details.errorType,
    stackFrames: details.stackFrames,
  };
}

async function claimGate(
  bucket: MonitoringBindings["UPLOADS"],
  fingerprint: string,
  now: Date,
): Promise<GateResult> {
  if (!bucket) return claimMemoryGate(fingerprint, now);
  const nowMs = now.getTime();
  const day = now.toISOString().slice(0, 10);
  const windowStart = Math.floor(nowMs / MONITORING_DEDUPE_WINDOW_MS) * MONITORING_DEDUPE_WINDOW_MS;
  const dedupeKey = `${MONITORING_PREFIX}/dedupe/${day}/${fingerprint}/${windowStart}.json`;
  const dedupe = await bucket.put(
    dedupeKey,
    JSON.stringify({ createdAt: now.toISOString() }),
    {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" },
    },
  );
  if (!dedupe) return "duplicate";

  const counterKey = `${MONITORING_PREFIX}/quota/${day}.json`;
  const expiresAt = Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const existing = await bucket.get(counterKey);
    if (!existing) {
      const created = await bucket.put(
        counterKey,
        JSON.stringify({ count: 1, expiresAt } satisfies DailyCounter),
        {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "application/json" },
        },
      );
      if (created) return "accepted";
      continue;
    }

    const current = await existing.json<unknown>().catch(() => null);
    const count = isDailyCounter(current) && current.expiresAt > nowMs ? current.count : 0;
    if (count >= MONITORING_DAILY_LIMIT) return "daily-cap";
    const updated = await bucket.put(
      counterKey,
      JSON.stringify({ count: count + 1, expiresAt } satisfies DailyCounter),
      {
        onlyIf: { etagMatches: existing.etag },
        httpMetadata: { contentType: "application/json" },
      },
    );
    if (updated) return "accepted";
  }
  throw new Error("monitoring gate contention");
}

function claimMemoryGate(fingerprint: string, now: Date): GateResult {
  const nowMs = now.getTime();
  const day = now.toISOString().slice(0, 10);
  if (memoryDay !== day) {
    memoryDay = day;
    memoryCount = 0;
    memoryCapNoticeSent = false;
    memoryDedupe.clear();
  }
  const previous = memoryDedupe.get(fingerprint);
  if (previous !== undefined && nowMs - previous < MONITORING_DEDUPE_WINDOW_MS) return "duplicate";
  memoryDedupe.set(fingerprint, nowMs);
  if (memoryCount >= MONITORING_DAILY_LIMIT) return "daily-cap";
  memoryCount += 1;
  return "accepted";
}

async function reportDailyCapOnce(
  bindings: MonitoringBindings,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  let shouldNotify = false;
  if (bindings.UPLOADS) {
    try {
      shouldNotify = Boolean(await bindings.UPLOADS.put(
        `${MONITORING_PREFIX}/quota-notice/${day}.json`,
        JSON.stringify({ createdAt: now.toISOString() }),
        {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "application/json" },
        },
      ));
    } catch {
      shouldNotify = !memoryCapNoticeSent;
      memoryCapNoticeSent = true;
    }
  } else {
    shouldNotify = !memoryCapNoticeSent;
    memoryCapNoticeSent = true;
  }
  if (!shouldNotify) return;

  const incidentId = crypto.randomUUID();
  console.error({
    monitoringEvent: "monitoring_daily_cap_reached",
    incidentId,
    dailyLimit: MONITORING_DAILY_LIMIT,
  });
  const dsnValue = bindings.SENTRY_DSN?.trim();
  const dsn = dsnValue ? parseSentryDsn(dsnValue) : null;
  if (!dsn) return;
  const normalized = normalizeInput({
    event: "monitoring_daily_cap_reached",
    operation: "monitoring.daily_cap",
    level: "warning",
  });
  await sendSentryEnvelope(
    dsn,
    sentryEvent(normalized, bindings, "monitoring-daily-cap", incidentId, now),
    fetchImpl,
  );
}

function sentryEvent(
  input: ReturnType<typeof normalizeInput>,
  bindings: MonitoringBindings,
  fingerprint: string,
  incidentId: string,
  now: Date,
) {
  const release = releaseFrom(bindings);
  return {
    event_id: incidentId.replaceAll("-", ""),
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: input.level,
    logger: "jae-noi.monitoring",
    message: safeDescriptions[input.event],
    fingerprint: [fingerprint],
    environment: safeToken(bindings.SENTRY_ENVIRONMENT ?? "production", 32) || "production",
    ...(release ? { release } : {}),
    tags: {
      monitoring_event: input.event,
      operation: input.operation,
      method: input.method,
      path: input.path,
      ...input.tags,
    },
    exception: {
      values: [{
        type: input.errorType,
        value: safeDescriptions[input.event],
      }],
    },
    extra: {
      incident_id: incidentId,
      stack_frames: input.stackFrames,
    },
  };
}

async function sendSentryEnvelope(
  dsn: SentryDsn,
  event: ReturnType<typeof sentryEvent>,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const sentAt = new Date().toISOString();
  const eventJson = JSON.stringify(event);
  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: sentAt, dsn: dsn.dsn }),
    JSON.stringify({ type: "event", content_type: "application/json", length: new TextEncoder().encode(eventJson).byteLength }),
    eventJson,
  ].join("\n");
  try {
    const response = await fetchImpl(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=${SENTRY_CLIENT}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(SENTRY_TIMEOUT_MS),
    });
    if (response.ok) return true;
    console.error({ monitoringEvent: "monitoring_delivery_failed", status: response.status });
    return false;
  } catch (error) {
    console.error({ monitoringEvent: "monitoring_delivery_failed", errorType: errorType(error) });
    return false;
  }
}

function parseSentryDsn(value: string): SentryDsn | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.username || url.search || url.hash) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const projectId = segments.pop();
    if (!projectId || !/^[0-9]+$/.test(projectId)) return null;
    const pathPrefix = segments.length > 0 ? `/${segments.join("/")}` : "";
    return {
      endpoint: `${url.origin}${pathPrefix}/api/${projectId}/envelope/`,
      publicKey: decodeURIComponent(url.username),
      dsn: value,
    };
  } catch {
    return null;
  }
}

function releaseFrom(bindings: MonitoringBindings): string | undefined {
  const candidate = bindings.CF_VERSION_METADATA?.id ?? bindings.SENTRY_RELEASE;
  return candidate ? safeToken(candidate, 100) || undefined : undefined;
}

function isDailyCounter(value: unknown): value is DailyCounter {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<DailyCounter>;
  return Number.isInteger(candidate.count) &&
    (candidate.count ?? -1) >= 0 &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt);
}

function safeTags(
  tags: OperationalErrorInput["tags"],
): Record<string, string> {
  if (!tags) return {};
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(tags)) {
    const key = safeToken(rawKey, 32);
    if (!key || rawValue === null || rawValue === undefined) continue;
    result[key] = safeToken(String(rawValue), 100);
  }
  return result;
}

function safeToken(value: string, maxLength: number): string {
  return value
    .replace(/[^A-Za-z0-9_.:/-]/g, "_")
    .slice(0, maxLength);
}

function safePath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.split(/[?#]/, 1)[0].replace(/[^A-Za-z0-9_./-]/g, "_").slice(0, 200) || "/";
}

function safeMethod(value: string | undefined): string {
  const method = (value ?? "UNKNOWN").toUpperCase();
  return /^[A-Z]{3,10}$/.test(method) ? method : "UNKNOWN";
}

function sanitizeStackLine(value: string): string {
  return value
    .replace(/\/Users\/[^/\s)]+/g, "/Users/[redacted]")
    .replace(/[?#].*?(?=\s|\)|$)/g, "")
    .replace(/[A-Za-z0-9_-]{48,}/g, "[redacted-token]")
    .trim()
    .slice(0, 500);
}

function errorType(error: unknown): string {
  if (error instanceof Error) return safeToken(error.name || "Error", 80) || "Error";
  if (error === null) return "null";
  return safeToken(typeof error, 80) || "unknown";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
