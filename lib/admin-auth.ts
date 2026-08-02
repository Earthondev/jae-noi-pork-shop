import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * The admin panel is authenticated solely by Cloudflare Access, which guards
 * `/admin*` and `/api/admin/*` at the edge. The username/password login this
 * file used to carry was removed on 2026-08-03: it was a second door into the
 * same data, held open by one shared secret that could not be rotated per
 * person and left no record of who signed in. Access owns sessions, sign-out
 * and the identity list now.
 *
 * The Worker still verifies the assertion itself instead of trusting the edge,
 * so a request that somehow reaches the origin without passing Access — a
 * misconfigured route, a deleted application — fails closed rather than walking
 * straight into the dashboard.
 */

export type AdminAuthBindings = {
  ADMIN_ALLOWED_EMAILS?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  APP_ENV?: string;
};

export type AdminUser = {
  displayName: string;
  username: string;
  provider: "cloudflare-access" | "local-development";
};

type HeaderReader = Pick<Headers, "get">;

const accessJwksByDomain = new Map<string, JWTVerifyGetKey>();

export function isCloudflareAccessReady(bindings: AdminAuthBindings): boolean {
  return accessConfiguration(bindings) !== null;
}

/**
 * Cloudflare Access never reaches a machine running `npm run dev`, so without
 * this there would be no way to open the admin panel locally at all.
 *
 * The test is deliberately `=== "development"` rather than "not production":
 * an unset or misspelled value fails closed. `vite.config.ts` hardcodes
 * `APP_ENV: "production"` for Cloudflare builds — it is not read from the
 * environment there — so nothing deployed can reach this branch.
 */
export function isLocalDevelopmentBypass(bindings: AdminAuthBindings): boolean {
  return bindings.APP_ENV === "development";
}

export async function authenticateCloudflareAccess(
  headers: HeaderReader,
  bindings: AdminAuthBindings,
): Promise<AdminUser | null> {
  if (isLocalDevelopmentBypass(bindings)) {
    return {
      displayName: "ผู้ดูแล (เครื่องนักพัฒนา)",
      username: "local-dev",
      provider: "local-development",
    };
  }

  const configuration = accessConfiguration(bindings);
  const token = headers.get("cf-access-jwt-assertion");
  if (!configuration || !token || token.length > 16_384) return null;

  try {
    const { payload, protectedHeader } = await jwtVerify(
      token,
      accessJwks(configuration.teamDomain),
      {
        algorithms: ["RS256"],
        issuer: configuration.teamDomain,
        audience: configuration.audience,
        requiredClaims: ["exp", "iat", "iss", "aud", "email"],
        clockTolerance: 5,
      },
    );
    if (protectedHeader.alg !== "RS256" || payload.type !== "app") return null;
    // Access decides who may reach the origin at all; this second list decides
    // who is an admin. Keeping both means widening one does not silently widen
    // the other.
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!configuration.allowedEmails.has(email)) return null;

    return { displayName: email, username: email, provider: "cloudflare-access" };
  } catch {
    return null;
  }
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

function accessConfiguration(bindings: AdminAuthBindings): {
  teamDomain: string;
  audience: string;
  allowedEmails: Set<string>;
} | null {
  const teamDomain = normalizedAccessTeamDomain(bindings.CLOUDFLARE_ACCESS_TEAM_DOMAIN);
  const audience = bindings.CLOUDFLARE_ACCESS_AUD?.trim() ?? "";
  const allowedEmails = new Set(
    (bindings.ADMIN_ALLOWED_EMAILS ?? "")
      .split(/[;,\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  );
  return teamDomain && /^[a-f0-9]{64}$/i.test(audience) && allowedEmails.size > 0
    ? { teamDomain, audience, allowedEmails }
    : null;
}

function normalizedAccessTeamDomain(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".cloudflareaccess.com") ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function accessJwks(teamDomain: string): JWTVerifyGetKey {
  const existing = accessJwksByDomain.get(teamDomain);
  if (existing) return existing;
  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  accessJwksByDomain.set(teamDomain, jwks);
  return jwks;
}
