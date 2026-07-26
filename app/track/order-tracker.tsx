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
import { fitFontSize } from "../../lib/qr-image";
import {
  browserRecentOrderStorage,
  clearRecentOrder,
  readRecentOrder,
} from "../../lib/recent-order";

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

async function saveReceiptPng(order: PublicOrderTracking, storeName: string): Promise<void> {
  await document.fonts.ready;
  const lines = receiptLines(order);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 850 + lines.length * 62;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("อุปกรณ์นี้ยังไม่รองรับการบันทึกรูป");

  // Text width is fit to the canvas before drawing — a long CMS-edited store
  // name or product name would otherwise silently run past the card edge
  // (the same bug class previously fixed for the PromptPay QR pill).
  const maxTextWidth = canvas.width - 78 * 2;

  context.fillStyle = "#fffaf0";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#b51519";
  context.fillRect(0, 0, canvas.width, 190);
  context.fillStyle = "#f4bd24";
  context.fillRect(0, 190, canvas.width, 12);
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  const storeNameSize = fitFontSize(context, storeName, canvas.width - 120, 700, 52, 28);
  context.font = `700 ${storeNameSize}px "Noto Sans Thai", sans-serif`;
  context.fillText(storeName, canvas.width / 2, 86);
  context.font = "500 30px 'Noto Sans Thai', sans-serif";
  context.fillText("ใบยืนยันการชำระเงิน", canvas.width / 2, 145);

  context.textAlign = "left";
  context.fillStyle = "#281616";
  const orderIdLine = `เลขออเดอร์  ${order.orderId}`;
  const orderIdSize = fitFontSize(context, orderIdLine, maxTextWidth, 700, 34, 20);
  context.font = `700 ${orderIdSize}px "Noto Sans Thai", sans-serif`;
  context.fillText(orderIdLine, 78, 275);
  context.fillStyle = "#237343";
  context.font = "700 34px 'Noto Sans Thai', sans-serif";
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
  lines.forEach((line, index) => {
    const lineSize = fitFontSize(context, line, maxTextWidth, 500, 27, 16);
    context.font = `500 ${lineSize}px "Noto Sans Thai", sans-serif`;
    context.fillText(line, 78, 585 + index * 62);
  });

  const totalY = 640 + lines.length * 62;
  context.strokeStyle = "#ead6b5";
  context.beginPath();
  context.moveTo(78, totalY);
  context.lineTo(1002, totalY);
  context.stroke();
  context.fillStyle = "#8d1014";
  const totalLine = `ยอดชำระทั้งหมด  ${order.total.toLocaleString("th-TH")} บาท`;
  const totalSize = fitFontSize(context, totalLine, maxTextWidth, 800, 40, 24);
  context.font = `800 ${totalSize}px "Noto Sans Thai", sans-serif`;
  context.fillText(totalLine, 78, totalY + 70);
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

function OrderHistoryCard({ order, expanded, onToggle, storeName, phoneLast4, onConfirmed }: { order: PublicOrderTracking; expanded: boolean; onToggle: () => void; storeName: string; phoneLast4: string; onConfirmed: (orderId: string) => void }) {
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const currentStep = trackingStepIndex(order.orderStatus, order.fulfilment);
  const steps = order.fulfilment === "pickup"
    ? ["รับออเดอร์แล้ว", "กำลังเตรียม", "พร้อมรับหน้าร้าน", "สำเร็จ"]
    : ["รับออเดอร์แล้ว", "กำลังเตรียม", "จัดส่งแล้ว", "สำเร็จ"];
  const canConfirmReceived = order.orderStatus === "shipped" || order.orderStatus === "ready_for_pickup";

  async function handleConfirmReceived() {
    setConfirming(true);
    setConfirmError(null);
    try {
      const response = await fetch("/api/orders/track/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneLast4, orderId: order.orderId }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "TRACKING_UNAVAILABLE"));
      onConfirmed(order.orderId);
    } catch (confirmActionError) {
      setConfirmError(confirmActionError instanceof CustomerFacingError ? confirmActionError.message : PUBLIC_ERROR_MESSAGES.TRACKING_UNAVAILABLE);
    } finally {
      setConfirming(false);
    }
  }

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
          {canConfirmReceived && (
            <div className="track-confirm-received">
              <button type="button" onClick={() => void handleConfirmReceived()} disabled={confirming}>
                {confirming ? "กำลังยืนยัน..." : "ยืนยันว่าได้รับสินค้าแล้ว"}
              </button>
              {confirmError && <p className="track-error" role="alert">{confirmError}</p>}
            </div>
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

export function OrderTracker({ storeName, phonePrimary, phoneSecondary, initialOrderId }: { storeName: string; phonePrimary: string; phoneSecondary: string; initialOrderId: string }) {
  const [orderId, setOrderId] = useState(initialOrderId);
  const [restoredRecentOrder, setRestoredRecentOrder] = useState(false);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [orders, setOrders] = useState<PublicOrderTracking[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
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

  useEffect(() => {
    if (initialOrderId) return;
    const timeout = window.setTimeout(() => {
      const recentOrder = readRecentOrder(browserRecentOrderStorage());
      if (!recentOrder) return;
      setOrderId(recentOrder.orderId);
      setRestoredRecentOrder(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [initialOrderId]);

  function forgetRecentOrder() {
    clearRecentOrder(browserRecentOrderStorage());
    setOrderId("");
    setRestoredRecentOrder(false);
  }

  function handleOrderConfirmed(orderId: string) {
    setOrders((current) => current.map((order) => order.orderId === orderId ? { ...order, orderStatus: "completed" } : order));
  }

  async function lookupOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOrders([]);
    setExpandedOrderId(null);
    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, phoneLast4 }),
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
        <h1>ติดตามสถานะออเดอร์</h1>
        <p>ใช้เลขออเดอร์และเบอร์โทร 4 ตัวท้าย เพื่อปกป้องข้อมูลการสั่งซื้อของคุณ</p>
        <form className="track-form" onSubmit={lookupOrder}>
          <label>
            เลขออเดอร์
            <input value={orderId} onChange={(event) => { setOrderId(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 22)); setRestoredRecentOrder(false); }} autoComplete="off" pattern="JN-[0-9]{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}" maxLength={22} placeholder="เช่น JN-20260726-7G4K2P9ABC" required />
            {restoredRecentOrder && (
              <span className="recent-order-hint" role="status">
                เติมเลขออเดอร์ล่าสุดจากอุปกรณ์นี้แล้ว
                <button type="button" onClick={forgetRecentOrder}>ลบเลขที่จำไว้</button>
              </span>
            )}
          </label>
          <label>เบอร์โทร 4 ตัวท้าย<input value={phoneLast4} onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="tel" pattern="[0-9]{4}" maxLength={4} placeholder="เช่น 7892" required /></label>
          <button type="submit" disabled={loading}>{loading ? "กำลังค้นหา..." : "ติดตามสถานะ"}</button>
        </form>
        {error && <p className="track-error" role="alert">{error}</p>}
      </section>

      {loading && <section className="tracking-skeleton" aria-live="polite" aria-label="กำลังโหลดสถานะออเดอร์"><span /><span /><span /><span /></section>}

      {orders.length > 0 && (
        <section className="track-history" aria-live="polite">
          <div className="track-history-heading"><div><p className="eyebrow">ข้อมูลส่วนตัวได้รับการปกป้อง</p><h2 ref={resultHeadingRef} tabIndex={-1}>พบออเดอร์</h2></div><span>{orders[0].maskedPhone}</span></div>
          <div className="track-history-list">
            {orders.map((order) => (
              <OrderHistoryCard
                key={order.orderId}
                order={order}
                storeName={storeName}
                phoneLast4={phoneLast4}
                onConfirmed={handleOrderConfirmed}
                expanded={expandedOrderId === order.orderId}
                onToggle={() => setExpandedOrderId((current) => current === order.orderId ? null : order.orderId)}
              />
            ))}
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
