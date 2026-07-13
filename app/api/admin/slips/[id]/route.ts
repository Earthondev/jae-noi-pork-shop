import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureOrderSchema, getBindings } from "../../../../../db/orders";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const { DB, UPLOADS } = getBindings();
  await ensureOrderSchema(DB);
  const row = await DB.prepare("SELECT slip_key FROM orders WHERE id = ?").bind(id).first<{ slip_key: string | null }>();
  if (!row?.slip_key) return new Response("ไม่พบสลิป", { status: 404 });
  const file = await UPLOADS.get(row.slip_key);
  if (!file) return new Response("ไม่พบไฟล์", { status: 404 });
  const headers = new Headers();
  file.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  return new Response(file.body, { headers });
}
