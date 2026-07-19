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
// Shown to the admin instead of the raw status value stored in the sheet/DB,
// worded to match the action button next to it so it's clear what pressing
// the button will do (e.g. "ยังไม่เปิดขาย" pairs with the "เปิดรอบขาย" button).
const roundStatusLabels: Record<(typeof ROUND_STATUSES)[number], string> = {
  "เตรียมเปิด": "ยังไม่เปิดขาย",
  "เปิดรับ": "เปิดขายอยู่ตอนนี้",
  "ปิดรับ": "ปิดรับออเดอร์แล้ว",
  "จัดส่งแล้ว": "จัดส่งเรียบร้อยแล้ว",
  "ยกเลิก": "ยกเลิกรอบนี้แล้ว",
};
const productStatusLabels: Record<(typeof PRODUCT_STATUSES)[number], string> = {
  "เปิดขาย": "เปิดขาย",
  "ปิดชั่วคราว": "ปิดชั่วคราว",
  "รอข้อมูล": "รอข้อมูล (ยังขายไม่ได้)",
  "ซ่อนสินค้า": "ปิดขาย",
};
const tabs: Array<{ id: AdminTab; icon: AdminIconName; label: string }> = [
  { id: "orders", icon: "orders", label: "ออเดอร์" },
  { id: "rounds", icon: "calendar", label: "รอบขาย" },
  { id: "products", icon: "products", label: "สินค้า" },
  { id: "storefront", icon: "store", label: "หน้าร้าน" },
];
const EMPTY_ROUND_INPUT: RoundInput = { deliveryDate: "", opensAt: "", closesAt: "", status: "เตรียมเปิด", note: "" };
const EMPTY_PRODUCT_INPUT: ProductInput = { id: "", name: "", unit: "", detail: "", price: null, status: "รอข้อมูล", imageUrl: "", category: "" };

export function AdminDashboard({ initialOrders, initialCms, userName, serverNow, serverClockLabel, initialTab }: { initialOrders: AdminOrder[]; initialCms: AdminCmsData; userName: string; serverNow: string; serverClockLabel: string; initialTab: AdminTab }) {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [orders, setOrders] = useState(initialOrders);
  const [cms, setCms] = useState(initialCms);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState({ iso: serverNow, label: serverClockLabel });
  const [formActive, setFormActive] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pendingCount = orders.filter((order) => order.payment_status === "waiting_for_slip_review" || order.payment_status === "invalid_slip").length;
  const storeIsOpen = cms.rounds.some((round) => round.status === "เปิดรับ" && round.displayState === "แสดงใน dropdown");
  const isNavHidden = formActive || (activeTab === "storefront" && formDirty);

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

  useEffect(() => {
    if (!formDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formDirty]);

  function changeTab(tab: AdminTab) {
    if (formDirty) {
      setConfirm({
        title: "ออกจากหน้านี้?",
        description: "ข้อมูลที่แก้ไขไว้แต่ยังไม่ได้บันทึกจะสูญหาย",
        confirmLabel: "ออกจากหน้า",
        tone: "danger",
        action: async () => {
          setFormDirty(false);
          setFormActive(false);
          setActiveTab(tab);
          const url = new URL(window.location.href);
          url.searchParams.set("tab", tab);
          window.history.replaceState(null, "", url);
        }
      });
    } else {
      setActiveTab(tab);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url);
    }
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

  return <main className={`admin-shell ${isNavHidden ? "form-active" : ""}`}>
    {!isNavHidden && (
      <>
        <header className="admin-ops-header">
          <button type="button" className="admin-hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="เปิดเมนู">
            <AdminIcon name="menu" />
          </button>
          <div className="admin-header-title">
            <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
          </div>
          <div className="admin-header-meta">
            <time dateTime={clock.iso}>{clock.label}</time>
            <span className={`admin-store-state ${storeIsOpen ? "open" : "closed"}`}><i aria-hidden="true" />{storeIsOpen ? "หน้าร้านเปิดรับ" : "หน้าร้านปิดรับ"}</span>
          </div>
        </header>

        {drawerOpen && (
          <div className="admin-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
        )}
        <aside className={`admin-drawer ${drawerOpen ? "open" : ""}`}>
          <div className="admin-drawer-header">
            <div className="admin-brand-lockup">
              <span className="admin-brand-logo"><Image src={adminImageSrc(cms.settings.storeLogoUrl) || "/images/products/jae-noi-shop-logo.jpg"} alt="" fill sizes="48px" unoptimized /></span>
              <div>
                <p>ระบบจัดการหลังบ้าน</p>
                <strong>{cms.settings.storeName}</strong>
              </div>
            </div>
            <button type="button" className="admin-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="ปิดเมนู">
              <AdminIcon name="close" />
            </button>
          </div>

          <nav className="admin-drawer-nav" aria-label="เมนูหลังบ้าน">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "active" : ""}
                aria-current={activeTab === tab.id ? "page" : undefined}
                onClick={() => {
                  changeTab(tab.id);
                  setDrawerOpen(false);
                }}
              >
                <span className="admin-nav-icon">
                  <AdminIcon name={tab.icon} />
                  {tab.id === "orders" && pendingCount > 0 && <b aria-label={`${pendingCount} รายการที่ต้องตรวจ`}>{pendingCount > 99 ? "99+" : pendingCount}</b>}
                </span>
                <strong>{tab.label}</strong>
              </button>
            ))}
          </nav>

          <div className="admin-drawer-footer">
            <div className="admin-drawer-user">
              <p className="eyebrow">บัญชีผู้ใช้</p>
              <span title={userName}>{userName}</span>
            </div>
            <div className="admin-drawer-actions">
              <Link href="/" target="_blank" className="admin-drawer-link"><AdminIcon name="external" /><span>ดูหน้าร้าน</span></Link>
              <form action="/api/admin/logout" method="post" className="admin-drawer-logout-form">
                <button type="submit" className="admin-drawer-logout-btn"><AdminIcon name="logout" /><span>ออกจากระบบ</span></button>
              </form>
            </div>
          </div>
        </aside>
      </>
    )}

    <p className={`admin-save-notice${notice ? " has-message" : ""}`} aria-live="polite" role="status">{notice}</p>
    {activeTab === "orders" && <OrdersPanel orders={orders} setOrders={setOrders} saving={saving} setSaving={setSaving} setNotice={setNotice} />}
    {activeTab === "rounds" && <RoundsPanel rounds={cms.rounds} saving={saving} mutate={mutate} onFormActive={setFormActive} onFormDirty={setFormDirty} />}
    {activeTab === "products" && <ProductsPanel products={cms.products} saving={saving} mutate={mutate} setNotice={setNotice} onFormActive={setFormActive} onFormDirty={setFormDirty} />}
    {activeTab === "storefront" && <StorefrontPanel key={cms.settings.fingerprint} settings={cms.settings} saving={saving} mutate={mutate} setNotice={setNotice} onFormActive={setFormActive} onFormDirty={setFormDirty} />}

    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
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
    current.count += 1;
    if (order.payment_status === "paid" && order.order_status !== "cancelled") current.sales += order.total ?? 0;
    map.set(key, current); return map;
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
    {byRound.length > 0 && <div className="admin-round-summary"><h3>ยอดตามรอบจัดส่ง</h3><div>{byRound.map(([roundId, data]) => <span key={roundId}><b>{roundId}</b><small>{data.count} ออเดอร์ · ชำระแล้ว {formatMoney(data.sales)}</small></span>)}</div></div>}
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
              <div className="admin-slip-control">{order.slip_key ? <div className="admin-slip-actions"><a className="slip-link" href={`/api/admin/slips/${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer"><AdminIcon name="image" />เปิดดูสลิป</a><a className="slip-link slip-download-link" href={`/api/admin/slips/${encodeURIComponent(order.id)}?download=1`}><AdminIcon name="download" />ดาวน์โหลดสลิป</a></div> : <span className="no-slip">ยังไม่มีสลิป</span>}<small>ตรวจเงินเข้าในแอปธนาคารก่อนกดยืนยัน</small></div>
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

function RoundsPanel({ rounds, saving, mutate, onFormActive, onFormDirty }: { rounds: AdminRound[]; saving: string | null; mutate: Mutation; onFormActive: (active: boolean) => void; onFormDirty: (dirty: boolean) => void }) {
  const [creating, setCreating] = useState(false); const [draft, setDraft] = useState<RoundInput>(EMPTY_ROUND_INPUT); const [editing, setEditing] = useState<string | null>(null); const [confirm, setConfirm] = useState<ConfirmState>(null);
  const sorted = useMemo(() => [...rounds].sort((a, b) => roundPriority(a) - roundPriority(b) || a.deliveryDate.localeCompare(b.deliveryDate)), [rounds]);

  const activeRound = useMemo(() => {
    if (editing) return rounds.find((r) => r.id === editing) ?? null;
    return null;
  }, [editing, rounds]);

  const isDirty = useMemo(() => {
    if (creating) {
      return JSON.stringify(draft) !== JSON.stringify(EMPTY_ROUND_INPUT);
    }
    if (editing && activeRound) {
      const activeInput: RoundInput = {
        deliveryDate: activeRound.deliveryDate,
        opensAt: activeRound.opensAt,
        closesAt: activeRound.closesAt,
        status: activeRound.status,
        note: activeRound.note || ""
      };
      return JSON.stringify(draft) !== JSON.stringify(activeInput);
    }
    return false;
  }, [creating, editing, draft, activeRound]);

  useEffect(() => {
    onFormActive(creating || editing !== null);
  }, [creating, editing, onFormActive]);

  useEffect(() => {
    onFormDirty(isDirty);
    return () => onFormDirty(false);
  }, [isDirty, onFormDirty]);

  return <section className="admin-panel">
    {creating ? (
      <RoundForm title="เพิ่มรอบใหม่" value={draft} disabled={saving !== null} onChange={setDraft} onCancel={() => setCreating(false)} onSubmit={async () => { if (await mutate("round.create", { round: draft }, "เพิ่มรอบขายแล้ว")) { setDraft(EMPTY_ROUND_INPUT); setCreating(false); } }} />
    ) : editing ? (
      <RoundForm key={editing} title={`แก้ไข ${editing}`} value={draft} disabled={saving !== null} lockDeliveryDate onChange={setDraft} onCancel={() => setEditing(null)} onSubmit={async () => { if (await mutate("round.update", { id: editing, round: draft }, "บันทึกรอบขายแล้ว")) setEditing(null); }} />
    ) : (
      <>
        <div className="admin-section-heading"><div><p className="eyebrow">กำหนดวันเปิดและปิดตะกร้า</p><h2>รอบขาย</h2></div><button className="admin-primary-button" type="button" onClick={() => { setCreating(true); setEditing(null); setDraft(EMPTY_ROUND_INPUT); }}><AdminIcon name="plus" />เพิ่มรอบ</button></div>
        <div className="admin-card-list admin-round-list">{sorted.map((round) => (
          <article className={`admin-cms-card admin-round-card priority-${roundPriority(round)}`} key={round.id}>
            <div className="admin-card-top"><div><span className={`cms-status status-${round.status === "เปิดรับ" ? "open" : "muted"}`}>{roundStatusLabels[round.status]}</span><h3>{round.label || round.id}</h3><small>{round.displayState}</small></div><button type="button" onClick={() => { setDraft({ deliveryDate: round.deliveryDate, opensAt: round.opensAt, closesAt: round.closesAt, status: round.status, note: round.note || "" }); setEditing(round.id); setCreating(false); }}><AdminIcon name="edit" />แก้ไข</button></div>
            <div className="admin-round-sales"><span>ยอดชำระแล้วรอบนี้</span><strong>{formatMoney(round.sales)}</strong></div>
            <dl className="admin-mini-stats"><div><dt>เปิดรับ</dt><dd>{formatInputDateTime(round.opensAt)}</dd></div><div><dt>ปิดรับ</dt><dd>{formatInputDateTime(round.closesAt)}</dd></div><div><dt>ออเดอร์</dt><dd>{round.orderCount}</dd></div><div><dt>เฉลี่ยชำระแล้ว</dt><dd>{formatMoney(round.paidOrderCount ? round.sales / round.paidOrderCount : 0)}</dd></div></dl>
            {round.note && <p>{round.note}</p>}
            {round.status === "เตรียมเปิด" && <button className="admin-open-round" type="button" disabled={saving !== null} onClick={() => void mutate("round.update", { id: round.id, round: { ...round, status: "เปิดรับ" } }, "เปิดรอบขายแล้ว")}>เปิดรอบขาย</button>}
            {round.status === "เปิดรับ" && <button className="admin-close-round" type="button" onClick={() => setConfirm({ title: "ปิดรอบขายนี้?", description: `${round.label || round.id} จะหยุดรับออเดอร์ใหม่ทันที แต่ออเดอร์เดิมยังอยู่ครบ`, confirmLabel: "ปิดรอบขาย", tone: "danger", action: async () => { await mutate("round.update", { id: round.id, round: { ...round, status: "ปิดรับ" } }, "ปิดรอบขายแล้ว"); } })}>ปิดรอบขาย</button>}
          </article>
        ))}</div>
      </>
    )}
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
  </section>;
}

function RoundForm({ title, value, disabled, lockDeliveryDate = false, onChange, onCancel, onSubmit }: { title: string; value: RoundInput; disabled: boolean; lockDeliveryDate?: boolean; onChange: (value: RoundInput) => void; onCancel: () => void; onSubmit: () => void }) {
  return <form className="admin-edit-card" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h3>{title}</h3><div className="admin-form-grid"><label><span>วันจัดส่ง</span><input required type="date" disabled={disabled || lockDeliveryDate} value={value.deliveryDate} onChange={(event) => onChange({ ...value, deliveryDate: event.target.value })} /></label><label><span>เปิดรับตั้งแต่</span><input required type="datetime-local" disabled={disabled} value={value.opensAt} onChange={(event) => onChange({ ...value, opensAt: event.target.value })} /></label><label><span>ปิดรับวันที่</span><input required type="datetime-local" disabled={disabled} value={value.closesAt} onChange={(event) => onChange({ ...value, closesAt: event.target.value })} /></label><label><span>สถานะ</span><select disabled={disabled} value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as RoundInput["status"] })}>{ROUND_STATUSES.map((status) => <option key={status} value={status}>{roundStatusLabels[status]}</option>)}</select></label><label className="full"><span>หมายเหตุ</span><textarea rows={3} maxLength={500} value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} /></label></div><FormActions disabled={disabled} onCancel={onCancel} /></form>;
}

function ProductsPanel({ products, saving, mutate, setNotice, onFormActive, onFormDirty }: { products: AdminProduct[]; saving: string | null; mutate: Mutation; setNotice: (value: string) => void; onFormActive: (active: boolean) => void; onFormDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState<ProductInput>(EMPTY_PRODUCT_INPUT); const [editing, setEditing] = useState<string | null>(null); const [creating, setCreating] = useState(false); const [uploading, setUploading] = useState(false); const [category, setCategory] = useState("ทั้งหมด"); const [view, setView] = useState<"list" | "grid">("list"); const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState(false);

  const categories = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(products.map((product) => product.category || "อื่น ๆ")))], [products]);
  const visible = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = category === "ทั้งหมด" || (product.category || "อื่น ๆ") === category;
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const matchesSearch = !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.id.toLowerCase().includes(normalizedQuery) ||
        (product.category || "").toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesSearch;
    });
  }, [products, category, searchQuery]);

  const activeProduct = useMemo(() => {
    if (editing) return products.find((p) => p.id === editing) ?? null;
    return null;
  }, [editing, products]);

  const isDirty = useMemo(() => {
    if (creating) {
      return JSON.stringify(draft) !== JSON.stringify(EMPTY_PRODUCT_INPUT);
    }
    if (editing && activeProduct) {
      const activeInput: ProductInput = {
        id: activeProduct.id,
        name: activeProduct.name,
        unit: activeProduct.unit || "",
        detail: activeProduct.detail || "",
        price: activeProduct.price,
        status: activeProduct.status,
        imageUrl: activeProduct.imageUrl || "",
        category: activeProduct.category || ""
      };
      return JSON.stringify(draft) !== JSON.stringify(activeInput);
    }
    return false;
  }, [creating, editing, draft, activeProduct]);

  useEffect(() => {
    onFormActive(creating || editing !== null);
  }, [creating, editing, onFormActive]);

  useEffect(() => {
    onFormDirty(isDirty);
    return () => onFormDirty(false);
  }, [isDirty, onFormDirty]);

  async function uploadImage(file: File) {
    setUploading(true); setNotice("");
    try {
      const compressedFile = await compressImage(file);
      const form = new FormData();
      form.set("image", compressedFile, file.name);
      form.set("productId", draft.id || "PRODUCT");
      const response = await fetch("/api/admin/product-image", { method: "POST", body: form });
      if (response.status === 401) return redirectToLogin();
      const result = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !result.imageUrl) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE"));

      const currentImages = draft.imageUrl ? draft.imageUrl.split(",").filter(Boolean) : [];
      if (currentImages.length < 5) {
        currentImages.push(result.imageUrl);
        setDraft((current) => ({ ...current, imageUrl: currentImages.join(",") }));
        setNotice(`อัปโหลดรูปสำเร็จ (${currentImages.length}/5) กดบันทึกสินค้าเพื่อใช้งาน`);
      } else {
        setNotice("เพิ่มรูปไม่สำเร็จ: สามารถอัปโหลดได้สูงสุด 5 รูปต่อสินค้าเท่านั้น");
      }
    }
    catch (error) {
      setNotice(error instanceof CustomerFacingError ? error.message : PUBLIC_ERROR_MESSAGES.ADMIN_UNAVAILABLE);
    } finally {
      setUploading(false);
    }
  }

  return <section className="admin-panel admin-products-section">
    {creating ? (
      <ProductForm title="เพิ่มสินค้าใหม่" value={draft} disabled={saving !== null || uploading} uploading={uploading} onChange={setDraft} onUpload={uploadImage} onCancel={() => setCreating(false)} onSubmit={async () => { if (await mutate("product.create", { product: draft }, "เพิ่มสินค้าแล้ว")) { setDraft(EMPTY_PRODUCT_INPUT); setCreating(false); } }} />
    ) : editing ? (
      <ProductForm key={editing} title={`แก้ไข ${draft.name}`} value={draft} disabled={saving !== null || uploading} uploading={uploading} lockId onChange={setDraft} onUpload={uploadImage} onCancel={() => setEditing(null)} onSubmit={async () => { if (await mutate("product.update", { product: draft }, "บันทึกสินค้าแล้ว")) setEditing(null); }} />
    ) : (
      <>
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">แก้ไขแล้วแสดงบนเว็บจริง</p>
            <h2>สินค้า</h2>
          </div>
          <button className="admin-primary-button add-product-top-btn" type="button" onClick={() => { setDraft({ ...EMPTY_PRODUCT_INPUT, id: nextProductId(products) }); setCreating(true); setEditing(null); }}>
            <AdminIcon name="plus" />เพิ่มสินค้า
          </button>
        </div>

        <div className="admin-product-search-bar-row">
          <label className="admin-search">
            <span className="sr-only">ค้นหาสินค้า</span>
            <AdminIcon name="search" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ค้นหารหัส ชื่อสินค้า หรือหมวดหมู่..." />
          </label>
        </div>

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
            <button className={`admin-sort-mode-btn ${sortMode ? "active" : ""}`} type="button" onClick={() => setSortMode(!sortMode)} title="โหมดจัดเรียงลำดับสินค้า"><AdminIcon name="sort" /></button>
            <button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")} aria-label="แบบรายการ"><AdminIcon name="list" /></button>
            <button className={view === "grid" ? "active" : ""} type="button" onClick={() => setView("grid")} aria-label="แบบตาราง"><AdminIcon name="grid" /></button>
          </div>
        </div>

        <button className="admin-primary-button add-product-mobile-btn" type="button" onClick={() => { setDraft({ ...EMPTY_PRODUCT_INPUT, id: nextProductId(products) }); setCreating(true); setEditing(null); }}>
          <AdminIcon name="plus" />เพิ่มสินค้าใหม่
        </button>

        {sortMode ? (
          <div className="admin-sort-list">
            {visible.map((product, index) => {
              return (
                <div key={product.id} className="admin-sort-item">
                  <div className="sort-item-info">
                    <strong>{product.name}</strong>
                    <span>{product.id} · {product.category} · {formatMoney(product.price)}</span>
                  </div>
                  <div className="sort-item-actions">
                    <button type="button" className="sort-arrow-btn" disabled={index === 0 || saving !== null} onClick={() => void mutate("product.move", { id: product.id, direction: "up", fingerprint: product.fingerprint }, "เรียงสินค้าแล้ว")}>▲ ขึ้น</button>
                    <button type="button" className="sort-arrow-btn" disabled={index === products.length - 1 || saving !== null} onClick={() => void mutate("product.move", { id: product.id, direction: "down", fingerprint: product.fingerprint }, "เรียงสินค้าแล้ว")}>▼ ลง</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`admin-card-list admin-product-list view-${view}`}>
            {visible.map((product) => {
              const firstImage = product.imageUrl ? product.imageUrl.split(",")[0] : "";

              return <article className={`admin-product-card ${product.status === "ซ่อนสินค้า" ? "is-archived" : ""}`} key={product.id}>
                <div className="product-card-body">
                  <div className="product-card-image-wrap">
                    {firstImage ? <Image src={adminImageSrc(firstImage)} alt="" fill sizes="96px" unoptimized /> : <div className="product-card-no-image"><AdminIcon name="image" /></div>}
                  </div>
                  <div className="product-card-info">
                    <div className="product-card-title-row">
                      <span className="product-card-category">{product.category || "อื่น ๆ"}</span>
                      <div className="product-card-header-flex">
                        <h3>{product.name}</h3>
                        <span className={`product-card-status status-${product.status === "เปิดขาย" ? "open" : product.status === "ปิดชั่วคราว" ? "closed" : "waiting"}`}>
                          {productStatusLabels[product.status]}
                        </span>
                      </div>
                    </div>
                    <p className="product-card-meta">{product.unit} • {product.price === null ? "รอราคา" : `${product.price.toLocaleString("th-TH")} บาท`}</p>
                    {product.detail && <p className="product-card-desc">{product.detail}</p>}

                    <div className="product-card-actions-row">
                      <button type="button" className="action-btn edit-btn" onClick={() => { setDraft({ id: product.id, name: product.name, unit: product.unit || "", detail: product.detail || "", price: product.price, status: product.status, imageUrl: product.imageUrl || "", category: product.category || "" }); setEditing(product.id); setCreating(false); }}><AdminIcon name="edit" /><span>แก้ไข</span></button>
                      {product.status !== "ซ่อนสินค้า" ? (
                        <button className="action-btn delete-btn" type="button" onClick={() => setConfirm({ title: `ปิดขาย ${product.name}?`, description: "สินค้าจะหายจากหน้าร้าน แต่ประวัติออเดอร์เก่าจะยังอยู่ครบและนำกลับมาได้", confirmLabel: "ปิดขายสินค้า", tone: "danger", action: async () => { await mutate("product.update", { product: { ...product, status: "ซ่อนสินค้า" } }, "ปิดขายสินค้าแล้ว"); } })}><AdminIcon name="hide" /><span>ปิดขาย</span></button>
                      ) : (
                        <button className="action-btn restore-btn" type="button" onClick={() => void mutate("product.update", { product: { ...product, status: "ปิดชั่วคราว" } }, "เปิดขายสินค้าอีกครั้ง")}><AdminIcon name="check" /><span>เปิดขาย</span></button>
                      )}
                    </div>
                  </div>
                </div>
              </article>;
            })}
          </div>
        )}
      </>
    )}

    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
  </section>;
}

function ProductForm({ title, value, disabled, uploading, lockId = false, onChange, onUpload, onCancel, onSubmit }: { title: string; value: ProductInput; disabled: boolean; uploading: boolean; lockId?: boolean; onChange: (value: ProductInput) => void; onUpload: (file: File) => void; onCancel: () => void; onSubmit: () => void }) {
  const images = value.imageUrl ? value.imageUrl.split(",").filter(Boolean) : [];

  const removeImage = (indexToRemove: number) => {
    const updated = images.filter((_, idx) => idx !== indexToRemove);
    onChange({ ...value, imageUrl: updated.join(",") });
  };

  const moveImage = (index: number, direction: "left" | "right") => {
    const nextIndex = direction === "left" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    const nextImages = [...images];
    const temp = nextImages[index];
    nextImages[index] = nextImages[nextIndex];
    nextImages[nextIndex] = temp;
    onChange({ ...value, imageUrl: nextImages.join(",") });
  };

  return <form className="admin-edit-card" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <h3>{title}</h3>
    <div className="admin-form-grid">
      {lockId && <label><span>รหัสสินค้า (ระบบตั้งให้อัตโนมัติ แก้ไขไม่ได้)</span><input disabled value={value.id} /></label>}
      <label><span>ชื่อสินค้า</span><input required disabled={disabled} maxLength={100} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="เช่น แหนมหมู" /></label>
      <label><span>หมวดหมู่</span><input disabled={disabled} maxLength={80} value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })} placeholder="เช่น แหนมหมู" /></label>
      <label><span>หน่วยขาย</span><input disabled={disabled} maxLength={80} value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} placeholder="เช่น 1 แพ็ค" /></label>
      <label><span>ราคา (บาท)</span><input disabled={disabled} min="1" max="1000000" step="1" type="number" value={value.price ?? ""} onChange={(event) => onChange({ ...value, price: event.target.value ? Number(event.target.value) : null })} /></label>
      <label><span>สถานะ</span><select disabled={disabled} value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ProductInput["status"] })}>{PRODUCT_STATUSES.map((status) => <option key={status} value={status}>{productStatusLabels[status]}</option>)}</select></label>
      <label className="full"><span>คำอธิบายสินค้า</span><textarea disabled={disabled} maxLength={500} rows={3} value={value.detail} onChange={(event) => onChange({ ...value, detail: event.target.value })} /></label>

      <div className="admin-form-images-section full">
        <span>รูปภาพสินค้า (อัปโหลดได้สูงสุด 5 รูป, รูปแรกจะเป็นรูปหลัก)</span>
        <div className="admin-images-grid">
          {images.map((imgUrl, idx) => (
            <div key={imgUrl} className="admin-image-slot">
              <div className="image-slot-preview">
                <Image src={adminImageSrc(imgUrl)} alt="" fill sizes="120px" unoptimized />
                <span className="image-slot-badge">{idx === 0 ? "รูปหลัก" : `${idx + 1}`}</span>
              </div>
              <div className="image-slot-actions">
                <button type="button" disabled={idx === 0} onClick={() => moveImage(idx, "left")} aria-label="เลื่อนซ้าย">◀</button>
                <button type="button" disabled={idx === images.length - 1} onClick={() => moveImage(idx, "right")} aria-label="เลื่อนขวา">▶</button>
                <button type="button" className="delete-image-btn" onClick={() => removeImage(idx)} aria-label="ลบรูป">ลบ</button>
              </div>
            </div>
          ))}
          {images.length < 5 && (
            <label className="admin-image-upload-slot">
              <span className="upload-icon">+</span>
              <span className="upload-label">{uploading ? "กำลังอัปโหลด…" : "เพิ่มรูป"}</span>
              <input disabled={disabled || uploading} type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); }} />
            </label>
          )}
        </div>
      </div>
    </div>
    <FormActions disabled={disabled} onCancel={onCancel} />
  </form>;
}

function StorefrontPanel({ settings, saving, mutate, setNotice, onFormActive, onFormDirty }: { settings: AdminStorefrontSettings; saving: string | null; mutate: Mutation; setNotice: (value: string) => void; onFormActive: (active: boolean) => void; onFormDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(settings); const [preview, setPreview] = useState(false); const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"brand" | "info" | "story" | "contact">("brand");
  const dirty = JSON.stringify({ ...draft, fingerprint: "" }) !== JSON.stringify({ ...settings, fingerprint: "" });
  function field<K extends keyof AdminStorefrontSettings>(key: K, value: AdminStorefrontSettings[K]) { setDraft((current) => ({ ...current, [key]: value })); }

  useEffect(() => {
    onFormDirty(dirty);
    return () => onFormDirty(false);
  }, [dirty, onFormDirty]);

  useEffect(() => {
    onFormActive(false);
  }, [onFormActive]);

  async function uploadBrand(file: File, slot: "logo" | "cover") {
    setUploading(slot); setNotice("");
    try {
      const compressedFile = await compressImage(file);
      const form = new FormData();
      form.set("image", compressedFile, file.name);
      form.set("assetType", "brand");
      form.set("assetSlot", slot);
      const response = await fetch("/api/admin/product-image", { method: "POST", body: form });
      if (response.status === 401) return redirectToLogin();
      const result = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !result.imageUrl) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE"));
      field(slot === "logo" ? "storeLogoUrl" : "storeCoverUrl", result.imageUrl);
      setNotice("อัปโหลดรูปแล้ว กดบันทึกหน้าร้านเพื่อใช้งาน");
    }
    catch (error) {
      setNotice(error instanceof CustomerFacingError ? error.message : PUBLIC_ERROR_MESSAGES.ADMIN_UNAVAILABLE);
    } finally {
      setUploading(null);
    }
  }
  return <section className="admin-panel"><div className="admin-section-heading"><div><p className="eyebrow">ข้อความและภาพบนเว็บจริง</p><h2>หน้าร้าน</h2></div><button className="admin-preview-link" type="button" onClick={() => setPreview((value) => !value)}><AdminIcon name={preview ? "close" : "external"} />{preview ? "ปิดตัวอย่าง" : "ดูตัวอย่าง"}</button></div>
    {preview && <div className="admin-live-preview"><div><span>ตัวอย่างหน้าร้าน</span><Link href="/" target="_blank">เปิดเต็มหน้า<AdminIcon name="external" /></Link></div><iframe src="/" title="ตัวอย่างหน้าร้านเจ๊น้อย" loading="lazy" /></div>}
    
    <div className="admin-sub-tabs">
      <button type="button" className={activeSubTab === "brand" ? "active" : ""} onClick={() => setActiveSubTab("brand")}>รูปภาพแบรนด์</button>
      <button type="button" className={activeSubTab === "info" ? "active" : ""} onClick={() => setActiveSubTab("info")}>ข้อมูลหน้าร้าน</button>
      <button type="button" className={activeSubTab === "story" ? "active" : ""} onClick={() => setActiveSubTab("story")}>เรื่องของร้าน</button>
      <button type="button" className={activeSubTab === "contact" ? "active" : ""} onClick={() => setActiveSubTab("contact")}>ติดต่อและจัดส่ง</button>
    </div>

    <form className="admin-edit-card storefront-editor" onSubmit={(event) => { event.preventDefault(); void mutate("settings.update", { settings: draft }, "บันทึกหน้าร้านแล้ว ลูกค้าจะเห็นข้อมูลใหม่ภายใน 30 วินาที"); }}>
      {activeSubTab === "brand" && (
        <div className="admin-form-group">
          <h3>ภาพแบรนด์</h3>
          <div className="admin-brand-assets">
            <BrandAsset label="โลโก้ร้าน" value={draft.storeLogoUrl} ratio="square" uploading={uploading === "logo"} onUpload={(file) => void uploadBrand(file, "logo")} />
            <BrandAsset label="ภาพปกส่วนบน" value={draft.storeCoverUrl} ratio="cover" uploading={uploading === "cover"} onUpload={(file) => void uploadBrand(file, "cover")} />
          </div>
        </div>
      )}
      {activeSubTab === "info" && (
        <div className="admin-form-group">
          <h3>ส่วนบนหน้าเว็บ</h3>
          <div className="admin-form-grid">
            <label className="full"><span>ชื่อร้าน</span><input required maxLength={100} value={draft.storeName} onChange={(event) => field("storeName", event.target.value)} /></label>
            <label><span>หัวข้อหลัก</span><input required maxLength={100} value={draft.heroTitle} onChange={(event) => field("heroTitle", event.target.value)} /></label>
            <label><span>ข้อความสีแดง</span><input required maxLength={100} value={draft.heroHighlight} onChange={(event) => field("heroHighlight", event.target.value)} /></label>
            <label className="full"><span>คำแนะนำร้าน</span><textarea required maxLength={500} rows={4} value={draft.heroDescription} onChange={(event) => field("heroDescription", event.target.value)} /></label>
            <label className="full"><span>ข้อความแถบประกาศ</span><textarea required maxLength={300} rows={3} value={draft.announcementText} onChange={(event) => field("announcementText", event.target.value)} /></label>
          </div>
        </div>
      )}
      {activeSubTab === "story" && (
        <div className="admin-form-group">
          <h3>เรื่องของร้าน</h3>
          <div className="admin-form-grid">
            <label className="full"><span>หัวข้อ</span><input required maxLength={120} value={draft.storyTitle} onChange={(event) => field("storyTitle", event.target.value)} /></label>
            <label className="full"><span>เนื้อหา</span><textarea required maxLength={1000} rows={5} value={draft.storyDescription} onChange={(event) => field("storyDescription", event.target.value)} /></label>
          </div>
        </div>
      )}
      {activeSubTab === "contact" && (
        <div className="admin-form-group">
          <h3>การติดต่อและจัดส่ง</h3>
          <div className="admin-form-grid">
            <label><span>เบอร์หลัก</span><input required inputMode="tel" value={draft.phonePrimary} onChange={(event) => field("phonePrimary", event.target.value)} /></label>
            <label><span>เบอร์สำรอง</span><input required inputMode="tel" value={draft.phoneSecondary} onChange={(event) => field("phoneSecondary", event.target.value)} /></label>
            <label><span>ค่าส่งไปรษณีย์</span><input min="0" max="100000" type="number" value={draft.shippingFee ?? ""} onChange={(event) => field("shippingFee", event.target.value ? Number(event.target.value) : null)} /></label>
            <label className="full"><span>ที่อยู่รับเองหน้าร้าน</span><textarea maxLength={500} rows={4} value={draft.pickupAddress} onChange={(event) => field("pickupAddress", event.target.value)} /></label>
            <label className="full"><span>ลิงก์ Google Maps</span><input type="url" maxLength={500} value={draft.pickupMapUrl} onChange={(event) => field("pickupMapUrl", event.target.value)} /></label>
          </div>
        </div>
      )}
      <div className={`admin-sticky-save${dirty ? " dirty" : ""}`}><span>{dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : "ข้อมูลเป็นปัจจุบันแล้ว"}</span><button className="admin-save-button" type="submit" disabled={saving !== null || uploading !== null || !dirty}>{saving ? "กำลังบันทึก…" : "บันทึกหน้าร้าน"}</button></div>
    </form>
  </section>;
}

function BrandAsset({ label, value, ratio, uploading, onUpload }: { label: string; value: string; ratio: "square" | "cover"; uploading: boolean; onUpload: (file: File) => void }) {
  return <label className={`admin-brand-asset ${ratio}`}><span>{label}</span><span className="admin-brand-asset-preview">{value ? <Image src={adminImageSrc(value)} alt={`ตัวอย่าง${label}`} fill sizes="320px" unoptimized /> : <AdminIcon name="image" />}</span><span className="admin-brand-upload"><AdminIcon name="image" />{uploading ? "กำลังอัปโหลด…" : "เลือกรูป"}</span><input disabled={uploading} type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} /></label>;
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

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function formatInputDateTime(value: string) {
  if (!value) return "—";
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-");
  const mIdx = parseInt(month, 10) - 1;
  const mStr = THAI_MONTHS[mIdx] ?? month;
  const formattedTime = time ? ` เวลา ${time.slice(0, 5)} น.` : "";
  return `${parseInt(day, 10)} ${mStr} ${year}${formattedTime}`;
}

function formatMoney(value: number | null) { return `${Math.round(value ?? 0).toLocaleString("th-TH")} ฿`; }
function formatBangkokHeader(date: Date) { return new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(date); }
function adminImageSrc(value: string) { if (!value) return ""; try { const url = new URL(value); return `/media${url.pathname}`; } catch { return value; } }
function inOrderRange(value: string, range: OrderRange) { if (range === "all") return true; const timestamp = new Date(value).getTime(); if (!Number.isFinite(timestamp)) return false; const now = Date.now(); if (range === "7days") return timestamp >= now - 7 * 86_400_000; return bangkokDateKey(new Date(timestamp)) === bangkokDateKey(new Date(now)); }
function bangkokDateKey(date: Date) { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Bangkok" }).format(date); }
function toggleSet(current: Set<string>, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }
function nextProductId(products: AdminProduct[]) {
  const existingIds = new Set(products.map((product) => product.id));
  let counter = 1;
  while (existingIds.has(`P${String(counter).padStart(4, "0")}`)) counter += 1;
  return `P${String(counter).padStart(4, "0")}`;
}
function roundPriority(round: AdminRound) {
  if (round.displayState === "แสดงใน dropdown") return 0;
  if (round.status === "เตรียมเปิด") return 1;
  if (round.status === "เปิดรับ") return 2;
  return 3;
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file);
          }
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
