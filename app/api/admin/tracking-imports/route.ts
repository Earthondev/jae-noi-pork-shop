import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getAdminUser } from "../../../admin-auth";
import { commitTrackingImport, previewTrackingImport, TrackingImportCommitError } from "../../../../db/tracking-import-repository";
import { isSameOriginMutation } from "../../../../lib/admin-auth";
import { isCarrierCode } from "../../../../lib/carriers";
import { checkRateLimit } from "../../../../lib/rate-limit";
import {
  MAX_TRACKING_IMPORT_BYTES,
  parseTrackingWorkbook,
  TrackingImportValidationError,
  type TrackingImportSelection,
} from "../../../../lib/tracking-import";
import { publicErrorBody } from "../../../../lib/public-errors";
import { reportServerError } from "../../../../lib/server-monitoring";
import {
  MalformedRequestBodyError,
  parseBoundedFormData,
  RequestBodyTooLargeError,
  UnsupportedRequestContentTypeError,
} from "../../../../lib/request-body";

const MAX_REQUEST_BYTES = MAX_TRACKING_IMPORT_BYTES + 128 * 1024;
const IMPORT_RATE_WINDOW_MS = 10 * 60 * 1000;
const IMPORT_RATE_MAX = 20;

type ImportBindings = { UPLOADS?: R2Bucket };

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, 401);
  if (!isSameOriginMutation(request)) return json({ error: "คำขอไม่ถูกต้อง" }, 403);

  const uploads = (env as unknown as ImportBindings).UPLOADS;
  if (uploads && !(await checkRateLimit(uploads, "tracking-import-rate", user.username, { windowMs: IMPORT_RATE_WINDOW_MS, max: IMPORT_RATE_MAX }))) {
    return json({ error: "นำเข้าไฟล์ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" }, 429, { "Retry-After": String(IMPORT_RATE_WINDOW_MS / 1000) });
  }

  let form: FormData;
  try {
    form = await parseBoundedFormData(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: "ไฟล์ต้องมีขนาดไม่เกิน 2 MB" }, 413);
    if (error instanceof UnsupportedRequestContentTypeError || error instanceof MalformedRequestBodyError) {
      return json({ error: "ข้อมูลอัปโหลดไม่ถูกต้อง" }, 400);
    }
    throw error;
  }

  const action = String(form.get("action") ?? "");
  const carrierCode = form.get("carrierCode");
  const file = form.get("file");
  if (action !== "preview" && action !== "commit") return json({ error: "คำสั่งนำเข้าไม่ถูกต้อง" }, 400);
  if (!isCarrierCode(carrierCode)) return json({ error: "ยังไม่รองรับบริษัทขนส่งนี้" }, 400);
  if (!(file instanceof File)) return json({ error: "กรุณาเลือกไฟล์จากบริษัทขนส่ง" }, 400);
  if (file.size <= 0 || file.size > MAX_TRACKING_IMPORT_BYTES) return json({ error: "ไฟล์ต้องมีขนาดไม่เกิน 2 MB" }, 400);

  try {
    const parsed = await parseTrackingWorkbook({
      name: file.name,
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    }, carrierCode);
    if (action === "preview") return json(await previewTrackingImport(parsed));

    const selections = parseSelections(form.get("selections"));
    return json(await commitTrackingImport(parsed, selections, user.username));
  } catch (error) {
    if (error instanceof TrackingImportValidationError) return json({ error: error.message }, 400);
    if (error instanceof TrackingImportCommitError) return json({ error: error.message }, 409);
    reportServerError({
      event: "admin_tracking_import_failed",
      operation: action === "commit" ? "admin.tracking_import.commit" : "admin.tracking_import.preview",
      error,
      path: "/api/admin/tracking-imports",
      method: "POST",
    });
    return json(publicErrorBody("ADMIN_UNAVAILABLE"), 502);
  }
}

function parseSelections(value: FormDataEntryValue | null): TrackingImportSelection[] {
  if (typeof value !== "string" || value.length > 64 * 1024) throw new TrackingImportCommitError("รายการที่เลือกไม่ถูกต้อง กรุณาพรีวิวไฟล์ใหม่");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new TrackingImportCommitError("รายการที่เลือกไม่ถูกต้อง กรุณาพรีวิวไฟล์ใหม่");
  }
  if (!Array.isArray(parsed) || parsed.length > 500) throw new TrackingImportCommitError("จำนวนรายการที่เลือกไม่ถูกต้อง");
  return parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TrackingImportCommitError("รายการที่เลือกไม่ถูกต้อง");
    const sourceRow = (item as Record<string, unknown>).sourceRow;
    const orderId = (item as Record<string, unknown>).orderId;
    if (!Number.isInteger(sourceRow) || typeof orderId !== "string" || orderId.length > 32) throw new TrackingImportCommitError("รายการที่เลือกไม่ถูกต้อง");
    return { sourceRow: sourceRow as number, orderId };
  });
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private", ...extraHeaders } });
}
