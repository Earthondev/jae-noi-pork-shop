import { env } from "cloudflare:workers";
import { getAdminUser } from "../../../../admin-auth";
import { getOrderSlipKey } from "../../../../../lib/google-sheets";

type UploadBindings = { UPLOADS?: R2Bucket };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const slipKey = await getOrderSlipKey(id);
  if (!slipKey) return new Response("ไม่พบสลิป", { status: 404 });
  const uploads = (env as unknown as UploadBindings).UPLOADS;
  if (!uploads) return new Response("ระบบไฟล์ยังไม่พร้อม", { status: 503 });
  const file = await uploads.get(slipKey);
  if (!file) return new Response("ไม่พบไฟล์", { status: 404 });
  const headers = new Headers();
  file.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  return new Response(file.body, { headers });
}
