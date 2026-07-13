import { env } from "cloudflare:workers";

type SlipOkBindings = {
  SLIPOK_ENABLED?: string;
  SLIPOK_BRANCH_ID?: string;
  SLIPOK_API_KEY?: string;
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

type RateLimitEntry = { count: number; resetsAt: number };

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const attemptsByClient = new Map<string, RateLimitEntry>();

function bindings(): SlipOkBindings {
  return env as unknown as SlipOkBindings;
}

function configuration(): { branchId: string; apiKey: string } | null {
  const values = bindings();
  const branchId = values.SLIPOK_BRANCH_ID?.trim();
  const apiKey = values.SLIPOK_API_KEY?.trim();
  return values.SLIPOK_ENABLED === "true" && branchId && apiKey ? { branchId, apiKey } : null;
}

function canAttempt(clientKey: string): boolean {
  const now = Date.now();
  const current = attemptsByClient.get(clientKey);
  if (!current || current.resetsAt <= now) {
    attemptsByClient.set(clientKey, { count: 1, resetsAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
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
  if (!canAttempt(clientKey)) {
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
  } catch {
    return { status: "pending", reason: "เชื่อมต่อระบบตรวจสลิปไม่ได้ ร้านจะตรวจสอบให้ภายหลัง" };
  }
}
