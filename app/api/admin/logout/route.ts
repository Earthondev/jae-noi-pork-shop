import { NextResponse } from "next/server";
import {
  adminAuthBindings,
  getAdminUser,
  getAdminSessionToken,
} from "../../../admin-auth";
import {
  ADMIN_SESSION_COOKIE,
  isSameOriginMutation,
  revokeAdminSession,
} from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "คำขอออกจากระบบไม่ถูกต้อง" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const user = await getAdminUser();
  await revokeAdminSession(await getAdminSessionToken(), adminAuthBindings());
  const logoutPath = user?.provider === "cloudflare-access"
    ? "/cdn-cgi/access/logout"
    : "/admin/login";
  const response = NextResponse.redirect(new URL(logoutPath, request.url), 303);
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
