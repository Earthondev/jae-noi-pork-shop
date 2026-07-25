import type { NextConfig } from "next";

// Baseline defense-in-depth headers. The admin panel embeds the storefront
// in a same-origin <iframe> for its live preview (app/admin/dashboard.tsx),
// so frame-ancestors/X-Frame-Options must allow SAMEORIGIN, not deny/none —
// this still blocks third-party clickjacking, which is the actual goal.
//
// Only applied to the production build — Vite/vinext's local dev server
// (module transforms, HMR over its own WebSocket, etc.) doesn't fit cleanly
// under any one CSP we tried, and a dev server on localhost isn't a real
// security boundary anyway. Verified against a `vinext dev` run that the
// policy below silently stalls the storefront's client data fetch (no
// console error — the fetch succeeds but the resulting state update never
// runs), so it's scoped to production only rather than chasing dev-only
// script/connect exceptions that add risk for zero benefit.
const isProduction = process.env.NODE_ENV === "production";
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return isProduction ? [{ source: "/(.*)", headers: SECURITY_HEADERS }] : [];
  },
};

export default nextConfig;
