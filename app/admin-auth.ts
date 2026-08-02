import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import {
  authenticateCloudflareAccess,
  type AdminAuthBindings,
  type AdminUser,
} from "../lib/admin-auth";

export function adminAuthBindings(): AdminAuthBindings {
  return env as unknown as AdminAuthBindings;
}

export async function getAdminUser(): Promise<AdminUser | null> {
  return authenticateCloudflareAccess(await headers(), adminAuthBindings());
}

/**
 * Cloudflare Access guards `/admin*` and `/api/admin/*` at the edge, so a
 * visitor with no session is sent to the Access login before the Worker ever
 * runs. Reaching here means Access let the request through but the Worker
 * refused the assertion — a stale `CLOUDFLARE_ACCESS_AUD`, the wrong team
 * domain, or an address the Access policy allows and `ADMIN_ALLOWED_EMAILS`
 * does not. Redirecting back to Access would bounce the browser in a loop, so
 * state the actual problem instead.
 */
export async function requireAdminUser(returnTo: string): Promise<AdminUser> {
  const user = await getAdminUser();
  if (user) return user;
  void returnTo;

  throw new Response(
    "เข้าสู่ระบบผ่าน Cloudflare Access แล้ว แต่บัญชีนี้ยังไม่ได้รับสิทธิ์ผู้ดูแลร้าน\n" +
      "ตรวจว่าอีเมลนี้อยู่ใน ADMIN_ALLOWED_EMAILS และ CLOUDFLARE_ACCESS_AUD ตรงกับ Access application\n",
    { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
