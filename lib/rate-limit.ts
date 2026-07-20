type RateLimitReceipt = { count: number; expiresAt: number };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function clientIpKey(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local";
}

/**
 * Sliding-window rate limiter backed by conditional R2 writes (etagDoesNotMatch/etagMatches),
 * so concurrent Worker isolates can't both win the same window.
 */
export async function checkRateLimit(
  uploads: R2Bucket,
  namespace: string,
  clientKey: string,
  options: { windowMs: number; max: number },
): Promise<boolean> {
  const { windowMs, max } = options;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const clientHash = await sha256Hex(clientKey);
  const key = `${namespace}/${clientHash}/${windowStart}.json`;
  const previousKey = `${namespace}/${clientHash}/${windowStart - windowMs}.json`;
  void uploads.delete(previousKey).catch(() => undefined);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await uploads.get(key);
    if (!existing) {
      const created = await uploads.put(key, JSON.stringify({ count: 1, expiresAt: windowStart + windowMs }), {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
      });
      if (created) return true;
      continue;
    }

    const receipt = await existing.json<RateLimitReceipt>().catch(() => null);
    if (!receipt || receipt.expiresAt <= now || receipt.count >= max) return false;
    const updated = await uploads.put(key, JSON.stringify({ ...receipt, count: receipt.count + 1 }), {
      onlyIf: { etagMatches: existing.etag },
      httpMetadata: { contentType: "application/json" },
    });
    if (updated) return true;
  }
  return false;
}
