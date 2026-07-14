import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  authenticateAdminSession,
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
  return authenticateAdminSession(
    await getAdminSessionToken(),
    adminAuthBindings(),
  );
}

export async function requireAdminUser(returnTo: string): Promise<AdminUser> {
  const user = await getAdminUser();
  if (user) return user;

  const safeReturnTo = safeAdminReturnPath(returnTo);
  redirect(`/admin/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
}
