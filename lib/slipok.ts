import { env } from "cloudflare:workers";
import { checkRateLimit } from "./rate-limit";
import { reportServerError } from "./server-monitoring";

type SlipOkBindings = {
  SLIPOK_ENABLED?: string;
  SLIPOK_BRANCH_ID?: string;
  SLIPOK_API_KEY?: string;
  UPLOADS?: R2Bucket;
};

type SlipOkResponse = {
  success?: boolean;
  code?: number;
  message?: string;
  data?: {
    success?: boolean;
    transRef?: string;
    transTimestamp?: string;
    amount?: number;
    countryCode?: string;
    sender?: { displayName?: string };
  };
};

export type SlipVerificationResult =
  | { status: "disabled" }
  | { status: "verified"; transactionReference: string; verifiedAt: string; senderName: string | null }
  | { status: "pending"; reason: string }
  | { status: "rejected"; reason: string };

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function bindings(): SlipOkBindings {
  return env as unknown as SlipOkBindings;
}

function configuration(): { branchId: string; apiKey: string } | null {
  const values = bindings();
  const branchId = values.SLIPOK_BRANCH_ID?.trim();
  const apiKey = values.SLIPOK_API_KEY?.trim();
  return values.SLIPOK_ENABLED === "true" && branchId && apiKey ? { branchId, apiKey } : null;
}

// Backed by R2 (via the shared checkRateLimit helper) instead of an
// in-memory Map — Workers isolates are short-lived and requests for the
// same client can land on different isolates, so a plain in-process Map
// never reliably enforced this cap. No UPLOADS binding means we can't
// verify the cap, so fail closed to a "pending"/manual-review outcome
// rather than risk unbounded calls to the paid SlipOK API.
async function canAttempt(clientKey: string): Promise<boolean> {
  const uploads = bindings().UPLOADS;
  if (!uploads) return false;
  return checkRateLimit(uploads, "slipok-verify", clientKey, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX_ATTEMPTS });
}

function safeReason(code: number | undefined): SlipVerificationResult {
  if (code === 1012) return { status: "rejected", reason: "สลิปนี้ถูกใช้ยืนยันคำสั่งซื้อแล้ว" };
  if (code === 1013) return { status: "rejected", reason: "ยอดเงินในสลิปไม่ตรงกับยอดคำสั่งซื้อ" };
  if (code === 1014) return { status: "rejected", reason: "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีของร้าน" };
  if ([1005, 1006, 1007, 1008, 1011].includes(code ?? -1)) {
    return { status: "rejected", reason: "สลิปไม่ถูกต้องหรือไม่พบรายการโอนเงินจริง" };
  }
  if (code === 1010) return { status: "pending", reason: "ธนาคารกำลังประมวลผลสลิป กรุณารอตรวจสอบอีกครั้ง" };
  return { status: "pending", reason: "ระบบตรวจสลิปอัตโนมัติยังยืนยันไม่ได้ ร้านจะตรวจสอบให้ภายหลัง" };
}

function uploadName(mimeType: string): string {
  if (mimeType === "image/png") return "slip.png";
  if (mimeType === "image/webp") return "slip.webp";
  return "slip.jpg";
}

export function isSlipOkEnabled(): boolean {
  return configuration() !== null;
}

export async function verifySlipWithSlipOk(
  slip: File,
  expectedAmount: number,
  clientKey: string,
): Promise<SlipVerificationResult> {
  const config = configuration();
  if (!config) return { status: "disabled" };
  if (!(await canAttempt(clientKey))) {
    return { status: "pending", reason: "มีการตรวจสลิปถี่เกินไป ร้านจะตรวจสอบให้ภายหลัง" };
  }

  const requestBody = new FormData();
  requestBody.append("files", slip, uploadName(slip.type));
  requestBody.append("amount", expectedAmount.toFixed(2));
  requestBody.append("log", "true");

  try {
    const response = await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(config.branchId)}`, {
      method: "POST",
      headers: { "x-authorization": config.apiKey },
      body: requestBody,
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json().catch(() => null) as SlipOkResponse | null;
    if (!response.ok || !result?.success || !result.data?.success) return safeReason(result?.code);

    const amount = Number(result.data.amount);
    const transactionReference = result.data.transRef?.trim();
    if (!transactionReference || !Number.isFinite(amount) || Math.abs(amount - expectedAmount) > 0.009 || result.data.countryCode !== "TH") {
      return { status: "pending", reason: "ข้อมูลตอบกลับจากระบบตรวจสลิปไม่ครบ ร้านจะตรวจสอบให้ภายหลัง" };
    }

    return {
      status: "verified",
      transactionReference,
      verifiedAt: result.data.transTimestamp ?? new Date().toISOString(),
      senderName: result.data.sender?.displayName?.trim() || null,
    };
  } catch (error) {
    reportServerError({
      event: "slipok_unavailable",
      operation: "slipok.verify",
      error,
      path: "/api/orders",
      method: "POST",
      level: "warning",
    });
    return { status: "pending", reason: "เชื่อมต่อระบบตรวจสลิปไม่ได้ ร้านจะตรวจสอบให้ภายหลัง" };
  }
}
