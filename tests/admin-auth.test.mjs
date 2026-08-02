import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exportJWK, SignJWT } from "jose";
import {
  authenticateCloudflareAccess,
  isCloudflareAccessReady,
  isLocalDevelopmentBypass,
  isSameOriginMutation,
} from "../lib/admin-auth.ts";

const TEAM_DOMAIN = "https://jae-noi-test.cloudflareaccess.com";
const AUDIENCE = "a".repeat(64);

function productionBindings(overrides = {}) {
  return {
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    CLOUDFLARE_ACCESS_AUD: AUDIENCE,
    ADMIN_ALLOWED_EMAILS: "owner@example.com, client@example.com",
    APP_ENV: "production",
    ...overrides,
  };
}

/** Serves the signing key at the JWKS URL the team domain implies. */
async function withAccessJwks(run) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { alg: "RS256", kid: "test-access-key", use: "sig" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), `${TEAM_DOMAIN}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await run(async (claims, options = {}) =>
      new Headers({
        "Cf-Access-Jwt-Assertion": await new SignJWT({ type: "app", ...claims })
          .setProtectedHeader({ alg: "RS256", kid: "test-access-key" })
          .setIssuer(options.issuer ?? TEAM_DOMAIN)
          .setAudience(options.audience ?? AUDIENCE)
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey),
      }));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("a signed assertion from an allowed address authenticates", async () => {
  await withAccessJwks(async (sign) => {
    const bindings = productionBindings();
    assert.equal(isCloudflareAccessReady(bindings), true);
    // Access sends whatever case the identity provider holds, so "OWNER@" has
    // to match "owner@" in the allowlist.
    assert.deepEqual(await authenticateCloudflareAccess(await sign({ email: "OWNER@EXAMPLE.COM" }), bindings), {
      displayName: "owner@example.com",
      username: "owner@example.com",
      provider: "cloudflare-access",
    });
  });
});

test("a valid signature is still refused when the claims do not match", async () => {
  await withAccessJwks(async (sign) => {
    const bindings = productionBindings();
    const cases = [
      ["an address Access allows but this app does not", await sign({ email: "intruder@example.com" })],
      ["another application's audience", await sign({ email: "owner@example.com" }, { audience: "b".repeat(64) })],
      ["a different team domain", await sign({ email: "owner@example.com" }, { issuer: "https://other.cloudflareaccess.com" })],
    ];
    for (const [reason, headers] of cases) {
      assert.equal(await authenticateCloudflareAccess(headers, bindings), null, reason);
    }
    // No assertion at all is the case that matters most: it means the request
    // reached the origin without passing Access.
    assert.equal(await authenticateCloudflareAccess(new Headers(), bindings), null);
  });
});

test("incomplete Access configuration authenticates nobody", async () => {
  for (const [reason, overrides] of [
    ["no team domain", { CLOUDFLARE_ACCESS_TEAM_DOMAIN: undefined }],
    ["a team domain that is not cloudflareaccess.com", { CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://evil.example.com" }],
    ["an http team domain", { CLOUDFLARE_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN.replace("https:", "http:") }],
    ["an audience that is not a 64-character hex tag", { CLOUDFLARE_ACCESS_AUD: "too-short" }],
    ["an empty allowlist", { ADMIN_ALLOWED_EMAILS: "" }],
  ]) {
    const bindings = productionBindings(overrides);
    assert.equal(isCloudflareAccessReady(bindings), false, reason);
    assert.equal(await authenticateCloudflareAccess(new Headers(), bindings), null, reason);
  }
});

test("the local-development bypass cannot be reached by a deployed build", async () => {
  // Access never reaches `npm run dev`, so local work needs some way in.
  assert.equal(isLocalDevelopmentBypass({ APP_ENV: "development" }), true);
  const local = await authenticateCloudflareAccess(new Headers(), { APP_ENV: "development" });
  assert.equal(local?.provider, "local-development");

  // Anything other than exactly "development" fails closed.
  for (const value of ["production", "Development", "dev", "", undefined]) {
    assert.equal(isLocalDevelopmentBypass({ APP_ENV: value }), false, `APP_ENV=${value}`);
  }

  // And the deployed value is hardcoded rather than read from the environment,
  // so a stray variable at deploy time cannot flip it.
  const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(viteConfig, /isCloudflareDeployment[\s\S]{0,200}APP_ENV: "production"/);
});

test("mutations must come from this origin", () => {
  const url = "https://jaenoishop.com/api/admin/cms";
  assert.equal(isSameOriginMutation(new Request(url, { method: "POST", headers: { origin: "https://jaenoishop.com" } })), true);
  assert.equal(isSameOriginMutation(new Request(url, { method: "POST", headers: { origin: "https://evil.example.com" } })), false);
  assert.equal(isSameOriginMutation(new Request(url, { method: "POST" })), false);
});

test("the password login is gone and nothing references it", async () => {
  // Removed 2026-08-03: a shared password was a second door into the same data,
  // impossible to rotate per person and leaving no record of who signed in.
  for (const path of [
    "../app/admin/login/page.tsx",
    "../app/admin/login/login-form.tsx",
    "../app/api/admin/login/route.ts",
    "../app/api/admin/logout/route.ts",
  ]) {
    await assert.rejects(readFile(new URL(path, import.meta.url), "utf8"), `${path} ต้องถูกลบแล้ว`);
  }

  const [adminAuth, libAuth, dashboard] = await Promise.all([
    readFile(new URL("../app/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(adminAuth, /authenticateCloudflareAccess/);
  assert.doesNotMatch(adminAuth, /admin\/login/);
  for (const gone of ["ADMIN_PASSWORD_HASH", "ADMIN_AUTH_SECRET", "createAdminSession", "getLoginThrottle", "PBKDF2"]) {
    assert.doesNotMatch(libAuth, new RegExp(gone), `${gone} ต้องไม่เหลืออยู่`);
  }
  // Sign-out belongs to Access; clearing a cookie of our own would leave the
  // Access session intact and sign the admin straight back in.
  assert.match(dashboard, /\/cdn-cgi\/access\/logout/);
  assert.doesNotMatch(dashboard, /admin\/login/);
});

test("admin API routes still check the user and the origin", async () => {
  const [orderRoute, slipRoute] = await Promise.all([
    readFile(new URL("../app/api/admin/orders/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/slips/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(orderRoute, /getAdminUser/);
  assert.match(orderRoute, /isSameOriginMutation/);
  assert.match(slipRoute, /getAdminUser/);
  assert.match(slipRoute, /new URL\(request\.url\)\.searchParams\.get\("download"\) === "1"/);
  assert.match(slipRoute, /Content-Disposition", wantsDownload \? "attachment" : "inline"/);
});

test("the production build ships no credentials", async () => {
  const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.doesNotMatch(viteConfig, /isCloudflareDeployment\s*\?\s*\{[^}]*ADMIN_PASSWORD_HASH/s);
  assert.doesNotMatch(viteConfig, /isCloudflareDeployment\s*\?\s*\{[^}]*ADMIN_AUTH_SECRET/s);
  assert.doesNotMatch(viteConfig, /isCloudflareDeployment\s*\?\s*\{[^}]*GOOGLE_PRIVATE_KEY/s);
});
