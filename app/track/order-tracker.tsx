"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BottomNav } from "../_components/shop/bottom-nav";
import { useCheckoutDraft } from "../_hooks/use-checkout-draft";
import {
  trackingStepIndex,
  type PublicOrderTracking,
} from "../../lib/order-tracking";
import {
  CustomerFacingError,
  PUBLIC_ERROR_MESSAGES,
  safeClientApiMessage,
} from "../../lib/public-errors";

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

const INITIAL_VISIBLE_ORDERS = 3;
const ORDERS_PER_PAGE = 3;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "—" : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function receiptLines(order: PublicOrderTracking): string[] {
  return order.items.map((item) => `${item.name} × ${item.quantity}    ${item.lineTotal.toLocaleString("th-TH")} บาท`);
}

async function saveReceiptPng(order: PublicOrderTracking, storeName: string): Promise<void> {
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
  context.fillText(storeName, canvas.width / 2, 86);
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

function OrderHistoryCard({ order, expanded, onToggle, storeName }: { order: PublicOrderTracking; expanded: boolean; onToggle: () => void; storeName: string }) {
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const currentStep = trackingStepIndex(order.orderStatus, order.fulfilment);
  const steps = order.fulfilment === "pickup"
    ? ["รับออเดอร์แล้ว", "กำลังเตรียม", "พร้อมรับหน้าร้าน", "สำเร็จ"]
    : ["รับออเดอร์แล้ว", "กำลังเตรียม", "จัดส่งแล้ว", "สำเร็จ"];

  return (
    <article className={`track-history-card${expanded ? " expanded" : ""}`}>
      <button className="track-order-summary" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span><small>{formatDate(order.createdAt)}</small><strong>{order.orderId}</strong><em>{order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</em></span>
        <span><b>{order.total.toLocaleString("th-TH")} บาท</b><i>{orderLabels[order.orderStatus]}</i><span aria-hidden="true">⌄</span></span>
      </button>
      {expanded && (
        <div className="track-order-expanded">
          <div className="customer-statuses"><span className={`customer-payment payment-${order.paymentStatus}`}>{paymentLabels[order.paymentStatus]}</span><span>{orderLabels[order.orderStatus]}</span></div>
          {order.orderStatus === "cancelled" ? <p className="track-warning" role="status">ออเดอร์นี้ถูกยกเลิก หากมีการชำระเงินแล้วกรุณาติดต่อร้าน</p> : (
            <ol className="tracking-steps" aria-label="ความคืบหน้าออเดอร์">
              {steps.map((step, index) => (
                <li className={index <= currentStep ? "done" : ""} key={step} aria-current={index === currentStep ? "step" : undefined}>
                  <span aria-hidden="true">{index < currentStep ? "✓" : index + 1}</span><strong>{step}</strong>
                </li>
              ))}
            </ol>
          )}
          <div className="tracking-details">
            <div><span>รอบจัดส่ง</span><strong>{order.deliveryDate || "รอข้อมูล"}</strong></div>
            <div><span>วิธีรับสินค้า</span><strong>{order.fulfilmentLabel}</strong></div>
            <div><span>เลขพัสดุ</span><strong>{order.trackingNumber ?? "ยังไม่มีเลขพัสดุ"}</strong></div>
          </div>
          <div className="tracking-items"><h3>รายการสินค้า</h3>{order.items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name} × {item.quantity}</span><strong>{item.lineTotal.toLocaleString("th-TH")} บาท</strong></div>)}<div className="tracking-total"><span>ยอดรวม</span><strong>{order.total.toLocaleString("th-TH")} บาท</strong></div></div>
          {order.paymentStatus === "paid" && (
            <section className="track-receipt" aria-labelledby={`receipt-${order.orderId}`}>
              <div className="receipt-mark" aria-hidden="true">✓</div><p className="eyebrow">ชำระเงินเรียบร้อย</p><h3 id={`receipt-${order.orderId}`}>ใบยืนยันการชำระเงิน</h3>
              <p>เลขออเดอร์ <strong>{order.orderId}</strong></p><div className="receipt-items">{order.items.map((item, index) => <p key={`${item.name}-receipt-${index}`}><span>{item.name} × {item.quantity}</span><strong>{item.lineTotal.toLocaleString("th-TH")} บาท</strong></p>)}</div>
              <p>ยอดชำระ <strong>{order.total.toLocaleString("th-TH")} บาท</strong></p><p>รอบจัดส่ง <strong>{order.deliveryDate}</strong></p>
              <div className="receipt-actions"><button type="button" onClick={() => { setReceiptError(null); void saveReceiptPng(order, storeName).catch((saveError: unknown) => setReceiptError(saveError instanceof Error ? saveError.message : "บันทึกรูปไม่สำเร็จ")); }}>บันทึกเป็นรูป PNG</button><button type="button" onClick={() => window.print()}>พิมพ์หรือบันทึก PDF</button></div>
              {receiptError && <p className="track-error" role="alert">{receiptError}</p>}
            </section>
          )}
        </div>
      )}
    </article>
  );
}

export function OrderTracker({ storeName, phonePrimary, phoneSecondary }: { storeName: string; phonePrimary: string; phoneSecondary: string }) {
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<PublicOrderTracking[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [visibleOrderCount, setVisibleOrderCount] = useState(INITIAL_VISIBLE_ORDERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const { draft } = useCheckoutDraft();
  const cartCount = Object.values(draft.quantities).reduce((a, b) => a + b, 0);

  const handleOpenCart = () => {
    window.location.href = "/?cart=open";
  };

  useEffect(() => {
    if (orders.length > 0) resultHeadingRef.current?.focus();
  }, [orders]);

  async function lookupOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOrders([]);
    setExpandedOrderId(null);
    setVisibleOrderCount(INITIAL_VISIBLE_ORDERS);
    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json().catch(() => null) as { orders?: PublicOrderTracking[]; error?: string } | null;
      if (!response.ok || !result?.orders?.length) {
        throw new CustomerFacingError(safeClientApiMessage(response.status, result, "TRACKING_UNAVAILABLE"));
      }
      setOrders(result.orders);
      setExpandedOrderId(result.orders[0].orderId);
    } catch (lookupError) {
      setError(
        lookupError instanceof CustomerFacingError
          ? lookupError.message
          : PUBLIC_ERROR_MESSAGES.TRACKING_UNAVAILABLE,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="track-page">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="ไปที่หน้าหลักร้านเจ๊น้อย">
          <span className="brand-mark">
            <Image src="/images/products/jae-noi-shop-logo.jpg" alt="" width={80} height={80} priority />
          </span>
          <span className="brand-name">เจ๊น้อย<br /><small>เขียงหมูตะคร้อ</small></span>
        </Link>
      </header>

      <section className="track-hero">
        <p className="eyebrow">ตรวจได้ด้วยตัวเองตลอดเวลา</p>
        <h1>ประวัติและสถานะออเดอร์</h1>
        <p>กรอกเบอร์โทรศัพท์ที่ใช้สั่งซื้อ เพื่อติดตามสถานะออเดอร์</p>
        <form className="track-form" onSubmit={lookupOrder}>
          <label>เบอร์โทรศัพท์<input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" autoComplete="tel" pattern="0[0-9]{8,9}" maxLength={10} placeholder="เช่น 0931687892" required /></label>
          <button type="submit" disabled={loading}>{loading ? "กำลังค้นหา..." : "ติดตามสถานะ"}</button>
        </form>
        {error && <p className="track-error" role="alert">{error}</p>}
      </section>

      {loading && <section className="tracking-skeleton" aria-live="polite" aria-label="กำลังโหลดสถานะออเดอร์"><span /><span /><span /><span /></section>}

      {orders.length > 0 && (
        <section className="track-history" aria-live="polite">
          <div className="track-history-heading"><div><p className="eyebrow">ย้อนหลัง 30 วัน</p><h2 ref={resultHeadingRef} tabIndex={-1}>พบ {orders.length} ออเดอร์</h2></div><span>{orders[0].maskedPhone}</span></div>
          <div className="track-history-list">
            {orders.slice(0, visibleOrderCount).map((order) => (
              <OrderHistoryCard
                key={order.orderId}
                order={order}
                storeName={storeName}
                expanded={expandedOrderId === order.orderId}
                onToggle={() => setExpandedOrderId((current) => current === order.orderId ? null : order.orderId)}
              />
            ))}
          </div>
          <div className="track-history-pagination" aria-live="polite">
            <p>แสดงแล้ว {Math.min(visibleOrderCount, orders.length)} จาก {orders.length} ออเดอร์</p>
            {visibleOrderCount < orders.length && (
              <button
                type="button"
                onClick={() => setVisibleOrderCount((current) => Math.min(current + ORDERS_PER_PAGE, orders.length))}
                aria-label={`แสดงออเดอร์เพิ่มเติม อีก ${Math.min(ORDERS_PER_PAGE, orders.length - visibleOrderCount)} รายการ`}
              >
                ดูออเดอร์เพิ่มเติม
                <span aria-hidden="true">↓</span>
              </button>
            )}
          </div>
        </section>
      )}

      <footer className="track-footer">
        <p>ต้องการความช่วยเหลือ โทรหาร้านได้ทันที</p>
        <div className="track-phone-links" aria-label="เบอร์โทรร้านเจ๊น้อย">
          <a href={`tel:${phonePrimary.replace(/[^\d+]/g, "")}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginRight: 6, display: "inline-block", verticalAlign: "middle" }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            <span style={{ verticalAlign: "middle" }}>{phonePrimary}</span>
          </a>
          <a href={`tel:${phoneSecondary.replace(/[^\d+]/g, "")}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginRight: 6, display: "inline-block", verticalAlign: "middle" }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            <span style={{ verticalAlign: "middle" }}>{phoneSecondary}</span>
          </a>
        </div>
      </footer>
      <BottomNav cartCount={cartCount} onOpenCart={handleOpenCart} activeTab="track" />
    </main>
  );
}
