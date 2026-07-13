export type ClientPaymentStatus = "waiting" | "review" | "verified" | "invalid";
export type SheetPaymentStatus = "รอชำระเงิน" | "รอตรวจสลิป" | "ชำระแล้ว" | "สลิปไม่ถูกต้อง";

type VerificationOutcome =
  | { status: "disabled" }
  | { status: "verified"; transactionReference: string; verifiedAt: string; senderName: string | null }
  | { status: "pending"; reason: string }
  | { status: "rejected"; reason: string };

type PaymentDecision = {
  paymentStatus: Exclude<SheetPaymentStatus, "รอชำระเงิน">;
  clientPaymentStatus: Exclude<ClientPaymentStatus, "waiting">;
  adminNote: string;
};

export function clientPaymentStatus(paymentStatus: string): ClientPaymentStatus {
  if (paymentStatus === "ชำระแล้ว") return "verified";
  if (paymentStatus === "รอตรวจสลิป") return "review";
  if (paymentStatus === "สลิปไม่ถูกต้อง") return "invalid";
  return "waiting";
}

export function paymentDecisionFromVerification(verification: VerificationOutcome): PaymentDecision {
  if (verification.status === "verified") {
    return {
      paymentStatus: "ชำระแล้ว",
      clientPaymentStatus: "verified",
      adminNote: `SlipOK ยืนยันแล้ว · Ref ${verification.transactionReference} · ${verification.verifiedAt}`,
    };
  }
  if (verification.status === "rejected") {
    return {
      paymentStatus: "สลิปไม่ถูกต้อง",
      clientPaymentStatus: "invalid",
      adminNote: `SlipOK ไม่ผ่าน · ${verification.reason}`,
    };
  }
  if (verification.status === "pending") {
    return {
      paymentStatus: "รอตรวจสลิป",
      clientPaymentStatus: "review",
      adminNote: `SlipOK รอตรวจ · ${verification.reason}`,
    };
  }
  return {
    paymentStatus: "รอตรวจสลิป",
    clientPaymentStatus: "review",
    adminNote: "SlipOK ยังไม่เปิดใช้งาน · รอตรวจสลิปด้วยตนเอง",
  };
}
