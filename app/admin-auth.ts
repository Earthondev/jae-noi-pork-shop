import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  authenticateCloudflareAccess,
  authenticateAdminSession,
  isPasswordFallbackEnabled,
  safeAdminReturnPath,
  type AdminAuthBindings,
  type AdminUser,
} from "../lib/admin-auth";

export function adminAuthBindings(): AdminAuthBindings {
  return env as unknown as AdminAuthBindings;
}

export async function getAdminSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const bindings = adminAuthBindings();
  const accessUser = await authenticateCloudflareAccess(await headers(), bindings);
  if (accessUser) return accessUser;
  if (!isPasswordFallbackEnabled(bindings)) return null;
  return authenticateAdminSession(
    await getAdminSessionToken(),
    bindings,
  );
}

export async function requireAdminUser(returnTo: string): Promise<AdminUser> {
  const user = await getAdminUser();
  if (user) return user;

  const safeReturnTo = safeAdminReturnPath(returnTo);
  redirect(`/admin/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
}
