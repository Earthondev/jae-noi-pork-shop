"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminOrder, OrderStatus, PaymentStatus } from "../../db/orders";

const statusLabels: Record<OrderStatus, string> = {
  received: "รับออเดอร์แล้ว",
  preparing: "กำลังเตรียม",
  ready_for_pickup: "พร้อมรับหน้าร้าน",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  waiting_for_payment: "รอชำระเงิน",
  waiting_for_slip_review: "รอตรวจสลิป",
  paid: "ชำระแล้ว",
  invalid_slip: "สลิปไม่ถูกต้อง",
  refunded: "คืนเงินแล้ว",
};

type AdminOrderUpdate = {
  orderStatus?: OrderStatus;
  paymentStatus?: PaymentStatus;
  trackingNumber?: string;
};

export function AdminDashboard({
  initialOrders,
  userName,
}: {
  initialOrders: AdminOrder[];
  userName: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>(
    Object.fromEntries(initialOrders.map((order) => [order.id, order.tracking_number ?? ""])),
  );
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword
      ? orders.filter((order) => `${order.id} ${order.customer_name} ${order.phone}`.toLowerCase().includes(keyword))
      : orders;
  }, [orders, query]);

  async function updateOrder(id: string, update: AdminOrderUpdate, successMessage: string) {
    const operation = `${id}:${Object.keys(update)[0] ?? "update"}`;
    setSaving(operation);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 401) {
        window.location.assign(`/admin/login?returnTo=${encodeURIComponent("/admin")}`);
        return;
      }
      if (!response.ok) {
        setNotice(result?.error ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่");
        return;
      }

      setOrders((current) => current.map((order) => order.id === id
        ? {
            ...order,
            order_status: update.orderStatus ?? order.order_status,
            payment_status: update.paymentStatus ?? order.payment_status,
            tracking_number: update.trackingNumber !== undefined
              ? update.trackingNumber.trim() || null
              : order.tracking_number,
          }
        : order));
      setNotice(successMessage);
    } catch {
      setNotice("เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setSaving(null);
    }
  }

  function changePaymentStatus(order: AdminOrder, paymentStatus: PaymentStatus) {
    if (
      paymentStatus === "paid" &&
      !window.confirm(`ยืนยันว่าเงินของออเดอร์ ${order.id} เข้าบัญชีจริงแล้ว?`)
    ) {
      return;
    }
    void updateOrder(
      order.id,
      { paymentStatus },
      `อัปเดตสถานะชำระเงิน ${order.id} แล้ว`,
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">เจ๊น้อย เขียงหมูตะคร้อ</p>
          <h1>จัดการออเดอร์</h1>
        </div>
        <div className="admin-user">
          <span>ผู้ใช้: {userName}</span>
          <Link href="/">กลับหน้าร้าน</Link>
          <form action="/api/admin/logout" method="post">
            <button className="admin-logout-button" type="submit">ออกจากระบบ</button>
          </form>
        </div>
      </header>

      <section className="admin-stats" aria-label="สรุปออเดอร์">
        <div><span>ออเดอร์ทั้งหมด</span><strong>{orders.length}</strong></div>
        <div><span>รอตรวจสลิป</span><strong>{orders.filter((order) => order.payment_status === "waiting_for_slip_review").length}</strong></div>
        <div><span>รอจัดส่ง</span><strong>{orders.filter((order) => order.payment_status === "paid" && ["received", "preparing"].includes(order.order_status)).length}</strong></div>
      </section>

      <p className="admin-save-notice" aria-live="polite" role="status">{notice}</p>
      <label className="admin-search">
        <span>ค้นหาออเดอร์</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="เลขออเดอร์ ชื่อ หรือเบอร์โทร"
          type="search"
          value={query}
        />
      </label>

      <section className="order-cards" aria-live="polite">
        {filtered.length === 0 ? (
          <p className="admin-empty">ยังไม่พบออเดอร์</p>
        ) : filtered.map((order) => {
          const paymentSaving = saving === `${order.id}:paymentStatus`;
          const orderSaving = saving === `${order.id}:orderStatus`;
          const trackingSaving = saving === `${order.id}:trackingNumber`;
          return (
            <article className="admin-order" key={order.id}>
              <div className="admin-order-top">
                <div>
                  <small>{new Date(order.created_at).toLocaleString("th-TH")}</small>
                  <h2>{order.id}</h2>
                </div>
                <div className="status-stack">
                  <span className={`status-pill payment-${order.payment_status}`}>{paymentStatusLabels[order.payment_status]}</span>
                  <span className={`status-pill status-${order.order_status}`}>{statusLabels[order.order_status]}</span>
                </div>
              </div>

              <div className="admin-order-grid">
                <div>
                  <span>ลูกค้า</span>
                  <strong>{order.customer_name}</strong>
                  <a href={`tel:${order.phone}`}>{order.phone}</a>
                </div>
                <div>
                  <span>สินค้า</span>
                  <strong>{order.items}</strong>
                  <small>ค่าสินค้า {order.subtotal} บาท · ค่าส่ง {order.shipping_fee ?? 0} บาท · รวม {order.total ?? order.subtotal} บาท</small>
                </div>
                <div className="full">
                  <span>{order.fulfilment === "pickup" ? "รับเองหน้าร้าน" : "ที่อยู่จัดส่ง"}</span>
                  <p>{order.address}</p>
                  {order.note && <small>หมายเหตุ: {order.note}</small>}
                  {order.admin_note && <small className="verification-note">ผลตรวจสลิป: {order.admin_note}</small>}
                </div>
              </div>

              <div className="admin-controls">
                <div className="admin-slip-control">
                  {order.slip_key ? (
                    <a className="slip-link" href={`/api/admin/slips/${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer">เปิดดูสลิป</a>
                  ) : (
                    <span className="no-slip">ยังไม่มีสลิป</span>
                  )}
                  <small>ตรวจยอดเงินในแอปธนาคารก่อนเลือก “ชำระแล้ว”</small>
                </div>
                <label>
                  <span>สถานะชำระเงิน</span>
                  <select
                    disabled={paymentSaving}
                    onChange={(event) => changePaymentStatus(order, event.target.value as PaymentStatus)}
                    value={order.payment_status}
                  >
                    {Object.entries(paymentStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>สถานะออเดอร์</span>
                  <select
                    disabled={orderSaving}
                    onChange={(event) => void updateOrder(
                      order.id,
                      { orderStatus: event.target.value as OrderStatus },
                      `อัปเดตสถานะออเดอร์ ${order.id} แล้ว`,
                    )}
                    value={order.order_status}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option
                        disabled={
                          (order.payment_status !== "paid" && !["received", "cancelled"].includes(value)) ||
                          (order.fulfilment === "pickup" && value === "shipped") ||
                          (order.fulfilment === "postal" && value === "ready_for_pickup")
                        }
                        key={value}
                        value={value}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                  {order.payment_status !== "paid" && <small>ยืนยันชำระเงินก่อนเริ่มเตรียมหรือจัดส่ง</small>}
                </label>
                {order.fulfilment === "postal" && (
                  <label className="admin-tracking-control">
                    <span>เลขพัสดุ</span>
                    <span>
                      <input
                        disabled={trackingSaving}
                        maxLength={100}
                        onChange={(event) => setTrackingDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
                        placeholder="กรอกหลังส่งสินค้า"
                        value={trackingDrafts[order.id] ?? ""}
                      />
                      <button
                        disabled={trackingSaving || order.payment_status !== "paid"}
                        onClick={() => void updateOrder(
                          order.id,
                          { trackingNumber: trackingDrafts[order.id] ?? "" },
                          `บันทึกเลขพัสดุ ${order.id} แล้ว`,
                        )}
                        type="button"
                      >
                        {trackingSaving ? "กำลังบันทึก…" : "บันทึก"}
                      </button>
                    </span>
                  </label>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
