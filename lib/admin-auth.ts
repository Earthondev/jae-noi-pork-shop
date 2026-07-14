export const ADMIN_SESSION_COOKIE = "jae_noi_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";
// Cloudflare Workers Web Crypto currently rejects PBKDF2 counts above 100,000.
// Use the runtime maximum and keep the resulting verifier in an encrypted
// Worker secret rather than in source control or a client-owned data store.
const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const SESSION_PREFIX = "admin-auth/sessions/";
const LOGIN_RATE_PREFIX = "admin-auth/login-rate/";

export type AdminAuthBindings = {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_AUTH_SECRET?: string;
  UPLOADS?: R2Bucket;
};

export type AdminUser = {
  displayName: string;
  username: string;
  provider: "password";
};

type AdminSessionRecord = {
  username: string;
  createdAt: number;
  expiresAt: number;
};

type LoginRateRecord = {
  count: number;
  expiresAt: number;
};

export type LoginThrottle = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function configuredAdminUsername(bindings: AdminAuthBindings): string {
  return bindings.ADMIN_USERNAME?.trim() || "admin";
}

export function isAdminAuthReady(bindings: AdminAuthBindings): boolean {
  return Boolean(
    bindings.UPLOADS &&
      parsePasswordHash(bindings.ADMIN_PASSWORD_HASH) &&
      bindings.ADMIN_AUTH_SECRET &&
      new TextEncoder().encode(bindings.ADMIN_AUTH_SECRET).byteLength >= 32,
  );
}

export async function createAdminPasswordHash(
  password: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS,
  salt = crypto.getRandomValues(new Uint8Array(16)),
): Promise<string> {
  if (!isValidPasswordInput(password)) {
    throw new Error("Password must contain between 1 and 256 UTF-8 bytes");
  }
  if (!Number.isInteger(iterations) || iterations < 1_000 || iterations > 100_000) {
    throw new Error("PBKDF2 iteration count is outside the supported range");
  }

  const derived = await derivePasswordBytes(password, salt, iterations);
  return [
    PASSWORD_HASH_ALGORITHM,
    String(iterations),
    base64UrlEncode(salt),
    base64UrlEncode(derived),
  ].join("$");
}

export async function verifyAdminCredentials(
  username: string,
  password: string,
  bindings: AdminAuthBindings,
): Promise<boolean> {
  const parsed = parsePasswordHash(bindings.ADMIN_PASSWORD_HASH);
  if (!parsed || !isValidPasswordInput(password)) return false;
  if (!constantTimeEqualStrings(username.trim(), configuredAdminUsername(bindings))) return false;

  const actual = await derivePasswordBytes(password, parsed.salt, parsed.iterations);
  return constantTimeEqualBytes(actual, parsed.hash);
}

export async function createAdminSession(
  bindings: AdminAuthBindings,
): Promise<string | null> {
  if (!isAdminAuthReady(bindings) || !bindings.UPLOADS || !bindings.ADMIN_AUTH_SECRET) {
    return null;
  }

  const token = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  const record: AdminSessionRecord = {
    username: configuredAdminUsername(bindings),
    createdAt: now,
    expiresAt: now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
  };
  const key = await sessionKey(token, bindings.ADMIN_AUTH_SECRET);
  await bindings.UPLOADS.put(key, JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
  });
  return token;
}

export async function authenticateAdminSession(
  token: string | undefined,
  bindings: AdminAuthBindings,
): Promise<AdminUser | null> {
  if (!token || !isAdminAuthReady(bindings) || !bindings.UPLOADS || !bindings.ADMIN_AUTH_SECRET) {
    return null;
  }

  const key = await sessionKey(token, bindings.ADMIN_AUTH_SECRET);
  const object = await bindings.UPLOADS.get(key);
  if (!object) return null;

  const record = await object.json<AdminSessionRecord>().catch(() => null);
  const expectedUsername = configuredAdminUsername(bindings);
  if (
    !record ||
    record.expiresAt <= Date.now() ||
    record.username !== expectedUsername
  ) {
    await bindings.UPLOADS.delete(key).catch(() => undefined);
    return null;
  }

  return {
    displayName: expectedUsername,
    username: expectedUsername,
    provider: "password",
  };
}

export async function revokeAdminSession(
  token: string | undefined,
  bindings: AdminAuthBindings,
): Promise<void> {
  if (!token || !bindings.UPLOADS || !bindings.ADMIN_AUTH_SECRET) return;
  await bindings.UPLOADS.delete(await sessionKey(token, bindings.ADMIN_AUTH_SECRET));
}

export async function getLoginThrottle(
  bindings: AdminAuthBindings,
  clientKey: string,
): Promise<LoginThrottle> {
  if (!isAdminAuthReady(bindings) || !bindings.UPLOADS || !bindings.ADMIN_AUTH_SECRET) {
    return { allowed: false, retryAfterSeconds: 60 };
  }

  const { key } = await loginRateKey(clientKey, bindings.ADMIN_AUTH_SECRET);
  const object = await bindings.UPLOADS.get(key);
  if (!object) return { allowed: true, retryAfterSeconds: 0 };

  const record = await object.json<LoginRateRecord>().catch(() => null);
  if (!record || record.expiresAt <= Date.now()) {
    await bindings.UPLOADS.delete(key).catch(() => undefined);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: record.count < MAX_FAILED_LOGINS,
    retryAfterSeconds: Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000)),
  };
}

export async function recordFailedLogin(
  bindings: AdminAuthBindings,
  clientKey: string,
): Promise<LoginThrottle> {
  if (!isAdminAuthReady(bindings) || !bindings.UPLOADS || !bindings.ADMIN_AUTH_SECRET) {
    return { allowed: false, retryAfterSeconds: 60 };
  }

  const { key, windowStart } = await loginRateKey(clientKey, bindings.ADMIN_AUTH_SECRET);
  const expiresAt = windowStart + LOGIN_WINDOW_MS;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await bindings.UPLOADS.get(key);
    if (!existing) {
      const created = await bindings.UPLOADS.put(
        key,
        JSON.stringify({ count: 1, expiresAt } satisfies LoginRateRecord),
        {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "application/json" },
        },
      );
      if (created) {
        return {
          allowed: true,
          retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)),
        };
      }
      continue;
    }

    const current = await existing.json<LoginRateRecord>().catch(() => null);
    const nextCount = current && current.expiresAt > Date.now() ? current.count + 1 : 1;
    const next: LoginRateRecord = { count: nextCount, expiresAt };
    const updated = await bindings.UPLOADS.put(key, JSON.stringify(next), {
      onlyIf: { etagMatches: existing.etag },
      httpMetadata: { contentType: "application/json" },
    });
    if (updated) {
      return {
        allowed: nextCount < MAX_FAILED_LOGINS,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)),
      };
    }
  }

  return { allowed: false, retryAfterSeconds: Math.ceil(LOGIN_WINDOW_MS / 1000) };
}

export async function clearFailedLogins(
  bindings: AdminAuthBindings,
  clientKey: string,
): Promise<void> {
  if (!bindings.UPLOADS || !bindings.ADMIN_AUTH_SECRET) return;
  const { key } = await loginRateKey(clientKey, bindings.ADMIN_AUTH_SECRET);
  await bindings.UPLOADS.delete(key).catch(() => undefined);
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function safeAdminReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/admin";
  }
  try {
    const url = new URL(value, "https://admin.local");
    if (url.origin !== "https://admin.local" || url.pathname === "/admin/login") return "/admin";
    return url.pathname.startsWith("/admin") ? `${url.pathname}${url.search}${url.hash}` : "/admin";
  } catch {
    return "/admin";
  }
}

async function derivePasswordBytes(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function parsePasswordHash(value: string | undefined): {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
} | null {
  if (!value) return null;
  const [algorithm, rawIterations, rawSalt, rawHash, extra] = value.split("$");
  const iterations = Number(rawIterations);
  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    extra !== undefined ||
    !Number.isInteger(iterations) ||
    iterations < 1_000 ||
    iterations > 100_000
  ) {
    return null;
  }
  try {
    const salt = base64UrlDecode(rawSalt);
    const hash = base64UrlDecode(rawHash);
    return salt.byteLength >= 16 && hash.byteLength === 32
      ? { iterations, salt, hash }
      : null;
  } catch {
    return null;
  }
}

function isValidPasswordInput(password: string): boolean {
  const byteLength = new TextEncoder().encode(password).byteLength;
  return byteLength > 0 && byteLength <= 256;
}

function constantTimeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function constantTimeEqualStrings(left: string, right: string): boolean {
  return constantTimeEqualBytes(
    new TextEncoder().encode(left),
    new TextEncoder().encode(right),
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sessionKey(token: string, secret: string): Promise<string> {
  return `${SESSION_PREFIX}${await hmacHex(`session:${token}`, secret)}.json`;
}

async function loginRateKey(
  clientKey: string,
  secret: string,
): Promise<{ key: string; windowStart: number }> {
  const windowStart = Math.floor(Date.now() / LOGIN_WINDOW_MS) * LOGIN_WINDOW_MS;
  const clientHash = await hmacHex(`login:${clientKey}`, secret);
  return { key: `${LOGIN_RATE_PREFIX}${clientHash}/${windowStart}.json`, windowStart };
}
