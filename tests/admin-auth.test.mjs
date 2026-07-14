import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ADMIN_SESSION_COOKIE,
  authenticateAdminSession,
  clearFailedLogins,
  createAdminPasswordHash,
  createAdminSession,
  getLoginThrottle,
  isAdminAuthReady,
  isSameOriginMutation,
  recordFailedLogin,
  revokeAdminSession,
  safeAdminReturnPath,
  verifyAdminCredentials,
} from "../lib/admin-auth.ts";

class MemoryR2 {
  objects = new Map();
  nextEtag = 1;

  async get(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      etag: stored.etag,
      json: async () => JSON.parse(stored.value),
    };
  }

  async put(key, value, options = {}) {
    const current = this.objects.get(key);
    if (options.onlyIf?.etagDoesNotMatch === "*" && current) return null;
    if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
    const stored = { value: String(value), etag: `etag-${this.nextEtag++}` };
    this.objects.set(key, stored);
    return { etag: stored.etag };
  }

  async delete(key) {
    this.objects.delete(key);
  }
}

async function configuredBindings() {
  return {
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD_HASH: await createAdminPasswordHash(
      "temporary-test-password",
      1_000,
      new Uint8Array(16).fill(7),
    ),
    ADMIN_AUTH_SECRET: "a-secure-test-secret-with-at-least-32-bytes",
    UPLOADS: new MemoryR2(),
  };
}

test("stores a salted password hash and verifies generic credentials", async () => {
  const bindings = await configuredBindings();
  assert.match(bindings.ADMIN_PASSWORD_HASH, /^pbkdf2-sha256\$1000\$/);
  assert.match(await createAdminPasswordHash("runtime-maximum-test"), /^pbkdf2-sha256\$100000\$/);
  assert.equal(isAdminAuthReady(bindings), true);
  assert.equal(await verifyAdminCredentials("admin", "temporary-test-password", bindings), true);
  assert.equal(await verifyAdminCredentials("admin", "wrong", bindings), false);
  assert.equal(await verifyAdminCredentials("someone", "temporary-test-password", bindings), false);
  assert.equal(isAdminAuthReady({ ...bindings, ADMIN_AUTH_SECRET: "short" }), false);
});

test("creates revocable server-side sessions without exposing credentials", async () => {
  const bindings = await configuredBindings();
  const token = await createAdminSession(bindings);
  assert.ok(token);
  assert.equal(token.includes("temporary-test-password"), false);
  assert.deepEqual(await authenticateAdminSession(token, bindings), {
    displayName: "admin",
    username: "admin",
    provider: "password",
  });
  await revokeAdminSession(token, bindings);
  assert.equal(await authenticateAdminSession(token, bindings), null);
});

test("blocks the sixth login attempt for fifteen minutes and can clear failures", async () => {
  const bindings = await configuredBindings();
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    assert.equal((await recordFailedLogin(bindings, "192.0.2.10")).allowed, true);
  }
  assert.equal((await recordFailedLogin(bindings, "192.0.2.10")).allowed, false);
  assert.equal((await getLoginThrottle(bindings, "192.0.2.10")).allowed, false);
  assert.equal((await getLoginThrottle(bindings, "192.0.2.11")).allowed, true);
  await clearFailedLogins(bindings, "192.0.2.10");
  assert.equal((await getLoginThrottle(bindings, "192.0.2.10")).allowed, true);
});

test("only permits same-origin mutations and safe admin return paths", () => {
  assert.equal(
    isSameOriginMutation(new Request("https://shop.example/admin", { headers: { origin: "https://shop.example" } })),
    true,
  );
  assert.equal(
    isSameOriginMutation(new Request("https://shop.example/admin", { headers: { origin: "https://evil.example" } })),
    false,
  );
  assert.equal(safeAdminReturnPath("/admin?tab=orders"), "/admin?tab=orders");
  assert.equal(safeAdminReturnPath("//evil.example"), "/admin");
  assert.equal(safeAdminReturnPath("/admin/login"), "/admin");
  assert.equal(ADMIN_SESSION_COOKIE, "jae_noi_admin_session");
});

test("login UI and admin APIs enforce the password session contract", async () => {
  const [loginPage, loginForm, loginRoute, logoutRoute, orderRoute, slipRoute] = await Promise.all([
    readFile(new URL("../app/admin/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/login/login-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/logout/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/orders/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/slips/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(loginPage, /เข้าสู่ระบบหลังบ้าน/);
  assert.match(loginForm, /autoComplete="username"/);
  assert.match(loginForm, /autoComplete="current-password"/);
  assert.match(loginForm, /aria-live="polite"/);
  assert.match(loginRoute, /httpOnly: true/);
  assert.match(loginRoute, /sameSite: "strict"/);
  assert.match(loginRoute, /getLoginThrottle/);
  assert.match(logoutRoute, /revokeAdminSession/);
  assert.match(orderRoute, /getAdminUser/);
  assert.match(orderRoute, /isSameOriginMutation/);
  assert.match(slipRoute, /getAdminUser/);
});

test("production build omits password hashes and authentication secrets", async () => {
  const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(viteConfig, /isLocalDevelopment/);
  assert.match(viteConfig, /ADMIN_USERNAME: "admin"/);
  assert.doesNotMatch(viteConfig, /isCloudflareDeployment\s*\?\s*\{[^}]*ADMIN_PASSWORD_HASH/s);
  assert.doesNotMatch(viteConfig, /isCloudflareDeployment\s*\?\s*\{[^}]*ADMIN_AUTH_SECRET/s);
  assert.doesNotMatch(viteConfig, /isCloudflareDeployment\s*\?\s*\{[^}]*GOOGLE_PRIVATE_KEY/s);
  assert.doesNotMatch(viteConfig, /isCloudflareDeployment\s*\?\s*\{[^}]*SLIPOK_API_KEY/s);
});
