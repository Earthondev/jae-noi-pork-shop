"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  trackingStepIndex,
  type PublicOrderTracking,
} from "../../lib/order-tracking";

const paymentLabels: Record<PublicOrderTracking["paymentStatus"], string> = {
  waiting_for_payment: "รอชำระเงิน",
  waiting_for_slip_review: "รอตรวจสลิป",
  paid: "ชำระแล้ว",
  invalid_slip: "สลิปไม่ถูกต้อง",
  refunded: "คืนเงินแล้ว",
};

const orderLabels: Record<PublicOrderTracking["orderStatus"], string> = {
  received: "รับออเดอร์แล้ว",
  preparing: "กำลังเตรียม",
  ready_for_pickup: "พร้อมรับหน้าร้าน",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "—" : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function receiptLines(order: PublicOrderTracking): string[] {
  return order.items.map((item) => `${item.name} × ${item.quantity}    ${item.lineTotal.toLocaleString("th-TH")} บาท`);
}

async function saveReceiptPng(order: PublicOrderTracking): Promise<void> {
  await document.fonts.ready;
  const lines = receiptLines(order);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 850 + lines.length * 62;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("อุปกรณ์นี้ยังไม่รองรับการบันทึกรูป");

  context.fillStyle = "#fffaf0";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#b51519";
  context.fillRect(0, 0, canvas.width, 190);
  context.fillStyle = "#f4bd24";
  context.fillRect(0, 190, canvas.width, 12);
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = "700 52px 'Noto Sans Thai', sans-serif";
  context.fillText("เจ๊น้อย เขียงหมูตะคร้อ", canvas.width / 2, 86);
  context.font = "500 30px 'Noto Sans Thai', sans-serif";
  context.fillText("ใบยืนยันการชำระเงิน", canvas.width / 2, 145);

  context.textAlign = "left";
  context.fillStyle = "#281616";
  context.font = "700 34px 'Noto Sans Thai', sans-serif";
  context.fillText(`เลขออเดอร์  ${order.orderId}`, 78, 275);
  context.fillStyle = "#237343";
  context.fillText("ชำระแล้ว", 78, 330);
  context.fillStyle = "#765d56";
  context.font = "500 26px 'Noto Sans Thai', sans-serif";
  context.fillText(`รอบจัดส่ง  ${order.deliveryDate || "—"}`, 78, 382);
  context.fillText(`ออกเอกสาร  ${new Date().toLocaleString("th-TH")}`, 78, 426);

  context.strokeStyle = "#ead6b5";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(78, 470);
  context.lineTo(1002, 470);
  context.stroke();
  context.fillStyle = "#281616";
  context.font = "700 30px 'Noto Sans Thai', sans-serif";
  context.fillText("รายการสินค้า", 78, 525);
  context.font = "500 27px 'Noto Sans Thai', sans-serif";
  lines.forEach((line, index) => context.fillText(line, 78, 585 + index * 62));

  const totalY = 640 + lines.length * 62;
  context.strokeStyle = "#ead6b5";
  context.beginPath();
  context.moveTo(78, totalY);
  context.lineTo(1002, totalY);
  context.stroke();
  context.fillStyle = "#8d1014";
  context.font = "800 40px 'Noto Sans Thai', sans-serif";
  context.fillText(`ยอดชำระทั้งหมด  ${order.total.toLocaleString("th-TH")} บาท`, 78, totalY + 70);
  context.fillStyle = "#765d56";
  context.font = "500 24px 'Noto Sans Thai', sans-serif";
  context.fillText("เอกสารนี้ออกโดยระบบร้านเจ๊น้อย กรุณาเก็บเลขออเดอร์ไว้ติดตามสินค้า", 78, totalY + 135);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("สร้างรูปใบยืนยันไม่สำเร็จ");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jae-noi-receipt-${order.orderId}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function OrderTracker({ initialOrderId = "" }: { initialOrderId?: string }) {
  const [orderId, setOrderId] = useState(initialOrderId);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [order, setOrder] = useState<PublicOrderTracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (order) resultHeadingRef.current?.focus();
  }, [order]);

  async function lookupOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOrder(null);
    setReceiptError(null);
    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderId.trim().toUpperCase(), phoneLast4 }),
      });
      const result = await response.json() as { order?: PublicOrderTracking; error?: string };
      if (!response.ok || !result.order) throw new Error(result.error ?? "ตรวจสอบออเดอร์ไม่สำเร็จ");
      setOrder(result.order);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "ตรวจสอบออเดอร์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const currentStep = order ? trackingStepIndex(order.orderStatus, order.fulfilment) : -1;
  const steps = order?.fulfilment === "pickup"
    ? ["รับออเดอร์แล้ว", "กำลังเตรียม", "พร้อมรับหน้าร้าน", "สำเร็จ"]
    : ["รับออเดอร์แล้ว", "กำลังเตรียม", "จัดส่งแล้ว", "สำเร็จ"];

  return (
    <main className="track-page">
      <header className="track-header">
        <Link href="/" aria-label="กลับหน้าร้าน"><Image src="/images/products/jae-noi-shop-logo.jpg" alt="เจ๊น้อย เขียงหมูตะคร้อ" width={130} height={78} priority /></Link>
        <Link href="/">กลับหน้าร้าน</Link>
      </header>

      <section className="track-hero">
        <p className="eyebrow">ตรวจได้ด้วยตัวเองตลอดเวลา</p>
        <h1>ติดตามออเดอร์</h1>
        <p>กรอกเลขออเดอร์และเบอร์โทร 4 ตัวท้าย ข้อมูลส่วนตัวของคุณจะไม่แสดงต่อสาธารณะ</p>
        <form className="track-form" onSubmit={lookupOrder}>
          <label>เลขออเดอร์<input value={orderId} onChange={(event) => setOrderId(event.target.value.toUpperCase())} autoComplete="off" spellCheck={false} maxLength={22} placeholder="JN-20260716-7G4K2P9ABC" required /></label>
          <label>เบอร์โทร 4 ตัวท้าย<input value={phoneLast4} onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} placeholder="เช่น 7892" required /></label>
          <button type="submit" disabled={loading}>{loading ? "กำลังตรวจสอบ..." : "ตรวจสอบสถานะ"}</button>
        </form>
        {error && <p className="track-error" role="alert">{error}</p>}
      </section>

      {loading && <section className="tracking-skeleton" aria-live="polite" aria-label="กำลังโหลดสถานะออเดอร์"><span /><span /><span /><span /></section>}

      {order && (
        <section className="track-result" aria-live="polite">
          <div className="track-result-heading">
            <div><p className="eyebrow">อัปเดตล่าสุด {formatDate(order.updatedAt)}</p><h2 ref={resultHeadingRef} tabIndex={-1}>{order.orderId}</h2><p>{order.maskedPhone}</p></div>
            <div className="customer-statuses"><span className={`customer-payment payment-${order.paymentStatus}`}>{paymentLabels[order.paymentStatus]}</span><span>{orderLabels[order.orderStatus]}</span></div>
          </div>

          {order.orderStatus === "cancelled" ? <p className="track-warning" role="status">ออเดอร์นี้ถูกยกเลิก หากมีการชำระเงินแล้วกรุณาติดต่อร้าน</p> : (
            <ol className="tracking-steps" aria-label="ความคืบหน้าออเดอร์">
              {steps.map((step, index) => <li className={index <= currentStep ? "done" : ""} key={step} aria-current={index === currentStep ? "step" : undefined}><span aria-hidden="true">{index < currentStep ? "✓" : index + 1}</span><strong>{step}</strong></li>)}
            </ol>
          )}

          <div className="tracking-details">
            <div><span>รอบจัดส่ง</span><strong>{order.deliveryDate || "รอข้อมูล"}</strong></div>
            <div><span>วิธีรับสินค้า</span><strong>{order.fulfilmentLabel}</strong></div>
            <div><span>เลขพัสดุ</span><strong>{order.trackingNumber ?? "ยังไม่มีเลขพัสดุ"}</strong></div>
          </div>
          <div className="tracking-items"><h3>รายการสินค้า</h3>{order.items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name} × {item.quantity}</span><strong>{item.lineTotal.toLocaleString("th-TH")} บาท</strong></div>)}<div className="tracking-total"><span>ยอดรวม</span><strong>{order.total.toLocaleString("th-TH")} บาท</strong></div></div>

          {order.paymentStatus === "paid" && (
            <section className="track-receipt" aria-labelledby="receipt-title">
              <p className="receipt-mark" aria-hidden="true">✓</p><p className="eyebrow">ชำระเงินเรียบร้อย</p><h3 id="receipt-title">ใบยืนยันการชำระเงิน</h3><p>เลขออเดอร์ <strong>{order.orderId}</strong></p><div className="receipt-items">{order.items.map((item, index) => <p key={`${item.name}-receipt-${index}`}><span>{item.name} × {item.quantity}</span><strong>{item.lineTotal.toLocaleString("th-TH")} บาท</strong></p>)}</div><p>ยอดชำระ <strong>{order.total.toLocaleString("th-TH")} บาท</strong></p><p>รอบจัดส่ง <strong>{order.deliveryDate}</strong></p>
              <div className="receipt-actions"><button type="button" onClick={() => { setReceiptError(null); void saveReceiptPng(order).catch((saveError: unknown) => setReceiptError(saveError instanceof Error ? saveError.message : "บันทึกรูปไม่สำเร็จ")); }}>บันทึกเป็นรูป PNG</button><button type="button" onClick={() => window.print()}>พิมพ์หรือบันทึก PDF</button></div>
              {receiptError && <p className="track-error" role="alert">{receiptError}</p>}
            </section>
          )}
        </section>
      )}

      <footer className="track-footer"><p>ต้องการความช่วยเหลือ โทรหาร้านได้ทันที</p><div className="track-phone-links" aria-label="เบอร์โทรร้านเจ๊น้อย"><a href="tel:0872416773">☎ 087-2416773</a><a href="tel:0878755479">☎ 087-8755479</a></div><Link href="/">กลับไปเลือกสินค้า</Link></footer>
    </main>
  );
}
