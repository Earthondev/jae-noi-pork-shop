"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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

type AdminTab = "orders" | "rounds" | "products" | "storefront";

const statusLabels: Record<OrderStatus, string> = {
  received: "รับออเดอร์แล้ว", preparing: "กำลังเตรียม", ready_for_pickup: "พร้อมรับหน้าร้าน",
  shipped: "จัดส่งแล้ว", completed: "สำเร็จ", cancelled: "ยกเลิก",
};
const paymentStatusLabels: Record<PaymentStatus, string> = {
  waiting_for_payment: "รอชำระเงิน", waiting_for_slip_review: "รอตรวจสลิป", paid: "ชำระแล้ว",
  invalid_slip: "สลิปไม่ถูกต้อง", refunded: "คืนเงินแล้ว",
};

const tabs: Array<{ id: AdminTab; icon: string; label: string }> = [
  { id: "orders", icon: "▤", label: "ออเดอร์" },
  { id: "rounds", icon: "◷", label: "รอบขาย" },
  { id: "products", icon: "□", label: "สินค้า" },
  { id: "storefront", icon: "⌂", label: "หน้าร้าน" },
];

export function AdminDashboard({
  initialOrders,
  initialCms,
  userName,
}: {
  initialOrders: AdminOrder[];
  initialCms: AdminCmsData;
  userName: string;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [orders, setOrders] = useState(initialOrders);
  const [cms, setCms] = useState(initialCms);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function refreshCms() {
    const response = await fetch("/api/admin/cms", { cache: "no-store" });
    if (response.status === 401) return redirectToLogin();
    const result = await response.json() as AdminCmsData & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "โหลดข้อมูลหลังบ้านไม่สำเร็จ");
    setCms(result);
  }

  async function mutate(action: string, payload: Record<string, unknown>, successMessage: string) {
    setSaving(action);
    setNotice("");
    try {
      const response = await fetch("/api/admin/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (response.status === 401) return redirectToLogin();
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "บันทึกไม่สำเร็จ");
      await refreshCms();
      setNotice(successMessage);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return false;
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header admin-cms-header">
        <div><p className="eyebrow">เจ๊น้อย เขียงหมูตะคร้อ</p><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1></div>
        <div className="admin-user">
          <span>{userName}</span>
          <Link href="/" target="_blank">ดูหน้าร้าน ↗</Link>
          <form action="/api/admin/logout" method="post"><button className="admin-logout-button" type="submit">ออก</button></form>
        </div>
      </header>

      <p className={`admin-save-notice${notice ? " has-message" : ""}`} aria-live="polite" role="status">{notice}</p>

      {activeTab === "orders" && <OrdersPanel orders={orders} setOrders={setOrders} saving={saving} setSaving={setSaving} setNotice={setNotice} />}
      {activeTab === "rounds" && <RoundsPanel rounds={cms.rounds} saving={saving} mutate={mutate} />}
      {activeTab === "products" && <ProductsPanel products={cms.products} saving={saving} mutate={mutate} setNotice={setNotice} />}
      {activeTab === "storefront" && <StorefrontPanel key={cms.settings.fingerprint} settings={cms.settings} saving={saving} mutate={mutate} />}

      <nav className="admin-bottom-nav" aria-label="เมนูหลังบ้าน">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => { setActiveTab(tab.id); setNotice(""); }} aria-current={activeTab === tab.id ? "page" : undefined}>
            <span aria-hidden="true">{tab.icon}</span><strong>{tab.label}</strong>
          </button>
        ))}
      </nav>
    </main>
  );
}

function OrdersPanel({ orders, setOrders, saving, setSaving, setNotice }: {
  orders: AdminOrder[];
  setOrders: React.Dispatch<React.SetStateAction<AdminOrder[]>>;
  saving: string | null;
  setSaving: (value: string | null) => void;
  setNotice: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>(
    Object.fromEntries(orders.map((order) => [order.id, order.tracking_number ?? ""])),
  );
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? orders.filter((order) => `${order.id} ${order.customer_name} ${order.phone}`.toLowerCase().includes(keyword)) : orders;
  }, [orders, query]);

  async function updateOrder(id: string, update: { orderStatus?: OrderStatus; paymentStatus?: PaymentStatus; trackingNumber?: string }, successMessage: string) {
    const operation = `order:${id}`;
    setSaving(operation);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update),
      });
      if (response.status === 401) return redirectToLogin();
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "บันทึกออเดอร์ไม่สำเร็จ");
      setOrders((current) => current.map((order) => order.id === id ? {
        ...order,
        order_status: update.orderStatus ?? order.order_status,
        payment_status: update.paymentStatus ?? order.payment_status,
        tracking_number: update.trackingNumber !== undefined ? update.trackingNumber.trim() || null : order.tracking_number,
      } : order));
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "เชื่อมต่อระบบไม่ได้");
    } finally { setSaving(null); }
  }

  return (
    <section className="admin-panel" aria-labelledby="orders-heading">
      <h2 className="sr-only" id="orders-heading">จัดการออเดอร์</h2>
      <div className="admin-stats">
        <div><span>ทั้งหมด</span><strong>{orders.length}</strong></div>
        <div><span>รอตรวจสลิป</span><strong>{orders.filter((order) => order.payment_status === "waiting_for_slip_review").length}</strong></div>
        <div><span>รอเตรียม/ส่ง</span><strong>{orders.filter((order) => order.payment_status === "paid" && ["received", "preparing"].includes(order.order_status)).length}</strong></div>
      </div>
      <label className="admin-search"><span>ค้นหาออเดอร์</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="เลขออเดอร์ ชื่อ หรือเบอร์โทร" type="search" /></label>
      <div className="order-cards">
        {filtered.length === 0 ? <p className="admin-empty">ยังไม่พบออเดอร์</p> : filtered.map((order) => (
          <article className="admin-order" key={order.id}>
            <div className="admin-order-top"><div><small>{safeThaiDateTime(order.created_at)}</small><h2>{order.id}</h2></div><div className="status-stack"><span className={`status-pill payment-${order.payment_status}`}>{paymentStatusLabels[order.payment_status]}</span><span className={`status-pill status-${order.order_status}`}>{statusLabels[order.order_status]}</span></div></div>
            <div className="admin-order-grid">
              <div><span>ลูกค้า</span><strong>{order.customer_name}</strong><a href={`tel:${phoneHref(order.phone)}`}>{order.phone}</a></div>
              <div><span>สินค้า</span><strong>{order.items}</strong><small>รวม {(order.total ?? order.subtotal).toLocaleString("th-TH")} บาท</small></div>
              <div className="full"><span>{order.fulfilment === "pickup" ? "รับเองหน้าร้าน" : "ที่อยู่จัดส่ง"}</span><p>{order.address}</p>{order.note && <small>หมายเหตุ: {order.note}</small>}{order.admin_note && <small className="verification-note">ผลตรวจสลิป: {order.admin_note}</small>}</div>
            </div>
            <div className="admin-controls">
              <div className="admin-slip-control">{order.slip_key ? <a className="slip-link" href={`/api/admin/slips/${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer">เปิดดูสลิป</a> : <span className="no-slip">ยังไม่มีสลิป</span>}<small>ตรวจเงินเข้าในแอปธนาคารก่อนกดยืนยัน</small></div>
              <label><span>สถานะชำระเงิน</span><select disabled={saving === `order:${order.id}`} value={order.payment_status} onChange={(event) => { const value = event.target.value as PaymentStatus; if (value === "paid" && !window.confirm(`ยืนยันว่าเงินออเดอร์ ${order.id} เข้าจริงแล้ว?`)) return; void updateOrder(order.id, { paymentStatus: value }, `อัปเดตการชำระเงิน ${order.id} แล้ว`); }}>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>สถานะออเดอร์</span><select disabled={saving === `order:${order.id}`} value={order.order_status} onChange={(event) => void updateOrder(order.id, { orderStatus: event.target.value as OrderStatus }, `อัปเดตออเดอร์ ${order.id} แล้ว`)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value} disabled={(order.payment_status !== "paid" && !["received", "cancelled"].includes(value)) || (order.fulfilment === "pickup" && value === "shipped") || (order.fulfilment === "postal" && value === "ready_for_pickup")}>{label}</option>)}</select></label>
              {order.fulfilment === "postal" && <label className="admin-tracking-control"><span>เลขพัสดุ</span><span><input maxLength={100} value={trackingDrafts[order.id] ?? ""} onChange={(event) => setTrackingDrafts((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="กรอกหลังส่งสินค้า" /><button type="button" disabled={saving === `order:${order.id}` || order.payment_status !== "paid"} onClick={() => void updateOrder(order.id, { trackingNumber: trackingDrafts[order.id] ?? "" }, `บันทึกเลขพัสดุ ${order.id} แล้ว`)}>บันทึก</button></span></label>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoundsPanel({ rounds, saving, mutate }: { rounds: AdminRound[]; saving: string | null; mutate: Mutation }) {
  const blankRound: RoundInput = { deliveryDate: "", opensAt: "", closesAt: "", status: "เตรียมเปิด", note: "" };
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RoundInput>(blankRound);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="admin-panel">
      <div className="admin-section-heading"><div><p className="eyebrow">กำหนดวันเปิด-ปิดตะกร้า</p><h2>รอบขาย</h2></div><button className="admin-primary-button" type="button" onClick={() => { setCreating((value) => !value); setEditing(null); }}>＋ เพิ่มรอบ</button></div>
      {creating && <RoundForm title="เพิ่มรอบใหม่" value={draft} disabled={saving !== null} onChange={setDraft} onCancel={() => setCreating(false)} onSubmit={async () => { if (await mutate("round.create", { round: draft }, "เพิ่มรอบขายแล้ว")) { setDraft(blankRound); setCreating(false); } }} />}
      <div className="admin-card-list">
        {rounds.map((round) => editing === round.id ? (
          <RoundForm key={round.id} title={`แก้ไข ${round.id}`} value={draft} disabled={saving !== null} lockDeliveryDate onChange={setDraft} onCancel={() => setEditing(null)} onSubmit={async () => { if (await mutate("round.update", { id: round.id, round: draft }, "บันทึกรอบขายแล้ว")) setEditing(null); }} />
        ) : (
          <article className="admin-cms-card" key={round.id}>
            <div className="admin-card-top"><div><span className={`cms-status status-${round.status === "เปิดรับ" ? "open" : "muted"}`}>{round.status}</span><h3>{round.label || round.id}</h3><small>{round.displayState}</small></div><button type="button" onClick={() => { setDraft(round); setEditing(round.id); setCreating(false); }}>แก้ไข</button></div>
            <dl className="admin-mini-stats"><div><dt>เปิดรับ</dt><dd>{formatInputDateTime(round.opensAt)}</dd></div><div><dt>ปิดรับ</dt><dd>{formatInputDateTime(round.closesAt)}</dd></div><div><dt>ออเดอร์</dt><dd>{round.orderCount}</dd></div><div><dt>ยอดขาย</dt><dd>{round.sales.toLocaleString("th-TH")} ฿</dd></div></dl>
            {round.note && <p>{round.note}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function RoundForm({ title, value, disabled, lockDeliveryDate = false, onChange, onCancel, onSubmit }: { title: string; value: RoundInput; disabled: boolean; lockDeliveryDate?: boolean; onChange: (value: RoundInput) => void; onCancel: () => void; onSubmit: () => void }) {
  return <form className="admin-edit-card" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h3>{title}</h3><div className="admin-form-grid"><label><span>วันจัดส่ง</span><input required type="date" disabled={disabled || lockDeliveryDate} value={value.deliveryDate} onChange={(event) => onChange({ ...value, deliveryDate: event.target.value })} /></label><label><span>เปิดรับตั้งแต่</span><input required type="datetime-local" disabled={disabled} value={value.opensAt} onChange={(event) => onChange({ ...value, opensAt: event.target.value })} /></label><label><span>ปิดรับวันที่</span><input required type="datetime-local" disabled={disabled} value={value.closesAt} onChange={(event) => onChange({ ...value, closesAt: event.target.value })} /></label><label><span>สถานะ</span><select disabled={disabled} value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as RoundInput["status"] })}>{ROUND_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label className="full"><span>หมายเหตุ</span><textarea rows={3} maxLength={500} value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} /></label></div><FormActions disabled={disabled} onCancel={onCancel} /></form>;
}

function ProductsPanel({ products, saving, mutate, setNotice }: { products: AdminProduct[]; saving: string | null; mutate: Mutation; setNotice: (value: string) => void }) {
  const blank: ProductInput = { id: "", name: "", unit: "", detail: "", price: null, status: "รอข้อมูล", imageUrl: "" };
  const [draft, setDraft] = useState<ProductInput>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadImage(file: File) {
    setUploading(true); setNotice("");
    try {
      const form = new FormData(); form.set("image", file); form.set("productId", draft.id || "PRODUCT");
      const response = await fetch("/api/admin/product-image", { method: "POST", body: form });
      if (response.status === 401) return redirectToLogin();
      const result = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !result.imageUrl) throw new Error(result.error ?? "อัปโหลดรูปไม่สำเร็จ");
      setDraft((current) => ({ ...current, imageUrl: result.imageUrl ?? current.imageUrl }));
      setNotice("อัปโหลดรูปแล้ว กดบันทึกสินค้าเพื่อใช้งาน");
    } catch (error) { setNotice(error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ"); }
    finally { setUploading(false); }
  }

  return <section className="admin-panel"><div className="admin-section-heading"><div><p className="eyebrow">รายการบนหน้าเว็บเรียงตามนี้</p><h2>สินค้า</h2></div><button className="admin-primary-button" type="button" onClick={() => { setDraft(blank); setCreating((value) => !value); setEditing(null); }}>＋ เพิ่มสินค้า</button></div>
    {creating && <ProductForm title="เพิ่มสินค้าใหม่" value={draft} disabled={saving !== null || uploading} uploading={uploading} onChange={setDraft} onUpload={uploadImage} onCancel={() => setCreating(false)} onSubmit={async () => { if (await mutate("product.create", { product: draft }, "เพิ่มสินค้าแล้ว")) { setDraft(blank); setCreating(false); } }} />}
    <div className="admin-card-list">{products.map((product, index) => editing === product.id ? <ProductForm key={product.id} title={`แก้ไข ${product.name}`} value={draft} disabled={saving !== null || uploading} uploading={uploading} lockId onChange={setDraft} onUpload={uploadImage} onCancel={() => setEditing(null)} onSubmit={async () => { if (await mutate("product.update", { product: draft }, "บันทึกสินค้าแล้ว")) setEditing(null); }} /> : <article className={`admin-cms-card product-admin-card${product.status === "ซ่อนสินค้า" ? " is-archived" : ""}`} key={product.id}><div className="admin-product-summary"><div className="admin-product-thumb">{product.imageUrl ? <Image src={adminImageSrc(product.imageUrl)} alt="" fill sizes="72px" unoptimized /> : <span aria-hidden="true">รูป</span>}</div><div><span className={`cms-status status-${product.status === "เปิดขาย" ? "open" : "muted"}`}>{product.status}</span><h3>{product.name}</h3><p>{product.unit} · {product.price === null ? "รอราคา" : `${product.price.toLocaleString("th-TH")} บาท`}</p></div></div><p className="admin-product-detail">{product.detail || "ยังไม่มีคำอธิบาย"}</p><div className="admin-card-actions"><button type="button" disabled={index === 0 || saving !== null} aria-label={`เลื่อน ${product.name} ขึ้น`} onClick={() => void mutate("product.move", { id: product.id, direction: "up", fingerprint: product.fingerprint }, "เรียงสินค้าแล้ว")}>↑ ขึ้น</button><button type="button" disabled={index === products.length - 1 || saving !== null} aria-label={`เลื่อน ${product.name} ลง`} onClick={() => void mutate("product.move", { id: product.id, direction: "down", fingerprint: product.fingerprint }, "เรียงสินค้าแล้ว")}>↓ ลง</button><button type="button" onClick={() => { setDraft(product); setEditing(product.id); setCreating(false); }}>แก้ไข</button>{product.status !== "ซ่อนสินค้า" ? <button className="danger" type="button" onClick={() => { if (window.confirm(`ซ่อน ${product.name} จากหน้าร้าน? ประวัติออเดอร์เก่าจะยังอยู่`)) void mutate("product.update", { product: { ...product, status: "ซ่อนสินค้า" } }, "ซ่อนสินค้าแล้ว"); }}>ซ่อน</button> : <button type="button" onClick={() => void mutate("product.update", { product: { ...product, status: "ปิดชั่วคราว" } }, "นำสินค้ากลับมาแล้ว")}>นำกลับ</button>}</div></article>)}</div>
  </section>;
}

function ProductForm({ title, value, disabled, uploading, lockId = false, onChange, onUpload, onCancel, onSubmit }: { title: string; value: ProductInput; disabled: boolean; uploading: boolean; lockId?: boolean; onChange: (value: ProductInput) => void; onUpload: (file: File) => void; onCancel: () => void; onSubmit: () => void }) {
  return <form className="admin-edit-card" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h3>{title}</h3><div className="admin-form-grid"><label><span>รหัสสินค้า (อังกฤษ)</span><input required disabled={disabled || lockId} maxLength={40} value={value.id} onChange={(event) => onChange({ ...value, id: event.target.value.toUpperCase() })} placeholder="เช่น MOO001" /></label><label><span>ชื่อสินค้า</span><input required disabled={disabled} maxLength={100} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label><label><span>หน่วยขาย</span><input disabled={disabled} maxLength={80} value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} placeholder="เช่น 1 แพ็ค" /></label><label><span>ราคา (บาท)</span><input disabled={disabled} min="1" max="1000000" step="1" type="number" value={value.price ?? ""} onChange={(event) => onChange({ ...value, price: event.target.value ? Number(event.target.value) : null })} /></label><label className="full"><span>คำอธิบายสินค้า</span><textarea disabled={disabled} maxLength={500} rows={3} value={value.detail} onChange={(event) => onChange({ ...value, detail: event.target.value })} /></label><label><span>สถานะ</span><select disabled={disabled} value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ProductInput["status"] })}>{PRODUCT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label className="admin-file-field"><span>รูปสินค้า</span><input disabled={disabled} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); }} /><small>{uploading ? "กำลังอัปโหลด…" : "JPG, PNG หรือ WebP ไม่เกิน 5 MB"}</small></label>{value.imageUrl && <div className="admin-image-preview full"><Image src={adminImageSrc(value.imageUrl)} alt="ตัวอย่างรูปสินค้า" fill sizes="320px" unoptimized /></div>}</div><FormActions disabled={disabled} onCancel={onCancel} /></form>;
}

function StorefrontPanel({ settings, saving, mutate }: { settings: AdminStorefrontSettings; saving: string | null; mutate: Mutation }) {
  const [draft, setDraft] = useState(settings);
  function field<K extends keyof AdminStorefrontSettings>(key: K, value: AdminStorefrontSettings[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  return <section className="admin-panel"><div className="admin-section-heading"><div><p className="eyebrow">ข้อความนี้แสดงบนเว็บจริง</p><h2>หน้าร้าน</h2></div><Link className="admin-preview-link" href="/" target="_blank">เปิดดู ↗</Link></div><form className="admin-edit-card storefront-editor" onSubmit={(event) => { event.preventDefault(); void mutate("settings.update", { settings: draft }, "บันทึกหน้าร้านแล้ว ลูกค้าจะเห็นภายใน 30 วินาที"); }}><div className="admin-form-group"><h3>ส่วนบนหน้าเว็บ</h3><div className="admin-form-grid"><label className="full"><span>ชื่อร้าน</span><input required maxLength={100} value={draft.storeName} onChange={(event) => field("storeName", event.target.value)} /></label><label><span>หัวข้อหลัก</span><input required maxLength={100} value={draft.heroTitle} onChange={(event) => field("heroTitle", event.target.value)} /></label><label><span>ข้อความสีแดง</span><input required maxLength={100} value={draft.heroHighlight} onChange={(event) => field("heroHighlight", event.target.value)} /></label><label className="full"><span>คำแนะนำร้าน</span><textarea required maxLength={500} rows={4} value={draft.heroDescription} onChange={(event) => field("heroDescription", event.target.value)} /></label><label className="full"><span>ข้อความแถบประกาศ</span><textarea required maxLength={300} rows={3} value={draft.announcementText} onChange={(event) => field("announcementText", event.target.value)} /></label></div></div><div className="admin-form-group"><h3>เรื่องของร้าน</h3><div className="admin-form-grid"><label className="full"><span>หัวข้อ</span><input required maxLength={120} value={draft.storyTitle} onChange={(event) => field("storyTitle", event.target.value)} /></label><label className="full"><span>เนื้อหา</span><textarea required maxLength={1000} rows={5} value={draft.storyDescription} onChange={(event) => field("storyDescription", event.target.value)} /></label></div></div><div className="admin-form-group"><h3>การติดต่อและจัดส่ง</h3><div className="admin-form-grid"><label><span>เบอร์หลัก</span><input required inputMode="tel" value={draft.phonePrimary} onChange={(event) => field("phonePrimary", event.target.value)} /></label><label><span>เบอร์สำรอง</span><input required inputMode="tel" value={draft.phoneSecondary} onChange={(event) => field("phoneSecondary", event.target.value)} /></label><label><span>ค่าส่งไปรษณีย์</span><input min="0" max="100000" type="number" value={draft.shippingFee ?? ""} onChange={(event) => field("shippingFee", event.target.value ? Number(event.target.value) : null)} /></label><label className="full"><span>ที่อยู่รับเองหน้าร้าน</span><textarea maxLength={500} rows={4} value={draft.pickupAddress} onChange={(event) => field("pickupAddress", event.target.value)} /></label><label className="full"><span>ลิงก์ Google Maps</span><input type="url" maxLength={500} value={draft.pickupMapUrl} onChange={(event) => field("pickupMapUrl", event.target.value)} /></label></div></div><button className="admin-save-button" type="submit" disabled={saving !== null}>{saving ? "กำลังบันทึก…" : "บันทึกและอัปเดตหน้าร้าน"}</button></form></section>;
}

function FormActions({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) { return <div className="admin-form-actions"><button type="button" onClick={onCancel}>ยกเลิก</button><button className="admin-save-button" type="submit" disabled={disabled}>{disabled ? "กำลังบันทึก…" : "บันทึก"}</button></div>; }

type Mutation = (action: string, payload: Record<string, unknown>, successMessage: string) => Promise<boolean | void>;

function redirectToLogin() { window.location.assign(`/admin/login?returnTo=${encodeURIComponent("/admin")}`); }
function phoneHref(value: string) { return value.replace(/[^\d+]/g, ""); }
function safeThaiDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("th-TH"); }
function formatInputDateTime(value: string) { if (!value) return "—"; const [date, time] = value.split("T"); const [year, month, day] = date.split("-"); return `${day}/${month}/${year} ${time ?? ""}`; }
function adminImageSrc(value: string) { try { const url = new URL(value); return url.pathname.startsWith("/products/") ? `/media${url.pathname}` : "/images/products/product-placeholder.svg"; } catch { return value.startsWith("/media/products/") ? value : "/images/products/product-placeholder.svg"; } }
