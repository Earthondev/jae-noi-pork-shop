import { NextResponse } from "next/server";
import { adminAuthBindings } from "../../../admin-auth";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  clearFailedLogins,
  createAdminSession,
  getLoginThrottle,
  isAdminAuthReady,
  isSameOriginMutation,
  recordFailedLogin,
  verifyAdminCredentials,
} from "../../../../lib/admin-auth";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return privateJson({ error: "ไม่สามารถเข้าสู่ระบบจากหน้านี้ได้" }, 403);
  }

  const bindings = adminAuthBindings();
  if (!isAdminAuthReady(bindings)) {
    return privateJson({ error: "ระบบหลังบ้านยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแล" }, 503);
  }

  const clientKey = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local";
  const throttle = await getLoginThrottle(bindings, clientKey);
  if (!throttle.allowed) {
    return privateJson(
      { error: "ลองรหัสหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" },
      429,
      { "Retry-After": String(throttle.retryAfterSeconds) },
    );
  }

  const body = await request.json().catch(() => null) as {
    username?: unknown;
    password?: unknown;
  } | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await verifyAdminCredentials(username, password, bindings))) {
    const updatedThrottle = await recordFailedLogin(bindings, clientKey);
    const headers = updatedThrottle.allowed
      ? undefined
      : { "Retry-After": String(updatedThrottle.retryAfterSeconds) };
    return privateJson(
      { error: updatedThrottle.allowed
        ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
        : "ลองรหัสหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" },
      updatedThrottle.allowed ? 401 : 429,
      headers,
    );
  }

  const token = await createAdminSession(bindings);
  if (!token) {
    return privateJson({ error: "สร้างการเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
  await clearFailedLogins(bindings, clientKey);

  const response = privateJson({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

function privateJson(
  body: object,
  status = 200,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: { ...PRIVATE_HEADERS, ...extraHeaders },
  });
}
