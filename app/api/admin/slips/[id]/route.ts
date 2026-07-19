import { env } from "cloudflare:workers";
import { getAdminUser } from "../../../../admin-auth";
import { getOrderSlipKey } from "../../../../../db/order-repository";
import { reportServerError } from "../../../../../lib/server-monitoring";

type UploadBindings = { UPLOADS?: R2Bucket };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  try {
    const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
    const { id } = await context.params;
    const slipKey = await getOrderSlipKey(id);
    if (!slipKey) return new Response("ไม่พบสลิป", { status: 404 });
    const uploads = (env as unknown as UploadBindings).UPLOADS;
    if (!uploads) throw new Error("MissingUploadsBinding");
    const file = await uploads.get(slipKey);
    if (!file) return new Response("ไม่พบไฟล์", { status: 404 });
    const headers = new Headers();
    file.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", wantsDownload ? "attachment" : "inline");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(file.body, { headers });
  } catch (error) {
    reportServerError({ event: "admin_slip_read_failed", operation: "admin.slip.read", error, path: "/api/admin/slips/:id", method: "GET" });
    return new Response("เปิดสลิปไม่สำเร็จ กรุณาลองใหม่", { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
