"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminOrder, OrderStatus, PaymentStatus } from "../../db/orders";
import {
  PRODUCT_STATUSES,
  ROUND_STATUSES,
  type AdminCmsData,
  type AdminProduct,
  type AdminRound,
  type AdminStorefrontSettings,
  type ProductInput,
  type RoundInput,
} from "../../lib/admin-cms";
import { CustomerFacingError, PUBLIC_ERROR_MESSAGES, safeClientApiMessage } from "../../lib/public-errors";
import { ConfirmDialog } from "./confirm-dialog";
import { AdminIcon, type AdminIconName } from "./icons";

type AdminTab = "orders" | "rounds" | "products" | "storefront";
type OrderRange = "today" | "7days" | "all";
type OrderFilter = "all" | "attention" | "pending_slip" | "paid" | "shipped";
type Mutation = (action: string, payload: Record<string, unknown>, successMessage: string) => Promise<boolean | void>;
type ConfirmState = { title: string; description: string; confirmLabel: string; tone?: "danger" | "primary"; action: () => Promise<void> } | null;

const statusLabels: Record<OrderStatus, string> = {
  received: "รับออเดอร์แล้ว", preparing: "กำลังเตรียม", ready_for_pickup: "พร้อมรับหน้าร้าน",
  shipped: "จัดส่งแล้ว", completed: "สำเร็จ", cancelled: "ยกเลิก",
};
const paymentStatusLabels: Record<PaymentStatus, string> = {
  waiting_for_payment: "รอชำระเงิน", waiting_for_slip_review: "รอตรวจสลิป", paid: "ชำระแล้ว",
  invalid_slip: "สลิปไม่ถูกต้อง", refunded: "คืนเงินแล้ว",
};
const tabs: Array<{ id: AdminTab; icon: AdminIconName; label: string }> = [
  { id: "orders", icon: "orders", label: "ออเดอร์" },
  { id: "rounds", icon: "calendar", label: "รอบขาย" },
  { id: "products", icon: "products", label: "สินค้า" },
  { id: "storefront", icon: "store", label: "หน้าร้าน" },
];

export function AdminDashboard({ initialOrders, initialCms, userName, serverNow, serverClockLabel, initialTab }: { initialOrders: AdminOrder[]; initialCms: AdminCmsData; userName: string; serverNow: string; serverClockLabel: string; initialTab: AdminTab }) {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [orders, setOrders] = useState(initialOrders);
  const [cms, setCms] = useState(initialCms);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState({ iso: serverNow, label: serverClockLabel });
  const pendingCount = orders.filter((order) => order.payment_status === "waiting_for_slip_review" || order.payment_status === "invalid_slip").length;
  const storeIsOpen = cms.rounds.some((round) => round.status === "เปิดรับ" && round.displayState === "แสดงใน dropdown");

  useEffect(() => {
    const updateClock = () => {
      const next = new Date();
      setClock({ iso: next.toISOString(), label: formatBangkokHeader(next) });
    };
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncTabFromUrl = () => setActiveTab(adminTabFromUrl());
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);

  function changeTab(tab: AdminTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }

  async function refreshCms() {
    const response = await fetch("/api/admin/cms", { cache: "no-store" });
    if (response.status === 401) return redirectToLogin();
    const result = await response.json() as AdminCmsData & { error?: string };
    if (!response.ok) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE"));
    setCms(result);
  }

  async function mutate(action: string, payload: Record<string, unknown>, successMessage: string) {
    setSaving(action); setNotice("");
    try {
      const response = await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      if (response.status === 401) return redirectToLogin();
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 409) {
        await refreshCms();
        setNotice("ข้อมูลล่าสุดถูกโหลดให้แล้ว กรุณากดบันทึกอีกครั้ง โดยไม่ต้องรีโหลดหน้า");
        return false;
      }
      if (!response.ok) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE"));
      await refreshCms(); setNotice(successMessage); return true;
    } catch (error) {
      setNotice(error instanceof CustomerFacingError ? error.message : PUBLIC_ERROR_MESSAGES.ADMIN_UNAVAILABLE); return false;
    } finally { setSaving(null); }
  }

  return <main className="admin-shell">
    <header className="admin-ops-header">
      <div className="admin-brand-lockup">
        <span className="admin-brand-logo"><Image src={adminImageSrc(cms.settings.storeLogoUrl) || "/images/products/jae-noi-shop-logo.jpg"} alt="" fill sizes="48px" unoptimized /></span>
        <div><p>{cms.settings.storeName}</p><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1></div>
      </div>
      <div className="admin-header-meta">
        <time dateTime={clock.iso}>{clock.label}</time>
        <span className={`admin-store-state ${storeIsOpen ? "open" : "closed"}`}><i aria-hidden="true" />{storeIsOpen ? "หน้าร้านเปิดรับ" : "หน้าร้านปิดรับ"}</span>
      </div>
      <div className="admin-account-row">
        <span title={userName}>{userName}</span>
        <Link href="/" target="_blank"><AdminIcon name="external" />ดูหน้าร้าน</Link>
        <form action="/api/admin/logout" method="post"><button type="submit" aria-label="ออกจากระบบ"><AdminIcon name="logout" /><span>ออก</span></button></form>
      </div>
    </header>

    <p className={`admin-save-notice${notice ? " has-message" : ""}`} aria-live="polite" role="status">{notice}</p>
    {activeTab === "orders" && <OrdersPanel orders={orders} setOrders={setOrders} saving={saving} setSaving={setSaving} setNotice={setNotice} />}
    {activeTab === "rounds" && <RoundsPanel rounds={cms.rounds} saving={saving} mutate={mutate} />}
    {activeTab === "products" && <ProductsPanel products={cms.products} saving={saving} mutate={mutate} setNotice={setNotice} />}
    {activeTab === "storefront" && <StorefrontPanel key={cms.settings.fingerprint} settings={cms.settings} saving={saving} mutate={mutate} setNotice={setNotice} />}

    <nav className="admin-bottom-nav" aria-label="เมนูหลังบ้าน">
      {tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => changeTab(tab.id)}>
        <span className="admin-nav-icon"><AdminIcon name={tab.icon} />{tab.id === "orders" && pendingCount > 0 && <b aria-label={`${pendingCount} รายการที่ต้องตรวจ`}>{pendingCount > 99 ? "99+" : pendingCount}</b>}</span><strong>{tab.label}</strong>
      </button>)}
    </nav>
  </main>;
}

function OrdersPanel({ orders, setOrders, saving, setSaving, setNotice }: { orders: AdminOrder[]; setOrders: React.Dispatch<React.SetStateAction<AdminOrder[]>>; saving: string | null; setSaving: (value: string | null) => void; setNotice: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<OrderRange>("today");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>(() => Object.fromEntries(orders.map((order) => [order.id, order.tracking_number ?? ""])));
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const filtered = useMemo(() => orders.filter((order) => {
    const normalized = query.trim().toLowerCase();
    const matchesQuery = !normalized || `${order.id} ${order.customer_name} ${order.phone}`.toLowerCase().includes(normalized);
    const matchesRange = inOrderRange(order.created_at, range);
    const matchesFilter = filter === "all"
      || (filter === "attention" && ["waiting_for_slip_review", "invalid_slip"].includes(order.payment_status))
      || (filter === "pending_slip" && order.payment_status === "waiting_for_slip_review")
      || (filter === "paid" && order.payment_status === "paid")
      || (filter === "shipped" && ["shipped", "completed"].includes(order.order_status));
    return matchesQuery && matchesRange && matchesFilter;
  }), [filter, orders, query, range]);

  const summary = useMemo(() => ({
    total: filtered.length,
    paidSales: filtered.filter((order) => order.payment_status === "paid" && order.order_status !== "cancelled").reduce((sum, order) => sum + (order.total ?? 0), 0),
    pending: filtered.filter((order) => order.payment_status === "waiting_for_slip_review").length,
    preparing: filtered.filter((order) => order.order_status === "preparing").length,
  }), [filtered]);
  const byRound = useMemo(() => Array.from(filtered.reduce((map, order) => {
    const key = order.round_id || "ไม่ระบุรอบ";
    const current = map.get(key) ?? { count: 0, sales: 0 };
    current.count += 1; current.sales += order.total ?? 0; map.set(key, current); return map;
  }, new Map<string, { count: number; sales: number }>()).entries()), [filtered]);

  async function updateOrder(id: string, patch: { orderStatus?: OrderStatus; paymentStatus?: PaymentStatus; trackingNumber?: string }, success: string) {
    setSaving(`order:${id}`); setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (response.status === 401) return redirectToLogin();
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE"));
      setOrders((current) => current.map((order) => order.id === id ? { ...order, ...(patch.orderStatus ? { order_status: patch.orderStatus } : {}), ...(patch.paymentStatus ? { payment_status: patch.paymentStatus } : {}), ...(patch.trackingNumber !== undefined ? { tracking_number: patch.trackingNumber || null } : {}) } : order));
      setNotice(success);
    } catch (error) { setNotice(error instanceof CustomerFacingError ? error.message : PUBLIC_ERROR_MESSAGES.ADMIN_UNAVAILABLE); }
    finally { setSaving(null); }
  }

  function requestPaid(order: AdminOrder) {
    setConfirm({ title: "ยืนยันว่าเงินเข้าแล้ว", description: `ตรวจยอด ${formatMoney(order.total)} ของออเดอร์ ${order.id} ในแอปธนาคารแล้วใช่ไหม?`, confirmLabel: "ยืนยันชำระแล้ว", action: async () => { await updateOrder(order.id, { paymentStatus: "paid" }, `ยืนยันการชำระเงิน ${order.id} แล้ว`); } });
  }

  return <section className="admin-panel admin-orders-panel">
    <div className="admin-section-heading"><div><p className="eyebrow">จัดการงานประจำวัน</p><h2>ออเดอร์</h2></div><span className="admin-result-count">{filtered.length} รายการ</span></div>
    <div className="admin-filter-stack">
      <div className="admin-segmented" aria-label="ช่วงเวลา">{(["today", "7days", "all"] as OrderRange[]).map((value) => <button key={value} type="button" className={range === value ? "active" : ""} onClick={() => setRange(value)}>{value === "today" ? "วันนี้" : value === "7days" ? "7 วัน" : "ทั้งหมด"}</button>)}</div>
      <label className="admin-search"><span className="sr-only">ค้นหาออเดอร์</span><AdminIcon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเลขออเดอร์ ชื่อ หรือเบอร์โทร" /></label>
      <div className="admin-filter-chips" aria-label="กรองสถานะ">{(["all", "attention", "pending_slip", "paid", "shipped"] as OrderFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{({ all: "ทุกสถานะ", attention: "ต้องตรวจ", pending_slip: "รอตรวจสลิป", paid: "ชำระแล้ว", shipped: "ส่งแล้ว" } as const)[value]}</button>)}</div>
    </div>
    <div className="admin-kpi-grid">
      <Kpi icon="orders" label="ออเดอร์" value={String(summary.total)} />
      <Kpi icon="money" label="ยอดชำระแล้ว" value={formatMoney(summary.paidSales)} />
      <Kpi icon="clock" label="รอตรวจสลิป" value={String(summary.pending)} accent={summary.pending > 0} />
      <Kpi icon="products" label="กำลังเตรียม" value={String(summary.preparing)} />
    </div>
    {byRound.length > 0 && <div className="admin-round-summary"><h3>ยอดตามรอบจัดส่ง</h3><div>{byRound.map(([roundId, data]) => <span key={roundId}><b>{roundId}</b><small>{data.count} ออเดอร์ · {formatMoney(data.sales)}</small></span>)}</div></div>}
    <div className="order-cards">
      {filtered.length === 0 && <div className="admin-empty"><AdminIcon name="orders" /><h3>ยังไม่พบออเดอร์</h3><p>ลองเปลี่ยนช่วงเวลา ตัวกรอง หรือคำค้นหา</p></div>}
      {filtered.map((order) => {
        const isExpanded = expanded.has(order.id);
        return <article className={`admin-order admin-order-compact${isExpanded ? " expanded" : ""}`} key={order.id}>
          <button className="admin-order-summary" type="button" aria-expanded={isExpanded} onClick={() => setExpanded((current) => toggleSet(current, order.id))}>
            <span><small>{safeThaiDateTime(order.created_at)} · {order.round_id || "ไม่ระบุรอบ"}</small><strong>{order.id}</strong><em>{order.customer_name} · {formatMoney(order.total)}</em></span>
            <span className="status-stack"><i className={`status-pill payment-${order.payment_status}`}>{paymentStatusLabels[order.payment_status]}</i><i className={`status-pill status-${order.order_status}`}>{statusLabels[order.order_status]}</i><AdminIcon name="chevron" /></span>
          </button>
          {isExpanded && <div className="admin-order-details">
            <div className="admin-order-grid"><div><span>ลูกค้า</span><p>{order.customer_name}</p><a href={`tel:${phoneHref(order.phone)}`}><AdminIcon name="phone" />{order.phone}</a></div><div><span>รายการ</span><p>{order.items || "—"}</p><strong>{formatMoney(order.total)}</strong></div><div className="full"><span>{order.fulfilment === "pickup" ? "รับเองหน้าร้าน" : "ที่อยู่จัดส่ง"}</span><p>{order.address}</p>{order.note && <small>หมายเหตุ: {order.note}</small>}{order.admin_note && <small className="verification-note">ผลตรวจสลิป: {order.admin_note}</small>}</div></div>
            <div className="admin-controls">
              <div className="admin-slip-control">{order.slip_key ? <a className="slip-link" href={`/api/admin/slips/${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer"><AdminIcon name="image" />เปิดดูสลิป</a> : <span className="no-slip">ยังไม่มีสลิป</span>}<small>ตรวจเงินเข้าในแอปธนาคารก่อนกดยืนยัน</small></div>
              <label><span>สถานะชำระเงิน</span><select disabled={saving === `order:${order.id}`} value={order.payment_status} onChange={(event) => { const value = event.target.value as PaymentStatus; if (value === "paid") requestPaid(order); else void updateOrder(order.id, { paymentStatus: value }, `อัปเดตการชำระเงิน ${order.id} แล้ว`); }}>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>สถานะออเดอร์</span><select disabled={saving === `order:${order.id}`} value={order.order_status} onChange={(event) => void updateOrder(order.id, { orderStatus: event.target.value as OrderStatus }, `อัปเดตออเดอร์ ${order.id} แล้ว`)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value} disabled={(order.payment_status !== "paid" && !["received", "cancelled"].includes(value)) || (order.fulfilment === "pickup" && value === "shipped") || (order.fulfilment === "postal" && value === "ready_for_pickup")}>{label}</option>)}</select></label>
              {order.fulfilment === "postal" && <label className="admin-tracking-control"><span>เลขพัสดุ</span><span><input maxLength={100} value={trackingDrafts[order.id] ?? ""} onChange={(event) => setTrackingDrafts((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="กรอกหลังส่งสินค้า" /><button type="button" disabled={saving === `order:${order.id}` || order.payment_status !== "paid"} onClick={() => void updateOrder(order.id, { trackingNumber: trackingDrafts[order.id] ?? "" }, `บันทึกเลขพัสดุ ${order.id} แล้ว`)}>บันทึก</button></span></label>}
            </div>
          </div>}
        </article>;
      })}
    </div>
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
  </section>;
}

function RoundsPanel({ rounds, saving, mutate }: { rounds: AdminRound[]; saving: string | null; mutate: Mutation }) {
  const blank: RoundInput = { deliveryDate: "", opensAt: "", closesAt: "", status: "เตรียมเปิด", note: "" };
  const [creating, setCreating] = useState(false); const [draft, setDraft] = useState<RoundInput>(blank); const [editing, setEditing] = useState<string | null>(null); const [confirm, setConfirm] = useState<ConfirmState>(null);
  const sorted = useMemo(() => [...rounds].sort((a, b) => roundPriority(a) - roundPriority(b) || a.deliveryDate.localeCompare(b.deliveryDate)), [rounds]);
  return <section className="admin-panel">
    <div className="admin-section-heading"><div><p className="eyebrow">กำหนดวันเปิดและปิดตะกร้า</p><h2>รอบขาย</h2></div><button className="admin-primary-button" type="button" onClick={() => { setCreating((value) => !value); setEditing(null); setDraft(blank); }}><AdminIcon name="plus" />เพิ่มรอบ</button></div>
    {creating && <RoundForm title="เพิ่มรอบใหม่" value={draft} disabled={saving !== null} onChange={setDraft} onCancel={() => setCreating(false)} onSubmit={async () => { if (await mutate("round.create", { round: draft }, "เพิ่มรอบขายแล้ว")) { setDraft(blank); setCreating(false); } }} />}
    <div className="admin-card-list admin-round-list">{sorted.map((round) => editing === round.id ? <RoundForm key={round.id} title={`แก้ไข ${round.id}`} value={draft} disabled={saving !== null} lockDeliveryDate onChange={setDraft} onCancel={() => setEditing(null)} onSubmit={async () => { if (await mutate("round.update", { id: round.id, round: draft }, "บันทึกรอบขายแล้ว")) setEditing(null); }} /> : <article className={`admin-cms-card admin-round-card priority-${roundPriority(round)}`} key={round.id}>
      <div className="admin-card-top"><div><span className={`cms-status status-${round.status === "เปิดรับ" ? "open" : "muted"}`}>{round.status}</span><h3>{round.label || round.id}</h3><small>{round.displayState}</small></div><button type="button" onClick={() => { setDraft(round); setEditing(round.id); setCreating(false); }}><AdminIcon name="edit" />แก้ไข</button></div>
      <div className="admin-round-sales"><span>ยอดขายรอบนี้</span><strong>{formatMoney(round.sales)}</strong></div>
      <dl className="admin-mini-stats"><div><dt>เปิดรับ</dt><dd>{formatInputDateTime(round.opensAt)}</dd></div><div><dt>ปิดรับ</dt><dd>{formatInputDateTime(round.closesAt)}</dd></div><div><dt>ออเดอร์</dt><dd>{round.orderCount}</dd></div><div><dt>ยอดเฉลี่ย</dt><dd>{formatMoney(round.orderCount ? round.sales / round.orderCount : 0)}</dd></div></dl>
      {round.note && <p>{round.note}</p>}
      {round.status === "เตรียมเปิด" && <button className="admin-open-round" type="button" disabled={saving !== null} onClick={() => void mutate("round.update", { id: round.id, round: { ...round, status: "เปิดรับ" } }, "เปิดรอบขายแล้ว")}>เปิดรอบขาย</button>}
      {round.status === "เปิดรับ" && <button className="admin-close-round" type="button" onClick={() => setConfirm({ title: "ปิดรอบขายนี้?", description: `${round.label || round.id} จะหยุดรับออเดอร์ใหม่ทันที แต่ออเดอร์เดิมยังอยู่ครบ`, confirmLabel: "ปิดรอบขาย", tone: "danger", action: async () => { await mutate("round.update", { id: round.id, round: { ...round, status: "ปิดรับ" } }, "ปิดรอบขายแล้ว"); } })}>ปิดรอบขาย</button>}
    </article>)}</div>
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
  </section>;
}

function RoundForm({ title, value, disabled, lockDeliveryDate = false, onChange, onCancel, onSubmit }: { title: string; value: RoundInput; disabled: boolean; lockDeliveryDate?: boolean; onChange: (value: RoundInput) => void; onCancel: () => void; onSubmit: () => void }) {
  return <form className="admin-edit-card" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h3>{title}</h3><div className="admin-form-grid"><label><span>วันจัดส่ง</span><input required type="date" disabled={disabled || lockDeliveryDate} value={value.deliveryDate} onChange={(event) => onChange({ ...value, deliveryDate: event.target.value })} /></label><label><span>เปิดรับตั้งแต่</span><input required type="datetime-local" disabled={disabled} value={value.opensAt} onChange={(event) => onChange({ ...value, opensAt: event.target.value })} /></label><label><span>ปิดรับวันที่</span><input required type="datetime-local" disabled={disabled} value={value.closesAt} onChange={(event) => onChange({ ...value, closesAt: event.target.value })} /></label><label><span>สถานะ</span><select disabled={disabled} value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as RoundInput["status"] })}>{ROUND_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label className="full"><span>หมายเหตุ</span><textarea rows={3} maxLength={500} value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} /></label></div><FormActions disabled={disabled} onCancel={onCancel} /></form>;
}

function ProductsPanel({ products, saving, mutate, setNotice }: { products: AdminProduct[]; saving: string | null; mutate: Mutation; setNotice: (value: string) => void }) {
  const blank: ProductInput = { id: "", name: "", unit: "", detail: "", price: null, status: "รอข้อมูล", imageUrl: "", category: "" };
  const [draft, setDraft] = useState<ProductInput>(blank); const [editing, setEditing] = useState<string | null>(null); const [creating, setCreating] = useState(false); const [uploading, setUploading] = useState(false); const [category, setCategory] = useState("ทั้งหมด"); const [view, setView] = useState<"list" | "grid">("list"); const [confirm, setConfirm] = useState<ConfirmState>(null);
  const categories = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(products.map((product) => product.category || "อื่น ๆ")))], [products]);
  const visible = category === "ทั้งหมด" ? products : products.filter((product) => (product.category || "อื่น ๆ") === category);
  async function uploadImage(file: File) {
    setUploading(true); setNotice("");
    try { const form = new FormData(); form.set("image", file); form.set("productId", draft.id || "PRODUCT"); const response = await fetch("/api/admin/product-image", { method: "POST", body: form }); if (response.status === 401) return redirectToLogin(); const result = await response.json() as { imageUrl?: string; error?: string }; if (!response.ok || !result.imageUrl) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE")); setDraft((current) => ({ ...current, imageUrl: result.imageUrl ?? current.imageUrl })); setNotice("อัปโหลดรูปแล้ว กดบันทึกสินค้าเพื่อใช้งาน"); }
    catch (error) { setNotice(error instanceof CustomerFacingError ? error.message : PUBLIC_ERROR_MESSAGES.ADMIN_UNAVAILABLE); } finally { setUploading(false); }
  }
  return <section className="admin-panel">
    <div className="admin-section-heading"><div><p className="eyebrow">แก้ไขแล้วแสดงบนเว็บจริง</p><h2>สินค้า</h2></div><button className="admin-primary-button" type="button" onClick={() => { setDraft(blank); setCreating((value) => !value); setEditing(null); }}><AdminIcon name="plus" />เพิ่มสินค้า</button></div>
    <div className="admin-product-toolbar">
      <div className="admin-category-chips-row">
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            className={`admin-category-chip-btn ${category === value ? "active" : ""}`}
            onClick={() => setCategory(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="admin-view-toggle" aria-label="รูปแบบแสดงสินค้า">
        <button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")} aria-label="แบบรายการ"><AdminIcon name="list" /></button>
        <button className={view === "grid" ? "active" : ""} type="button" onClick={() => setView("grid")} aria-label="แบบตาราง"><AdminIcon name="grid" /></button>
      </div>
    </div>
    {creating && <ProductForm title="เพิ่มสินค้าใหม่" value={draft} disabled={saving !== null || uploading} uploading={uploading} onChange={setDraft} onUpload={uploadImage} onCancel={() => setCreating(false)} onSubmit={async () => { if (await mutate("product.create", { product: draft }, "เพิ่มสินค้าแล้ว")) { setDraft(blank); setCreating(false); } }} />}
    <div className={`admin-card-list admin-product-list view-${view}`}>{visible.map((product) => {
      const index = products.findIndex((item) => item.id === product.id);
      if (editing === product.id) return <ProductForm key={product.id} title={`แก้ไข ${product.name}`} value={draft} disabled={saving !== null || uploading} uploading={uploading} lockId onChange={setDraft} onUpload={uploadImage} onCancel={() => setEditing(null)} onSubmit={async () => { if (await mutate("product.update", { product: draft }, "บันทึกสินค้าแล้ว")) setEditing(null); }} />;
      return <article className={`admin-product-card ${product.status === "ซ่อนสินค้า" ? "is-archived" : ""}`} key={product.id}>
        <div className="product-card-body">
          <div className="product-card-image-wrap">
            {product.imageUrl ? <Image src={adminImageSrc(product.imageUrl)} alt="" fill sizes="96px" unoptimized /> : <div className="product-card-no-image"><AdminIcon name="image" /></div>}
          </div>
          <div className="product-card-info">
            <div className="product-card-title-row">
              <span className="product-card-category">{product.category || "อื่น ๆ"}</span>
              <h3>{product.name}</h3>
            </div>
            <p className="product-card-meta">{product.unit} • {product.price === null ? "รอราคา" : `${product.price.toLocaleString("th-TH")} บาท`}</p>
            {product.detail && <p className="product-card-desc">{product.detail}</p>}
            
            <div className="product-card-footer">
              <span className={`product-card-status status-${product.status === "เปิดขาย" ? "open" : "muted"}`}>
                {product.status}
              </span>
              
              <div className="product-card-actions">
                <button type="button" className="action-btn order-move-btn" disabled={index === 0 || saving !== null} aria-label={`เลื่อน ${product.name} ขึ้น`} onClick={() => void mutate("product.move", { id: product.id, direction: "up", fingerprint: product.fingerprint }, "เรียงสินค้าแล้ว")}><AdminIcon name="up" /></button>
                <button type="button" className="action-btn order-move-btn" disabled={index === products.length - 1 || saving !== null} aria-label={`เลื่อน ${product.name} ลง`} onClick={() => void mutate("product.move", { id: product.id, direction: "down", fingerprint: product.fingerprint }, "เรียงสินค้าแล้ว")}><AdminIcon name="down" /></button>
                <button type="button" className="action-btn edit-btn" onClick={() => { setDraft(product); setEditing(product.id); setCreating(false); }}><AdminIcon name="edit" /><span>แก้ไข</span></button>
                {product.status !== "ซ่อนสินค้า" ? (
                  <button className="action-btn delete-btn" type="button" onClick={() => setConfirm({ title: `ซ่อน ${product.name}?`, description: "สินค้าจะหายจากหน้าร้าน แต่ประวัติออเดอร์เก่าจะยังอยู่ครบและนำกลับมาได้", confirmLabel: "ซ่อนสินค้า", tone: "danger", action: async () => { await mutate("product.update", { product: { ...product, status: "ซ่อนสินค้า" } }, "ซ่อนสินค้าแล้ว"); } })}><AdminIcon name="hide" /><span>ซ่อน</span></button>
                ) : (
                  <button className="action-btn restore-btn" type="button" onClick={() => void mutate("product.update", { product: { ...product, status: "ปิดชั่วคราว" } }, "นำสินค้ากลับมาแล้ว")}><AdminIcon name="check" /><span>นำกลับ</span></button>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>;
    })}</div>
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
  </section>;
}

function ProductForm({ title, value, disabled, uploading, lockId = false, onChange, onUpload, onCancel, onSubmit }: { title: string; value: ProductInput; disabled: boolean; uploading: boolean; lockId?: boolean; onChange: (value: ProductInput) => void; onUpload: (file: File) => void; onCancel: () => void; onSubmit: () => void }) {
  return <form className="admin-edit-card" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h3>{title}</h3><div className="admin-form-grid"><label><span>รหัสสินค้า (อังกฤษ)</span><input required disabled={disabled || lockId} maxLength={40} value={value.id} onChange={(event) => onChange({ ...value, id: event.target.value.toUpperCase() })} placeholder="เช่น MOO001" /></label><label><span>ชื่อสินค้า</span><input required disabled={disabled} maxLength={100} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label><label><span>หมวดหมู่</span><input disabled={disabled} maxLength={80} value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })} placeholder="เช่น แหนมหมู" /></label><label><span>หน่วยขาย</span><input disabled={disabled} maxLength={80} value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} placeholder="เช่น 1 แพ็ค" /></label><label><span>ราคา (บาท)</span><input disabled={disabled} min="1" max="1000000" step="1" type="number" value={value.price ?? ""} onChange={(event) => onChange({ ...value, price: event.target.value ? Number(event.target.value) : null })} /></label><label><span>สถานะ</span><select disabled={disabled} value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ProductInput["status"] })}>{PRODUCT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label className="full"><span>คำอธิบายสินค้า</span><textarea disabled={disabled} maxLength={500} rows={3} value={value.detail} onChange={(event) => onChange({ ...value, detail: event.target.value })} /></label><label className="admin-file-field"><span>รูปสินค้า</span><input disabled={disabled} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); }} /><small>{uploading ? "กำลังอัปโหลด…" : "JPG, PNG หรือ WebP ไม่เกิน 5 MB"}</small></label>{value.imageUrl && <div className="admin-image-preview full"><Image src={adminImageSrc(value.imageUrl)} alt="ตัวอย่างรูปสินค้า" fill sizes="320px" unoptimized /></div>}</div><FormActions disabled={disabled} onCancel={onCancel} /></form>;
}

function StorefrontPanel({ settings, saving, mutate, setNotice }: { settings: AdminStorefrontSettings; saving: string | null; mutate: Mutation; setNotice: (value: string) => void }) {
  const [draft, setDraft] = useState(settings); const [preview, setPreview] = useState(false); const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const dirty = JSON.stringify({ ...draft, fingerprint: "" }) !== JSON.stringify({ ...settings, fingerprint: "" });
  function field<K extends keyof AdminStorefrontSettings>(key: K, value: AdminStorefrontSettings[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  async function uploadBrand(file: File, slot: "logo" | "cover") {
    setUploading(slot); setNotice("");
    try { const form = new FormData(); form.set("image", file); form.set("assetType", "brand"); form.set("assetSlot", slot); const response = await fetch("/api/admin/product-image", { method: "POST", body: form }); if (response.status === 401) return redirectToLogin(); const result = await response.json() as { imageUrl?: string; error?: string }; if (!response.ok || !result.imageUrl) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE")); field(slot === "logo" ? "storeLogoUrl" : "storeCoverUrl", result.imageUrl); setNotice("อัปโหลดรูปแล้ว กดบันทึกหน้าร้านเพื่อใช้งาน"); }
    catch (error) { setNotice(error instanceof CustomerFacingError ? error.message : PUBLIC_ERROR_MESSAGES.ADMIN_UNAVAILABLE); } finally { setUploading(null); }
  }
  return <section className="admin-panel"><div className="admin-section-heading"><div><p className="eyebrow">ข้อความและภาพบนเว็บจริง</p><h2>หน้าร้าน</h2></div><button className="admin-preview-link" type="button" onClick={() => setPreview((value) => !value)}><AdminIcon name={preview ? "close" : "external"} />{preview ? "ปิดตัวอย่าง" : "ดูตัวอย่าง"}</button></div>
    {preview && <div className="admin-live-preview"><div><span>ตัวอย่างหน้าร้าน</span><Link href="/" target="_blank">เปิดเต็มหน้า<AdminIcon name="external" /></Link></div><iframe src="/" title="ตัวอย่างหน้าร้านเจ๊น้อย" loading="lazy" /></div>}
    <form className="admin-edit-card storefront-editor" onSubmit={(event) => { event.preventDefault(); void mutate("settings.update", { settings: draft }, "บันทึกหน้าร้านแล้ว ลูกค้าจะเห็นข้อมูลใหม่ภายใน 30 วินาที"); }}>
      <div className="admin-form-group"><h3>ภาพแบรนด์</h3><div className="admin-brand-assets"><BrandAsset label="โลโก้ร้าน" value={draft.storeLogoUrl} ratio="square" uploading={uploading === "logo"} onUpload={(file) => void uploadBrand(file, "logo")} /><BrandAsset label="ภาพปกส่วนบน" value={draft.storeCoverUrl} ratio="cover" uploading={uploading === "cover"} onUpload={(file) => void uploadBrand(file, "cover")} /></div></div>
      <div className="admin-form-group"><h3>ส่วนบนหน้าเว็บ</h3><div className="admin-form-grid"><label className="full"><span>ชื่อร้าน</span><input required maxLength={100} value={draft.storeName} onChange={(event) => field("storeName", event.target.value)} /></label><label><span>หัวข้อหลัก</span><input required maxLength={100} value={draft.heroTitle} onChange={(event) => field("heroTitle", event.target.value)} /></label><label><span>ข้อความสีแดง</span><input required maxLength={100} value={draft.heroHighlight} onChange={(event) => field("heroHighlight", event.target.value)} /></label><label className="full"><span>คำแนะนำร้าน</span><textarea required maxLength={500} rows={4} value={draft.heroDescription} onChange={(event) => field("heroDescription", event.target.value)} /></label><label className="full"><span>ข้อความแถบประกาศ</span><textarea required maxLength={300} rows={3} value={draft.announcementText} onChange={(event) => field("announcementText", event.target.value)} /></label></div></div>
      <div className="admin-form-group"><h3>เรื่องของร้าน</h3><div className="admin-form-grid"><label className="full"><span>หัวข้อ</span><input required maxLength={120} value={draft.storyTitle} onChange={(event) => field("storyTitle", event.target.value)} /></label><label className="full"><span>เนื้อหา</span><textarea required maxLength={1000} rows={5} value={draft.storyDescription} onChange={(event) => field("storyDescription", event.target.value)} /></label></div></div>
      <div className="admin-form-group"><h3>การติดต่อและจัดส่ง</h3><div className="admin-form-grid"><label><span>เบอร์หลัก</span><input required inputMode="tel" value={draft.phonePrimary} onChange={(event) => field("phonePrimary", event.target.value)} /></label><label><span>เบอร์สำรอง</span><input required inputMode="tel" value={draft.phoneSecondary} onChange={(event) => field("phoneSecondary", event.target.value)} /></label><label><span>ค่าส่งไปรษณีย์</span><input min="0" max="100000" type="number" value={draft.shippingFee ?? ""} onChange={(event) => field("shippingFee", event.target.value ? Number(event.target.value) : null)} /></label><label className="full"><span>ที่อยู่รับเองหน้าร้าน</span><textarea maxLength={500} rows={4} value={draft.pickupAddress} onChange={(event) => field("pickupAddress", event.target.value)} /></label><label className="full"><span>ลิงก์ Google Maps</span><input type="url" maxLength={500} value={draft.pickupMapUrl} onChange={(event) => field("pickupMapUrl", event.target.value)} /></label></div></div>
      <div className={`admin-sticky-save${dirty ? " dirty" : ""}`}><span>{dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : "ข้อมูลเป็นปัจจุบันแล้ว"}</span><button className="admin-save-button" type="submit" disabled={saving !== null || uploading !== null || !dirty}>{saving ? "กำลังบันทึก…" : "บันทึกหน้าร้าน"}</button></div>
    </form>
  </section>;
}

function BrandAsset({ label, value, ratio, uploading, onUpload }: { label: string; value: string; ratio: "square" | "cover"; uploading: boolean; onUpload: (file: File) => void }) {
  return <label className={`admin-brand-asset ${ratio}`}><span>{label}</span><span className="admin-brand-asset-preview">{value ? <Image src={adminImageSrc(value)} alt={`ตัวอย่าง${label}`} fill sizes="320px" unoptimized /> : <AdminIcon name="image" />}</span><span className="admin-brand-upload"><AdminIcon name="image" />{uploading ? "กำลังอัปโหลด…" : "เลือกรูป"}</span><input disabled={uploading} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} /></label>;
}

function Kpi({ icon, label, value, accent = false }: { icon: AdminIconName; label: string; value: string; accent?: boolean }) { return <div className={accent ? "accent" : ""}><span><AdminIcon name={icon} />{label}</span><strong>{value}</strong></div>; }
function FormActions({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) { return <div className="admin-form-actions"><button type="button" onClick={onCancel}>ยกเลิก</button><button className="admin-save-button" type="submit" disabled={disabled}>{disabled ? "กำลังบันทึก…" : "บันทึก"}</button></div>; }
function redirectToLogin() { window.location.assign(`/admin/login?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); }
function adminTabFromUrl(): AdminTab {
  const value = new URL(window.location.href).searchParams.get("tab");
  return value === "rounds" || value === "products" || value === "storefront" ? value : "orders";
}
function phoneHref(value: string) { return value.replace(/[^\d+]/g, ""); }
function safeThaiDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date); }
function formatInputDateTime(value: string) { if (!value) return "—"; const [date, time] = value.split("T"); const [year, month, day] = date.split("-"); return `${day}/${month}/${year} ${time ?? ""}`; }
function formatMoney(value: number | null) { return `${Math.round(value ?? 0).toLocaleString("th-TH")} ฿`; }
function formatBangkokHeader(date: Date) { return new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(date); }
function adminImageSrc(value: string) { if (!value) return ""; try { const url = new URL(value); return `/media${url.pathname}`; } catch { return value; } }
function inOrderRange(value: string, range: OrderRange) { if (range === "all") return true; const timestamp = new Date(value).getTime(); if (!Number.isFinite(timestamp)) return false; const now = Date.now(); if (range === "7days") return timestamp >= now - 7 * 86_400_000; return bangkokDateKey(new Date(timestamp)) === bangkokDateKey(new Date(now)); }
function bangkokDateKey(date: Date) { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Bangkok" }).format(date); }
function toggleSet(current: Set<string>, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }
function roundPriority(round: AdminRound) {
  if (round.displayState === "แสดงใน dropdown") return 0;
  if (round.status === "เตรียมเปิด") return 1;
  if (round.status === "เปิดรับ") return 2;
  return 3;
}
