"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminOrder, OrderStatus } from "../../db/orders";

const statusLabels: Record<OrderStatus, string> = {
  waiting_for_payment_info: "รอข้อมูลชำระเงิน",
  waiting_for_slip_review: "รอตรวจสลิป",
  paid: "ชำระแล้ว",
  preparing: "กำลังเตรียมสินค้า",
  shipped: "จัดส่งแล้ว",
  cancelled: "ยกเลิก",
};

export function AdminDashboard({ initialOrders, userName }: { initialOrders: AdminOrder[]; userName: string }) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? orders.filter((order) => `${order.id} ${order.customer_name} ${order.phone}`.toLowerCase().includes(keyword)) : orders;
  }, [orders, query]);

  async function changeStatus(id: string, status: OrderStatus) {
    setSaving(id);
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    setSaving(null);
  }

  return (
    <main className="admin-shell">
      <header className="admin-header"><div><p className="eyebrow">เจ้น้อย เขียงหมูตะคร้อ</p><h1>จัดการออเดอร์</h1></div><div className="admin-user"><span>{userName}</span><Link href="/">กลับหน้าร้าน</Link></div></header>
      <section className="admin-stats" aria-label="สรุปออเดอร์"><div><span>ออเดอร์ทั้งหมด</span><strong>{orders.length}</strong></div><div><span>รอตรวจสลิป</span><strong>{orders.filter((order) => order.status === "waiting_for_slip_review").length}</strong></div><div><span>รอจัดส่ง</span><strong>{orders.filter((order) => ["paid", "preparing"].includes(order.status)).length}</strong></div></section>
      <label className="admin-search"><span>ค้นหาออเดอร์</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="เลขออเดอร์ ชื่อ หรือเบอร์โทร" type="search" /></label>
      <section className="order-cards" aria-live="polite">
        {filtered.length === 0 ? <p className="admin-empty">ยังไม่พบออเดอร์</p> : filtered.map((order) => (
          <article className="admin-order" key={order.id}>
            <div className="admin-order-top"><div><small>{new Date(order.created_at).toLocaleString("th-TH")}</small><h2>{order.id}</h2></div><span className={`status-pill status-${order.status}`}>{statusLabels[order.status]}</span></div>
            <div className="admin-order-grid"><div><span>ลูกค้า</span><strong>{order.customer_name}</strong><a href={`tel:${order.phone}`}>{order.phone}</a></div><div><span>สินค้า</span><strong>{order.items}</strong><small>ค่าสินค้า {order.subtotal} บาท · ค่าส่งรอข้อมูล</small></div><div className="full"><span>ที่อยู่</span><p>{order.address}</p>{order.note && <small>หมายเหตุ: {order.note}</small>}</div></div>
            <div className="admin-actions">{order.slip_key ? <a className="slip-link" href={`/api/admin/slips/${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer">เปิดดูสลิป</a> : <span className="no-slip">ยังไม่มีสลิป</span>}<label><span>สถานะ</span><select value={order.status} disabled={saving === order.id} onChange={(event) => changeStatus(order.id, event.target.value as OrderStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
          </article>
        ))}
      </section>
    </main>
  );
}
