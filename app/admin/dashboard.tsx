"use client";

import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminOrder, OrderStatus, PaymentStatus } from "../../db/orders";
import {
  PRODUCT_STATUSES,
  ROUND_STATUSES,
  roundLabelFromRoundId,
  type AdminCmsData,
  type AdminProduct,
  type AdminRound,
  type AdminStorefrontSettings,
  type ProductInput,
  type RoundInput,
} from "../../lib/admin-cms";
import { CustomerFacingError, PUBLIC_ERROR_MESSAGES, safeClientApiMessage } from "../../lib/public-errors";
import { categoryNamesFromProducts, orderCategoryNames } from "../../lib/category-order";
import { productSales, salesBreakdown } from "../../lib/order-sales-summary";
import type { CarrierCode } from "../../lib/carriers";
import { ConfirmDialog } from "./confirm-dialog";
import { AdminIcon, type AdminIconName } from "./icons";
import { TrackingImportPanel } from "./tracking-import-panel";
import {
  downloadCanvasesAsPdf,
  buildStickerPdfFilename,
  cleanRoundForFilename,
} from "../../lib/sticker-pdf";

type AdminTab = "orders" | "stickers" | "rounds" | "products" | "storefront";
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
  { id: "stickers", icon: "printer", label: "พิมพ์สติ๊กเกอร์" },
  { id: "rounds", icon: "calendar", label: "รอบขาย" },
  { id: "products", icon: "products", label: "สินค้า" },
  { id: "storefront", icon: "store", label: "หน้าร้าน" },
];
const EMPTY_ROUND_INPUT: RoundInput = { deliveryDate: "", opensAt: "", closesAt: "", status: "เตรียมเปิด", note: "", productScope: "all", productIds: [] };
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
  // Keep navigation visible even while the storefront form is dirty —
  // changeTab already guards unsaved edits with a confirm dialog, so hiding
  // the nav only traps the admin on the page with no way out.
  const isNavHidden = formActive;

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

  // Opening a create/edit form hides the header and collapses the page to
  // just the form. Without resetting scroll, the browser clamps whatever
  // scroll offset the admin was at (e.g. deep in a long product list) to the
  // new, much shorter page height — an uncontrolled jump that can land
  // anywhere, including on top of the save button.
  useEffect(() => {
    if (isNavHidden) window.scrollTo(0, 0);
  }, [isNavHidden]);

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

  const [printTargetOrders, setPrintTargetOrders] = useState<AdminOrder[]>([]);

  function handlePrintStickers(targetOrders: AdminOrder[]) {
    triggerShippingStickersPrint(targetOrders, setPrintTargetOrders);
  }

  return (
    <>
      <main className={`admin-shell ${isNavHidden ? "form-active" : ""}`}>
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
                  <span className="admin-brand-logo"><Image src={adminImageSrc(cms.settings.storeLogoUrl) || "/images/products/jae-noi-shop-logo.jpg"} alt={`โลโก้ ${cms.settings.storeName}`} fill sizes="48px" /></span>
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
                  {/* Signing out belongs to Cloudflare Access now that it owns the
                      session. Clearing anything on our side would leave the Access
                      cookie intact and log the admin straight back in. */}
                  <a href="/cdn-cgi/access/logout" className="admin-drawer-logout-btn"><AdminIcon name="logout" /><span>ออกจากระบบ</span></a>
                </div>
              </div>
            </aside>
          </>
        )}

        <p className={`admin-save-notice${notice ? " has-message" : ""}`} aria-live="polite" role="status">{notice}</p>
        {activeTab === "orders" && <OrdersPanel orders={orders} setOrders={setOrders} saving={saving} setSaving={setSaving} setNotice={setNotice} onPrintStickers={handlePrintStickers} />}
        {activeTab === "stickers" && <StickerPanel orders={orders} onPrintStickers={handlePrintStickers} />}
        {activeTab === "rounds" && <RoundsPanel rounds={cms.rounds} products={cms.products} saving={saving} mutate={mutate} onFormActive={setFormActive} onFormDirty={setFormDirty} />}
        {activeTab === "products" && <ProductsPanel products={cms.products} categoryOrder={cms.categoryOrder} saving={saving} mutate={mutate} setNotice={setNotice} onFormActive={setFormActive} onFormDirty={setFormDirty} />}
        {activeTab === "storefront" && <StorefrontPanel key={cms.settings.fingerprint} settings={cms.settings} saving={saving} mutate={mutate} setNotice={setNotice} onFormActive={setFormActive} onFormDirty={setFormDirty} />}

        <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
      </main>
      <ShippingStickerPrintArea orders={printTargetOrders} />
    </>
  );
}

type StatusDraft = { orderStatus: OrderStatus; paymentStatus: PaymentStatus };

function drawStickerCanvas(order: AdminOrder): HTMLCanvasElement {
  const scale = 4;
  const width = Math.round(77 * 3.7795 * scale);
  const height = Math.round(30 * 3.7795 * scale);
  const marginLeft = Math.round(10 * 3.7795 * scale);
  const marginRight = Math.round(10 * 3.7795 * scale);
  const contentWidth = width - marginLeft - marginRight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // 1. Header (Shop Name + Order ID)
  ctx.fillStyle = "#000000";
  ctx.font = `bold ${Math.round(6.5 * 3.7795 * scale / 2.8)}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "top";
  const shopTitle = "ร้านเจ๊น้อย เขียงหมู";
  ctx.fillText(shopTitle, marginLeft, Math.round(1.5 * 3.7795 * scale), contentWidth * 0.45);

  ctx.font = `bold ${Math.round(6.5 * 3.7795 * scale / 2.8)}px monospace`;
  const orderIdWidth = ctx.measureText(order.id).width;
  const orderIdX = Math.max(marginLeft + contentWidth * 0.46, width - marginRight - orderIdWidth);
  ctx.fillText(order.id, orderIdX, Math.round(1.5 * 3.7795 * scale), contentWidth * 0.52);

  // Solid Divider Line
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.round(0.8 * scale);
  ctx.beginPath();
  ctx.moveTo(marginLeft, Math.round(7 * 3.7795 * scale));
  ctx.lineTo(width - marginRight, Math.round(7 * 3.7795 * scale));
  ctx.stroke();

  // 2. Recipient
  ctx.font = `bold ${Math.round(8.5 * 3.7795 * scale / 2.8)}px system-ui, -apple-system, sans-serif`;
  const recipientText = `ผู้รับ: ${order.customer_name} (${order.phone})`;
  ctx.fillText(recipientText, marginLeft, Math.round(8.5 * 3.7795 * scale), contentWidth);

  // 3. Address (2 lines wrap with auto-fit)
  ctx.font = `${Math.round(7 * 3.7795 * scale / 2.8)}px system-ui, -apple-system, sans-serif`;
  const addressText = `ที่อยู่: ${order.address || "รับเองหน้าร้าน"}`;
  
  const words = addressText.split(" ");
  let line = "";
  let yPos = Math.round(14 * 3.7795 * scale);
  const lineHeight = Math.round(3.5 * 3.7795 * scale);
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + (line ? " " : "") + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > contentWidth && i > 0) {
      ctx.fillText(line, marginLeft, yPos, contentWidth);
      line = words[i];
      yPos += lineHeight;
      lineCount++;
      if (lineCount >= 2) break;
    } else {
      line = testLine;
    }
  }
  if (lineCount < 2 && line) {
    ctx.fillText(line, marginLeft, yPos, contentWidth);
  }

  // Dashed Divider Line
  ctx.setLineDash([Math.round(2 * scale), Math.round(2 * scale)]);
  ctx.beginPath();
  ctx.moveTo(marginLeft, Math.round(22.5 * 3.7795 * scale));
  ctx.lineTo(width - marginRight, Math.round(22.5 * 3.7795 * scale));
  ctx.stroke();
  ctx.setLineDash([]);

  // 4. Items List
  ctx.font = `${Math.round(6.5 * 3.7795 * scale / 2.8)}px system-ui, -apple-system, sans-serif`;
  const itemsText = `สินค้า: ${order.items ? order.items.replace(/\n+/g, ", ") : "—"}`;
  ctx.fillText(itemsText, marginLeft, Math.round(24 * 3.7795 * scale), contentWidth);

  return canvas;
}

type StickerImageFile = { blob: Blob; filename: string };
type StickerExportResult = "downloaded" | "shared" | "opened" | "cancelled";

function createStickerImageFile(order: AdminOrder): StickerImageFile {
  const canvas = drawStickerCanvas(order);
  const dataUrl = canvas.toDataURL("image/png");
  const [, encoded] = dataUrl.split(",", 2);
  if (!encoded) throw new Error("สร้างภาพ PNG ไม่สำเร็จ");

  // Convert the data URL synchronously so the following share/download call
  // still runs within the user's tap gesture. Safari on iPhone may block an
  // anchor click that happens after a timer or an awaited canvas.toBlob().
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const roundPart = cleanRoundForFilename(order.round_id);
  return {
    blob: new Blob([bytes], { type: "image/png" }),
    filename: `shipping-label-${roundPart ? `${roundPart}-` : ""}${order.id}.png`,
  };
}

function handleDownloadStickerPdf(order: AdminOrder) {
  const canvas = drawStickerCanvas(order);
  const filename = buildStickerPdfFilename([order]);
  downloadCanvasesAsPdf([canvas], filename);
}

function handleDownloadBatchPdf(orders: AdminOrder[], filename?: string) {
  if (orders.length === 0) return;
  const canvases = orders.map((order) => drawStickerCanvas(order));
  const finalFilename = buildStickerPdfFilename(orders, filename);
  downloadCanvasesAsPdf(canvases, finalFilename);
}

function isAppleTouchDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function releaseStickerObjectUrl(url: string) {
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function downloadStickerFile(file: StickerImageFile) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.download = file.filename;
  link.href = url;
  link.click();
  releaseStickerObjectUrl(url);
}

function canShareStickerFiles(files: File[]) {
  if (typeof navigator.share !== "function") return false;
  try {
    return typeof navigator.canShare !== "function" || navigator.canShare({ files });
  } catch {
    return false;
  }
}

async function shareStickerFiles(files: File[]): Promise<StickerExportResult> {
  if (canShareStickerFiles(files)) {
    try {
      await navigator.share({ files });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  if (files.length > 1) {
    throw new Error("อุปกรณ์นี้ไม่รองรับการบันทึกหลายภาพพร้อมกัน กรุณาใช้ปุ่มพิมพ์หรือเลือกทีละภาพ");
  }

  const url = URL.createObjectURL(files[0]);
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  releaseStickerObjectUrl(url);
  if (popup) return "opened";

  // Best-effort fallback for browsers that block a new tab. Desktop browsers
  // still download the file, while iOS will show the guidance notice below.
  downloadStickerFile({ blob: files[0], filename: files[0].name });
  return "downloaded";
}

async function handleDownloadBatchImages(orders: AdminOrder[]): Promise<StickerExportResult> {
  const files = orders.map((order) => {
    const image = createStickerImageFile(order);
    return new File([image.blob], image.filename, { type: "image/png" });
  });

  if (canShareStickerFiles(files) || isAppleTouchDevice()) return shareStickerFiles(files);

  files.forEach((file, index) => {
    window.setTimeout(() => downloadStickerFile({ blob: file, filename: file.name }), index * 250);
  });
  return "downloaded";
}

const slipBlobCache = new Map<string, Promise<Blob>>();

function preloadSlipBlob(orderId: string): Promise<Blob> {
  let promise = slipBlobCache.get(orderId);
  if (!promise) {
    promise = fetch(`/api/admin/slips/${encodeURIComponent(orderId)}`).then((res) => {
      if (!res.ok) throw new Error("ไม่สามารถโหลดรูปสลิปได้");
      return res.blob();
    });
    slipBlobCache.set(orderId, promise);
  }
  return promise;
}

async function handleShareSlip(orderId: string) {
  try {
    const blob = await preloadSlipBlob(orderId);
    const isJpeg = blob.type.includes("jpeg") || blob.type.includes("jpg");
    const ext = isJpeg ? "jpg" : "png";
    const file = new File([blob], `slip-${orderId}.${ext}`, { type: blob.type || "image/jpeg" });

    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slip-${orderId}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch {
    window.open(`/api/admin/slips/${encodeURIComponent(orderId)}`, "_blank");
  }
}

function stickerExportNotice(result: StickerExportResult, count: number) {
  if (result === "shared") return `เปิดเมนูแชร์แล้ว เลือก “บันทึกภาพ” เพื่อเก็บ PNG${count > 1 ? ` จำนวน ${count} ภาพ` : ""}`;
  if (result === "opened") return "เปิดภาพ PNG ในแท็บใหม่แล้ว กดค้างที่ภาพเพื่อบันทึกลงเครื่อง";
  if (result === "cancelled") return "ยกเลิกการแชร์ไฟล์แล้ว ไฟล์ยังไม่ได้ถูกบันทึก";
  return `เริ่มดาวน์โหลด PNG แล้ว ${count} ภาพ`;
}

function triggerShippingStickersPrint(targetOrders: AdminOrder[], setPrintTargetOrders: (orders: AdminOrder[]) => void) {
  if (targetOrders.length === 0) return;
  setPrintTargetOrders(targetOrders);
  document.body.classList.add("print-shipping-label");

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    document.body.classList.remove("print-shipping-label");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // Give React time to commit DOM nodes before opening the print sheet
  requestAnimationFrame(() => {
    setTimeout(() => {
      window.print();
    }, 200);
  });
}

function ShippingStickerPrintArea({ orders }: { orders: AdminOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <div className="shipping-label-print-area">
      {orders.map((order) => {
        const canvas = drawStickerCanvas(order);
        const dataUrl = canvas.toDataURL("image/png");
        return (
          <div className="shipping-sticker-page" key={order.id}>
            <img
              src={dataUrl}
              alt={`สติ๊กเกอร์ ${order.id}`}
              className="shipping-sticker-img"
            />
          </div>
        );
      })}
    </div>
  );
}

function StickerPanel({ orders, onPrintStickers }: { orders: AdminOrder[]; onPrintStickers: (targets: AdminOrder[]) => void }) {
  const [postalOnly, setPostalOnly] = useState(true);
  const [busyRound, setBusyRound] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState("");

  const rounds = useMemo(() => {
    const grouped = new Map<string, AdminOrder[]>();
    for (const order of orders) {
      if (order.order_status === "cancelled") continue;
      const key = order.round_id || "ไม่ระบุรอบ";
      const bucket = grouped.get(key);
      if (bucket) bucket.push(order); else grouped.set(key, [order]);
    }
    return Array.from(grouped, ([roundId, roundOrders]) => ({
      roundId,
      label: roundLabelFromRoundId(roundId),
      orders: roundOrders,
      postal: roundOrders.filter((order) => order.fulfilment === "postal"),
    })).sort((left, right) => right.roundId.localeCompare(left.roundId));
  }, [orders]);

  function printableOrders(round: { orders: AdminOrder[]; postal: AdminOrder[] }) {
    return postalOnly ? round.postal : round.orders;
  }

  function printRound(roundId: string, targets: AdminOrder[]) {
    void roundId;
    onPrintStickers(targets);
  }

  async function exportRound(roundId: string, targets: AdminOrder[]) {
    if (targets.length === 0) return;
    setBusyRound(roundId);
    setExportNotice("");
    try {
      const result = await handleDownloadBatchImages(targets);
      setExportNotice(stickerExportNotice(result, targets.length));
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : "บันทึก PNG ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusyRound(null);
    }
  }

  return <section className="admin-panel">
    <div className="admin-section-heading">
      <div>
        <p className="eyebrow">สติ๊กเกอร์ 77 × 30 มม. สำหรับแปะหน้ากล่อง</p>
        <h2>พิมพ์สติ๊กเกอร์ตามรอบ</h2>
      </div>
    </div>

    <label className="admin-sticker-scope">
      <input type="checkbox" checked={postalOnly} onChange={(event) => setPostalOnly(event.target.checked)} />
      <span>
        <strong>เฉพาะออเดอร์ที่ต้องจัดส่ง</strong>
        <small>ออเดอร์รับเองหน้าร้านไม่ต้องแปะสติ๊กเกอร์ ติ๊กออกถ้าอยากพิมพ์ทุกออเดอร์ในรอบ</small>
      </span>
    </label>

    {rounds.length === 0 ? (
      <div className="admin-empty"><AdminIcon name="printer" /><h3>ยังไม่มีออเดอร์ให้พิมพ์</h3><p>เมื่อมีออเดอร์เข้ามา รอบจัดส่งจะขึ้นที่นี่</p></div>
    ) : (
      <div className="admin-sticker-rounds">
        {rounds.map((round) => {
          const targets = printableOrders(round);
          const pickupCount = round.orders.length - round.postal.length;
          return (
            <article className="admin-sticker-round" key={round.roundId}>
              <div className="admin-sticker-round-head">
                <h3>{round.label}</h3>
                <span className="admin-sticker-round-id">{round.roundId}</span>
              </div>
              <dl className="admin-mini-stats">
                <div><dt>ออเดอร์ทั้งรอบ</dt><dd>{round.orders.length}</dd></div>
                <div><dt>ต้องจัดส่ง</dt><dd>{round.postal.length}</dd></div>
                <div><dt>รับหน้าร้าน</dt><dd>{pickupCount}</dd></div>
                <div><dt>จะพิมพ์</dt><dd>{targets.length} ดวง</dd></div>
              </dl>
              {targets.length === 0 ? (
                <p className="admin-sticker-none">{postalOnly ? "รอบนี้ไม่มีออเดอร์ที่ต้องจัดส่ง" : "รอบนี้ยังไม่มีออเดอร์"}</p>
              ) : (
                <div className="admin-sticker-actions">
                  <button type="button" className="admin-print-sticker-btn" onClick={() => printRound(round.roundId, targets)}>
                    <AdminIcon name="printer" /> พิมพ์ทั้งรอบ ({targets.length})
                  </button>
                  <button type="button" className="admin-print-sticker-btn" onClick={() => handleDownloadBatchPdf(targets, `shipping-labels-${round.roundId}.pdf`)}>
                    <AdminIcon name="download" /> ดาวน์โหลด PDF ({targets.length})
                  </button>
                  <button type="button" className="admin-print-sticker-btn" disabled={busyRound === round.roundId} onClick={() => void exportRound(round.roundId, targets)}>
                    <AdminIcon name="download" /> {busyRound === round.roundId ? "กำลังบันทึก…" : `บันทึก PNG (${targets.length})`}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    )}
    {exportNotice && <p className="admin-save-notice has-message" role="status" aria-live="polite">{exportNotice}</p>}
  </section>;
}

function OrdersPanel({ orders, setOrders, saving, setSaving, setNotice, onPrintStickers }: { orders: AdminOrder[]; setOrders: React.Dispatch<React.SetStateAction<AdminOrder[]>>; saving: string | null; setSaving: (value: string | null) => void; setNotice: (value: string) => void; onPrintStickers: (targets: AdminOrder[]) => void }) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<OrderRange>("today");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [selectedRound, setSelectedRound] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [orderExportNotice, setOrderExportNotice] = useState("");
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>(() => Object.fromEntries(orders.map((order) => [order.id, order.tracking_number ?? ""])));
  const [carrierDrafts, setCarrierDrafts] = useState<Record<string, CarrierCode>>(() => Object.fromEntries(orders.map((order) => [order.id, order.carrier_code ?? "flash"])));
  // Status dropdowns used to write straight to the server on every change.
  // They now stage into this per-order draft instead, so nothing persists
  // until the admin presses "บันทึกสถานะ" — matching how every other panel
  // requires an explicit save.
  const [statusDrafts, setStatusDrafts] = useState<Record<string, StatusDraft>>({});
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
    const matchesRound = selectedRound === "all" || (order.round_id || "ไม่ระบุรอบ") === selectedRound;
    return matchesQuery && matchesRange && matchesFilter && matchesRound;
  }), [filter, orders, query, range, selectedRound]);

  function handlePrintStickers(targetOrders: AdminOrder[]) {
    onPrintStickers(targetOrders);
  }

  async function exportOrdersAsImages(targetOrders: AdminOrder[]) {
    if (targetOrders.length === 0 || exporting) return;
    setExporting(true);
    setOrderExportNotice("");
    try {
      const result = await handleDownloadBatchImages(targetOrders);
      setOrderExportNotice(stickerExportNotice(result, targetOrders.length));
    } catch (error) {
      setOrderExportNotice(error instanceof Error ? error.message : "บันทึก PNG ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setExporting(false);
    }
  }

  function toggleSelectOrder(orderId: string) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedOrderIds.size === filtered.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filtered.map((order) => order.id)));
    }
  }

  function draftFor(order: AdminOrder): StatusDraft {
    return statusDrafts[order.id] ?? { orderStatus: order.order_status, paymentStatus: order.payment_status };
  }
  function setDraftField(order: AdminOrder, patch: Partial<StatusDraft>) {
    setStatusDrafts((current) => ({ ...current, [order.id]: { ...draftFor(order), ...patch } }));
  }
  function clearDraft(orderId: string) {
    setStatusDrafts((current) => { if (!(orderId in current)) return current; const next = { ...current }; delete next[orderId]; return next; });
  }



  const summary = useMemo(() => ({
    total: filtered.length,
    paidSales: filtered.filter((order) => order.payment_status === "paid" && order.order_status !== "cancelled").reduce((sum, order) => sum + (order.total ?? 0), 0),
    pending: filtered.filter((order) => order.payment_status === "waiting_for_slip_review").length,
    preparing: filtered.filter((order) => order.order_status === "preparing").length,
  }), [filtered]);
  // Both follow the active range/search/status filter, so the breakdown and the
  // best sellers always describe exactly the orders listed below them.
  const breakdown = useMemo(() => salesBreakdown(filtered), [filtered]);
  const bestSellers = useMemo(() => productSales(filtered), [filtered]);
  const byRound = useMemo(() => Array.from(orders.filter((order) => {
    const normalized = query.trim().toLowerCase();
    const matchesQuery = !normalized || `${order.id} ${order.customer_name} ${order.phone}`.toLowerCase().includes(normalized);
    const matchesRange = inOrderRange(order.created_at, range);
    const matchesFilter = filter === "all"
      || (filter === "attention" && ["waiting_for_slip_review", "invalid_slip"].includes(order.payment_status))
      || (filter === "pending_slip" && order.payment_status === "waiting_for_slip_review")
      || (filter === "paid" && order.payment_status === "paid")
      || (filter === "shipped" && ["shipped", "completed"].includes(order.order_status));
    return matchesQuery && matchesRange && matchesFilter;
  }).reduce((map, order) => {
    const key = order.round_id || "ไม่ระบุรอบ";
    const current = map.get(key) ?? { count: 0, sales: 0 };
    current.count += 1;
    if (order.payment_status === "paid" && order.order_status !== "cancelled") current.sales += order.total ?? 0;
    map.set(key, current); return map;
  }, new Map<string, { count: number; sales: number }>()).entries()), [filter, orders, query, range]);

  async function updateOrder(id: string, patch: { orderStatus?: OrderStatus; paymentStatus?: PaymentStatus; trackingNumber?: string; carrierCode?: CarrierCode | null }, success: string) {
    setSaving(`order:${id}`); setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (response.status === 401) return redirectToLogin();
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE"));
      setOrders((current) => current.map((order) => order.id === id ? { ...order, ...(patch.orderStatus ? { order_status: patch.orderStatus } : {}), ...(patch.paymentStatus ? { payment_status: patch.paymentStatus } : {}), ...(patch.trackingNumber !== undefined ? { tracking_number: patch.trackingNumber || null } : {}), ...(patch.carrierCode !== undefined ? { carrier_code: patch.carrierCode } : {}) } : order));
      setNotice(success);
    } catch (error) { setNotice(error instanceof CustomerFacingError ? error.message : PUBLIC_ERROR_MESSAGES.ADMIN_UNAVAILABLE); }
    finally { setSaving(null); }
  }

  // Payment-status changes the customer can see (and that are hard to walk
  // back) all require an explicit confirmation, not just "paid" — on top of
  // the draft/save step every field now goes through.
  function saveOrderStatus(order: AdminOrder) {
    const draft = draftFor(order);
    const orderChanged = draft.orderStatus !== order.order_status;
    const paymentChanged = draft.paymentStatus !== order.payment_status;
    if (!orderChanged && !paymentChanged) return;
    const commit = async () => {
      const patch: { orderStatus?: OrderStatus; paymentStatus?: PaymentStatus } = {};
      if (orderChanged) patch.orderStatus = draft.orderStatus;
      if (paymentChanged) patch.paymentStatus = draft.paymentStatus;
      const success = paymentChanged
        ? (draft.paymentStatus === "paid" ? `ยืนยันการชำระเงิน ${order.id} แล้ว` : `อัปเดตการชำระเงิน ${order.id} แล้ว`)
        : `อัปเดตออเดอร์ ${order.id} แล้ว`;
      await updateOrder(order.id, patch, success);
      clearDraft(order.id);
    };
    const prompts: Partial<Record<PaymentStatus, { title: string; description: string; confirmLabel: string; tone?: "danger" | "primary" }>> = {
      paid: { title: "ยืนยันว่าเงินเข้าแล้ว", description: `ตรวจยอด ${formatMoney(order.total)} ของออเดอร์ ${order.id} ในแอปธนาคารแล้วใช่ไหม?`, confirmLabel: "ยืนยันชำระแล้ว" },
      refunded: { title: "ยืนยันว่าคืนเงินแล้ว", description: `ออเดอร์ ${order.id} จะแสดงสถานะ "คืนเงินแล้ว" ให้ลูกค้าเห็นทันที ยืนยันว่าโอนเงิน ${formatMoney(order.total)} คืนเรียบร้อยแล้วใช่ไหม?`, confirmLabel: "ยืนยันคืนเงินแล้ว", tone: "danger" },
      invalid_slip: { title: "แจ้งว่าสลิปไม่ถูกต้อง?", description: `ออเดอร์ ${order.id} จะแสดงสถานะ "สลิปไม่ถูกต้อง" ให้ลูกค้าเห็น และถูกนับเป็นรายการที่ต้องตรวจ`, confirmLabel: "ยืนยันสลิปไม่ถูกต้อง", tone: "danger" },
    };
    const prompt = paymentChanged ? prompts[draft.paymentStatus] : undefined;
    if (!prompt) { void commit(); return; }
    setConfirm({ ...prompt, action: commit });
  }

  return <section className="admin-panel admin-orders-panel">
    <div className="admin-section-heading"><div><p className="eyebrow">จัดการงานประจำวัน</p><h2>ออเดอร์</h2></div><span className="admin-result-count">{filtered.length} รายการ</span></div>
    <TrackingImportPanel onImported={(updates) => {
      const byOrder = new Map(updates.map((update) => [update.orderId, update]));
      setOrders((current) => current.map((order) => {
        const update = byOrder.get(order.id);
        return update ? { ...order, tracking_number: update.trackingNumber, carrier_code: update.carrierCode, order_status: "shipped" } : order;
      }));
      setTrackingDrafts((current) => ({ ...current, ...Object.fromEntries(updates.map((update) => [update.orderId, update.trackingNumber])) }));
    }} />
    <div className="admin-filter-stack">
      <div className="admin-segmented" aria-label="ช่วงเวลา">{(["today", "7days", "all"] as OrderRange[]).map((value) => <button key={value} type="button" className={range === value ? "active" : ""} onClick={() => setRange(value)}>{value === "today" ? "วันนี้" : value === "7days" ? "7 วัน" : "ทั้งหมด"}</button>)}</div>
      <label className="admin-search"><span className="sr-only">ค้นหาออเดอร์</span><AdminIcon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเลขออเดอร์ ชื่อ หรือเบอร์โทร" /></label>
      <div className="admin-filter-chips" aria-label="กรองสถานะ">{(["all", "attention", "pending_slip", "paid", "shipped"] as OrderFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => {
        setFilter(value);
        // When the admin narrows down to slips that need review, open those
        // cards right away so the verify controls are one tap closer.
        if (value === "attention" || value === "pending_slip") {
          const statuses = value === "attention" ? ["waiting_for_slip_review", "invalid_slip"] : ["waiting_for_slip_review"];
          setExpanded(new Set(orders.filter((order) => statuses.includes(order.payment_status)).map((order) => order.id)));
        }
      }}>{({ all: "ทุกสถานะ", attention: "ต้องตรวจ", pending_slip: "รอตรวจสลิป", paid: "ชำระแล้ว", shipped: "ส่งแล้ว" } as const)[value]}</button>)}</div>
    </div>
    <div className="admin-kpi-grid">
      <Kpi icon="orders" label="ออเดอร์" value={String(summary.total)} />
      <Kpi icon="money" label="ยอดชำระแล้ว" value={formatMoney(summary.paidSales)} />
      <Kpi icon="clock" label="รอตรวจสลิป" value={String(summary.pending)} accent={summary.pending > 0} />
      <Kpi icon="products" label="กำลังเตรียม" value={String(summary.preparing)} />
    </div>

    <section className="admin-sales-breakdown" aria-label="แยกยอดตามตัวกรองที่เลือก">
      <div className="admin-sales-figures-cards">
        <div className="admin-stat-card">
          <span className="admin-stat-icon-badge pink"><AdminIcon name="tag" /></span>
          <div className="admin-stat-info">
            <span className="admin-stat-label">ยอดสินค้า</span>
            <strong className="admin-stat-value">{formatMoney(breakdown.goods)}</strong>
          </div>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon-badge amber"><AdminIcon name="coins" /></span>
          <div className="admin-stat-info">
            <span className="admin-stat-label">ยอดค่าส่ง</span>
            <strong className="admin-stat-value amber">{formatMoney(breakdown.shipping)}</strong>
          </div>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon-badge pink"><AdminIcon name="package" /></span>
          <div className="admin-stat-info">
            <span className="admin-stat-label">ยอดรวม</span>
            <strong className="admin-stat-value red">{formatMoney(breakdown.total)}</strong>
          </div>
        </div>
      </div>

      {bestSellers.length > 0 ? (
        <div className="admin-best-sellers-card">
          <div className="admin-card-header">
            <AdminIcon name="bag" className="admin-header-icon" />
            <h4>สินค้าขายดีในตัวกรองนี้</h4>
          </div>
          <ol className="admin-best-sellers-list">
            {bestSellers.map((product, index) => (
              <li key={product.name} className="admin-best-seller-item">
                <div className="admin-best-seller-left">
                  <span className="admin-rank-badge" aria-hidden="true">{index + 1}</span>
                  <span className="admin-product-name">{product.name}</span>
                </div>
                <div className="admin-best-seller-right">
                  <span className="admin-product-qty">{product.quantity.toLocaleString("th-TH")} ชิ้น</span>
                  <span className="admin-product-revenue">{formatMoney(product.revenue)}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="admin-best-sellers-empty">ยังไม่มีออเดอร์ที่ชำระแล้วในตัวกรองนี้</p>
      )}
    </section>

    {byRound.length > 0 && (
      <div className="admin-round-summary-card">
        <div className="admin-card-header">
          <AdminIcon name="truck" className="admin-header-icon" />
          <h3>ยอดตามรอบจัดส่ง · กดเพื่อกรอง</h3>
          {selectedRound !== "all" && (
            <button type="button" className="admin-status-discard-btn" style={{ fontSize: "0.8125rem", padding: "4px 10px", marginLeft: "auto" }} onClick={() => setSelectedRound("all")}>
              ✕ แสดงทุกรอบ
            </button>
          )}
        </div>
        <div className="admin-round-cards-list">
          {byRound.map(([roundId, data]) => {
            const isSelected = selectedRound === roundId;
            return (
              <button
                type="button"
                key={roundId}
                className={`admin-round-item-card${isSelected ? " active" : ""}`}
                onClick={() => setSelectedRound(isSelected ? "all" : roundId)}
              >
                <div className="admin-round-item-left">
                  <span className="admin-round-calendar-badge">
                    <AdminIcon name="calendar" />
                  </span>
                  <div className="admin-round-item-text">
                    <strong className="admin-round-title">{roundLabelFromRoundId(roundId)}</strong>
                    <span className="admin-round-meta">({data.count} ออเดอร์ · {formatMoney(data.sales)})</span>
                  </div>
                </div>
                <AdminIcon name="chevron" className="admin-round-item-chevron" />
              </button>
            );
          })}
        </div>
      </div>
    )}
    
    {filtered.length > 0 && (
      <div className="admin-batch-bar-card">
        <div className="admin-batch-card-header" onClick={toggleSelectAll}>
          <div className="admin-batch-title-wrap">
            <AdminIcon name="fileText" className="admin-header-icon" />
            <h3>เลือกทั้งหมด ({filtered.length} รายการ)</h3>
          </div>
        </div>
        {selectedOrderIds.size > 0 && (
          <div className="admin-batch-actions-grid">
            <button
              type="button"
              className="admin-batch-btn solid-red"
              onClick={() => handlePrintStickers(filtered.filter((order) => selectedOrderIds.has(order.id)))}
            >
              <span className="admin-batch-btn-icon-wrap">
                <AdminIcon name="printer" />
              </span>
              <span className="admin-batch-btn-text">
                พิมพ์<br />สติ๊กเกอร์ ({selectedOrderIds.size})
              </span>
            </button>
            <button
              type="button"
              className="admin-batch-btn outline-red"
              onClick={() => handleDownloadBatchPdf(filtered.filter((order) => selectedOrderIds.has(order.id)))}
            >
              <AdminIcon name="filePdf" className="admin-batch-icon" />
              <span className="admin-batch-btn-text">
                ดาวน์โหลด<br />PDF ({selectedOrderIds.size})
              </span>
            </button>
            <button
              type="button"
              className="admin-batch-btn outline-red"
              disabled={exporting}
              onClick={() => void exportOrdersAsImages(filtered.filter((order) => selectedOrderIds.has(order.id)))}
            >
              <AdminIcon name="image" className="admin-batch-icon" />
              <span className="admin-batch-btn-text">
                บันทึกเป็น<br />รูปภาพ PNG ({selectedOrderIds.size})
              </span>
            </button>
          </div>
        )}
      </div>
    )}

    {orderExportNotice && (
      <div className="admin-save-notice-banner" role="status" aria-live="polite">
        <AdminIcon name="send" className="admin-notice-icon" />
        <span>{orderExportNotice}</span>
      </div>
    )}
    <div className="order-cards">
      {filtered.length === 0 && <div className="admin-empty"><AdminIcon name="orders" /><h3>ยังไม่พบออเดอร์</h3><p>ลองเปลี่ยนช่วงเวลา ตัวกรอง หรือคำค้นหา</p></div>}
      {filtered.map((order) => {
        const isExpanded = expanded.has(order.id);
        const isSaving = saving === `order:${order.id}`;
        const draft = draftFor(order);
        const statusDirty = draft.orderStatus !== order.order_status || draft.paymentStatus !== order.payment_status;
        const isSelected = selectedOrderIds.has(order.id);
        return (
          <article className={`admin-order admin-order-card admin-order-compact${isExpanded ? " expanded" : ""}${isSaving ? " is-saving" : ""}`} aria-busy={isSaving} key={order.id}>
            <div className="admin-order-card-row">
              <label className="admin-order-custom-checkbox" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelectOrder(order.id)}
                  aria-label={`เลือกออเดอร์ ${order.id}`}
                />
                <span className="admin-checkbox-mark">
                  {isSelected && <AdminIcon name="check" />}
                </span>
              </label>
              <button
                className="admin-order-summary admin-order-summary-btn"
                type="button"
                aria-expanded={isExpanded}
                onClick={() => {
                  setExpanded((current) => toggleSet(current, order.id));
                  if (order.slip_key) void preloadSlipBlob(order.id);
                }}
              >
                <div className="admin-order-info-col">
                  <small className="admin-order-date-round">{safeThaiDateTime(order.created_at)} · {order.round_id || "ไม่ระบุรอบ"}</small>
                  <strong className="admin-order-id-text">{order.id}</strong>
                  <span className="admin-order-customer-total">{order.customer_name} · {formatMoney(order.total)}</span>
                </div>
                <div className="admin-order-status-col">
                  <div className="admin-status-stack">
                    <span className={`admin-status-badge payment-${order.payment_status}`}>
                      {order.payment_status === "paid" && <AdminIcon name="check" className="badge-check-icon" />}
                      {paymentStatusLabels[order.payment_status]}
                    </span>
                    <span className={`admin-status-badge order-${order.order_status}`}>
                      {statusLabels[order.order_status]}
                    </span>
                  </div>
                  <AdminIcon name="chevron" className={`admin-chevron-icon${isExpanded ? " rotate" : ""}`} />
                </div>
              </button>
            </div>
          {isExpanded && <div className="admin-order-details">
            <div className="admin-order-grid"><div><span>ลูกค้า</span><p>{order.customer_name}</p><a href={`tel:${phoneHref(order.phone)}`}><AdminIcon name="phone" />{order.phone}</a></div><div><span>รายการ</span><p>{order.items || "—"}</p><strong>{formatMoney(order.total)}</strong></div><div className="full"><span>{order.fulfilment === "pickup" ? "รับเองหน้าร้าน" : "ที่อยู่จัดส่ง"}</span><p>{order.address}</p>{order.note && <small>หมายเหตุ: {order.note}</small>}{order.admin_note && <small className="verification-note">ผลตรวจสลิป: {order.admin_note}</small>}</div></div>
            <div className="admin-controls">
              <div className="admin-slip-control">
                {order.slip_key ? <div className="admin-slip-actions"><a className="slip-link" href={`/api/admin/slips/${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer"><AdminIcon name="image" />เปิดดูสลิป</a><button type="button" className="slip-link slip-download-link" onPointerDown={() => void preloadSlipBlob(order.id)} onMouseEnter={() => void preloadSlipBlob(order.id)} onClick={() => void handleShareSlip(order.id)}><AdminIcon name="download" />บันทึก/แชร์สลิป</button></div> : <span className="no-slip">ยังไม่มีสลิป</span>}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                  <button
                    type="button"
                    className="admin-print-sticker-btn"
                    onClick={() => handlePrintStickers([order])}
                  >
                    <AdminIcon name="printer" /> พิมพ์สติ๊กเกอร์
                  </button>
                  <button
                    type="button"
                    className="admin-print-sticker-btn"
                    onClick={() => handleDownloadStickerPdf(order)}
                  >
                    <AdminIcon name="download" /> ดาวน์โหลด PDF
                  </button>
                  <button
                    type="button"
                    className="admin-print-sticker-btn"
                    disabled={exporting}
                    onClick={() => void exportOrdersAsImages([order])}
                  >
                    <AdminIcon name="download" /> {exporting ? "กำลังบันทึก…" : "บันทึกรูป PNG"}
                  </button>
                </div>
                <small>ตรวจเงินเข้าในแอปธนาคารก่อนกดยืนยัน</small>
              </div>
              <label><span>สถานะชำระเงิน</span><select disabled={isSaving} value={draft.paymentStatus} onChange={(event) => setDraftField(order, { paymentStatus: event.target.value as PaymentStatus })}>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>สถานะออเดอร์</span><select disabled={isSaving} value={draft.orderStatus} onChange={(event) => setDraftField(order, { orderStatus: event.target.value as OrderStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value} disabled={(order.payment_status !== "paid" && !["received", "cancelled"].includes(value)) || (order.fulfilment === "pickup" && value === "shipped") || (order.fulfilment === "postal" && value === "ready_for_pickup")}>{label}</option>)}</select>{order.payment_status !== "paid" && <small className="status-select-hint">ต้องยืนยัน &quot;ชำระแล้ว&quot; ก่อน จึงจะเลือกสถานะเตรียม/จัดส่งได้</small>}</label>
              {statusDirty && <div className="admin-status-save-bar"><span>มีการแก้ไขสถานะที่ยังไม่ได้บันทึก</span><button type="button" className="admin-status-discard-btn" disabled={isSaving} onClick={() => clearDraft(order.id)}>ยกเลิก</button><button type="button" className="admin-status-save-btn" disabled={isSaving} onClick={() => saveOrderStatus(order)}>{isSaving ? "กำลังบันทึก…" : "บันทึกสถานะ"}</button></div>}
            </div>
          </div>}
        </article>
      );
    })}
    </div>
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
  </section>;
}

function RoundsPanel({ rounds, products, saving, mutate, onFormActive, onFormDirty }: { rounds: AdminRound[]; products: AdminProduct[]; saving: string | null; mutate: Mutation; onFormActive: (active: boolean) => void; onFormDirty: (dirty: boolean) => void }) {
  const [creating, setCreating] = useState(false); const [draft, setDraft] = useState<RoundInput>(EMPTY_ROUND_INPUT); const [editing, setEditing] = useState<string | null>(null); const [confirm, setConfirm] = useState<ConfirmState>(null);
  const sorted = useMemo(() => [...rounds].sort((a, b) => roundPriority(a) - roundPriority(b) || a.deliveryDate.localeCompare(b.deliveryDate)), [rounds]);

  const activeRound = useMemo(() => {
    if (editing) return rounds.find((r) => r.id === editing) ?? null;
    return null;
  }, [editing, rounds]);

  const isDirty = useMemo(() => {
    if (creating) {
      return roundInputSignature(draft) !== roundInputSignature(EMPTY_ROUND_INPUT);
    }
    if (editing && activeRound) {
      return roundInputSignature(draft) !== roundInputSignature(roundInputFrom(activeRound));
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
      <RoundForm title="เพิ่มรอบใหม่" value={draft} products={products} disabled={saving !== null} onChange={setDraft} onCancel={() => setCreating(false)} onSubmit={async () => { if (await mutate("round.create", { round: draft }, "เพิ่มรอบขายแล้ว")) { setDraft(EMPTY_ROUND_INPUT); setCreating(false); } }} />
    ) : editing ? (
      <RoundForm key={editing} title={`แก้ไข ${editing}`} value={draft} products={products} disabled={saving !== null} lockDeliveryDate onChange={setDraft} onCancel={() => setEditing(null)} onSubmit={async () => { if (await mutate("round.update", { id: editing, round: draft }, "บันทึกรอบขายแล้ว")) setEditing(null); }} />
    ) : (
      <>
        <div className="admin-section-heading"><div><p className="eyebrow">กำหนดวันเปิดและปิดตะกร้า</p><h2>รอบขาย</h2></div><button className="admin-primary-button" type="button" onClick={() => { setCreating(true); setEditing(null); setDraft(EMPTY_ROUND_INPUT); }}><AdminIcon name="plus" />เพิ่มรอบ</button></div>
        <div className="admin-card-list admin-round-list">{sorted.map((round) => (
          <article className={`admin-cms-card admin-round-card priority-${roundPriority(round)}`} key={round.id}>
            <div className="admin-card-top"><div><span className={`cms-status status-${round.status === "เปิดรับ" ? "open" : "muted"}`}>{roundStatusLabels[round.status]}</span><h3>{round.label || round.id}</h3><small>{round.displayState}</small></div><button type="button" onClick={() => { setDraft(roundInputFrom(round)); setEditing(round.id); setCreating(false); }}><AdminIcon name="edit" />แก้ไข</button></div>
            <div className="admin-round-sales"><span>ยอดชำระแล้วรอบนี้</span><strong>{formatMoney(round.sales)}</strong></div>
            <dl className="admin-mini-stats"><div><dt>เปิดรับ</dt><dd>{formatInputDateTime(round.opensAt)}</dd></div><div><dt>ปิดรับ</dt><dd>{formatInputDateTime(round.closesAt)}</dd></div><div><dt>ออเดอร์</dt><dd>{round.orderCount}</dd></div><div><dt>เฉลี่ยชำระแล้ว</dt><dd>{formatMoney(round.paidOrderCount ? round.sales / round.paidOrderCount : 0)}</dd></div></dl>
            <p className="admin-round-scope">{round.productScope === "selected" ? `เปิดเฉพาะ ${round.productIds.length} รายการ · ${roundProductNames(round, products)}` : "เปิดขายทั้งร้าน"}</p>
            {round.note && <p>{round.note}</p>}
            {round.status === "เตรียมเปิด" && <button className="admin-open-round" type="button" disabled={saving !== null} onClick={() => setConfirm({ title: "เปิดรอบขายนี้?", description: `${round.label || round.id} จะเริ่มรับออเดอร์จากลูกค้าทันที${round.productScope === "selected" ? ` เฉพาะ ${round.productIds.length} รายการที่เลือกไว้` : ""}`, confirmLabel: "เปิดรอบขาย", action: async () => { await mutate("round.update", { id: round.id, round: { ...roundInputFrom(round), status: "เปิดรับ", fingerprint: round.fingerprint } }, "เปิดรอบขายแล้ว"); } })}>เปิดรอบขาย</button>}
            {round.status === "เปิดรับ" && <button className="admin-close-round" type="button" onClick={() => setConfirm({ title: "ปิดรอบขายนี้?", description: `${round.label || round.id} จะหยุดรับออเดอร์ใหม่ทันที แต่ออเดอร์เดิมยังอยู่ครบ`, confirmLabel: "ปิดรอบขาย", tone: "danger", action: async () => { await mutate("round.update", { id: round.id, round: { ...roundInputFrom(round), status: "ปิดรับ", fingerprint: round.fingerprint } }, "ปิดรอบขายแล้ว"); } })}>ปิดรอบขาย</button>}
          </article>
        ))}</div>
      </>
    )}
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
  </section>;
}

function RoundForm({ title, value, products, disabled, lockDeliveryDate = false, onChange, onCancel, onSubmit }: { title: string; value: RoundInput; products: AdminProduct[]; disabled: boolean; lockDeliveryDate?: boolean; onChange: (value: RoundInput) => void; onCancel: () => void; onSubmit: () => void }) {
  return <form className="admin-edit-card" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h3>{title}</h3><div className="admin-form-grid"><label><span>วันจัดส่ง</span><input required type="date" disabled={disabled || lockDeliveryDate} value={value.deliveryDate} onChange={(event) => onChange({ ...value, deliveryDate: event.target.value })} /></label><label><span>เปิดรับตั้งแต่</span><input required type="datetime-local" disabled={disabled} value={value.opensAt} onChange={(event) => onChange({ ...value, opensAt: event.target.value })} /></label><label><span>ปิดรับวันที่</span><input required type="datetime-local" disabled={disabled} value={value.closesAt} onChange={(event) => onChange({ ...value, closesAt: event.target.value })} /></label><label><span>สถานะ</span><select disabled={disabled} value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as RoundInput["status"] })}>{ROUND_STATUSES.map((status) => <option key={status} value={status}>{roundStatusLabels[status]}</option>)}</select></label><RoundProductPicker value={value} products={products} disabled={disabled} onChange={onChange} /><label className="full"><span>หมายเหตุ</span><textarea rows={3} maxLength={500} value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} /></label></div><FormActions disabled={disabled} onCancel={onCancel} /></form>;
}

// Products stay listed even when the round is set to open the whole shop, so
// switching to "เลือกบางรายการ" never means hunting for the list — it just
// enables the checkboxes that are already on screen.
// The picker doubles as a preview of what the round will look like to a
// customer, so it shows the same things the storefront card does — photo,
// price, unit, category — rather than a bare list of ids.
function RoundProductPicker({ value, products, disabled, onChange }: { value: RoundInput; products: AdminProduct[]; disabled: boolean; onChange: (value: RoundInput) => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");
  const selectable = useMemo(() => products.filter((product) => product.status !== "ซ่อนสินค้า"), [products]);
  const categories = useMemo(() => ["ทั้งหมด", ...new Set(selectable.map((product) => product.category || "อื่น ๆ"))], [selectable]);
  const term = search.trim().toLowerCase();
  const visible = selectable.filter((product) =>
    (category === "ทั้งหมด" || (product.category || "อื่น ๆ") === category) &&
    (!term || product.name.toLowerCase().includes(term) || product.id.toLowerCase().includes(term)),
  );
  const selected = new Set(value.productIds);
  const selectedOnly = value.productScope === "selected";
  const setIds = (ids: string[]) => onChange({ ...value, productIds: [...new Set(ids)].sort() });
  const toggle = (id: string) => setIds(selected.has(id) ? value.productIds.filter((current) => current !== id) : [...value.productIds, id]);

  return <fieldset className="admin-round-products full" disabled={disabled}>
    <legend>สินค้าที่เปิดขายในรอบนี้</legend>
    <div className="admin-round-scope-choice">
      <label className={value.productScope === "all" ? "selected" : ""}>
        <input type="radio" name="productScope" value="all" checked={value.productScope === "all"} onChange={() => onChange({ ...value, productScope: "all" })} />
        <span><strong>เปิดทั้งร้าน</strong><small>ลูกค้าสั่งสินค้าที่เปิดขายได้ทุกรายการ</small></span>
      </label>
      <label className={selectedOnly ? "selected" : ""}>
        <input type="radio" name="productScope" value="selected" checked={selectedOnly} onChange={() => onChange({ ...value, productScope: "selected" })} />
        <span><strong>เลือกบางรายการ</strong><small>เปิดขายเฉพาะรายการที่ติ๊กไว้ด้านล่าง</small></span>
      </label>
    </div>

    {selectable.length === 0 ? (
      <p className="admin-round-product-empty">ยังไม่มีสินค้าให้เลือก กรุณาเพิ่มสินค้าในแท็บ “สินค้า” ก่อน</p>
    ) : (
      <>
        <div className="admin-round-product-toolbar">
          <label className="admin-round-product-search">
            <AdminIcon name="search" />
            <input type="search" aria-label="ค้นหาสินค้า" placeholder="ค้นหาชื่อหรือรหัสสินค้า" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <p className="admin-round-product-count">
            {selectedOnly ? <><strong>{value.productIds.length}</strong> / {selectable.length} รายการที่เลือก</> : <>เปิดครบทั้ง <strong>{selectable.length}</strong> รายการ</>}
          </p>
        </div>
        {categories.length > 2 && (
          <div className="admin-round-product-categories" role="tablist" aria-label="กรองตามหมวดหมู่">
            {categories.map((name) => (
              <button key={name} type="button" role="tab" aria-selected={category === name} className={category === name ? "active" : ""} onClick={() => setCategory(name)}>{name}</button>
            ))}
          </div>
        )}
        {selectedOnly && (
          <div className="admin-round-product-actions">
            <button type="button" onClick={() => setIds([...value.productIds, ...visible.map((product) => product.id)])}>เลือกที่เห็นทั้งหมด</button>
            <button type="button" onClick={() => setIds(value.productIds.filter((id) => !visible.some((product) => product.id === id)))}>เอาที่เห็นออก</button>
          </div>
        )}
        <div className="admin-round-product-grid">
          {visible.length === 0 ? <p className="admin-round-product-empty">ไม่พบสินค้าที่ตรงกับที่ค้นหา</p> : visible.map((product) => (
            <RoundProductOption key={product.id} product={product} checked={selectedOnly ? selected.has(product.id) : true} interactive={selectedOnly} onToggle={() => toggle(product.id)} />
          ))}
        </div>
      </>
    )}
    {selectedOnly && value.productIds.length === 0 && <p className="admin-round-product-warning" role="alert">ต้องเลือกสินค้าอย่างน้อย 1 รายการ ไม่อย่างนั้นรอบนี้จะสั่งอะไรไม่ได้เลย</p>}
  </fieldset>;
}

function RoundProductOption({ product, checked, interactive, onToggle }: { product: AdminProduct; checked: boolean; interactive: boolean; onToggle: () => void }) {
  const image = product.imageUrl ? adminImageSrc(product.imageUrl.split(",")[0]) : "";
  const sellable = product.status === "เปิดขาย";
  return <label className={`admin-round-product${checked ? " selected" : ""}${interactive ? "" : " locked"}`}>
    <input type="checkbox" disabled={!interactive} checked={checked} onChange={onToggle} />
    <span className="admin-round-product-thumb">
      {image ? <Image src={image} alt={`รูปสินค้า ${product.name}`} fill sizes="88px" /> : <AdminIcon name="image" />}
    </span>
    <span className="admin-round-product-info">
      <span className="admin-round-product-head">
        <strong>{product.name}</strong>
        <span className={`product-card-status status-${sellable ? "open" : product.status === "ปิดชั่วคราว" ? "closed" : "waiting"}`}>{productStatusLabels[product.status]}</span>
      </span>
      <small className="admin-round-product-meta">
        {product.category || "อื่น ๆ"} · {product.price === null ? "รอข้อมูลราคา" : formatMoney(product.price)}{product.unit ? ` / ${product.unit}` : ""}
      </small>
      {product.detail && <small className="admin-round-product-detail">{product.detail}</small>}
      {!sellable && <small className="admin-round-product-note">สถานะนี้ยังขายไม่ได้ ต่อให้ติ๊กไว้ลูกค้าก็ยังสั่งไม่ได้</small>}
    </span>
  </label>;
}

function roundInputFrom(round: AdminRound): RoundInput {
  return {
    deliveryDate: round.deliveryDate,
    opensAt: round.opensAt,
    closesAt: round.closesAt,
    status: round.status,
    note: round.note || "",
    productScope: round.productScope,
    productIds: [...round.productIds].sort(),
  };
}

function roundInputSignature(input: RoundInput): string {
  return JSON.stringify({ ...input, productIds: [...input.productIds].sort() });
}

function roundProductNames(round: AdminRound, products: AdminProduct[]): string {
  const names = new Map(products.map((product) => [product.id, product.name]));
  const listed = round.productIds.map((id) => names.get(id) ?? id);
  return listed.length > 3 ? `${listed.slice(0, 3).join(", ")} และอีก ${listed.length - 3} รายการ` : listed.join(", ");
}

function ProductsPanel({ products, categoryOrder, saving, mutate, setNotice, onFormActive, onFormDirty }: { products: AdminProduct[]; categoryOrder: string[]; saving: string | null; mutate: Mutation; setNotice: (value: string) => void; onFormActive: (active: boolean) => void; onFormDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState<ProductInput>(EMPTY_PRODUCT_INPUT); const [editing, setEditing] = useState<string | null>(null); const [creating, setCreating] = useState(false); const [uploading, setUploading] = useState(false); const [category, setCategory] = useState("ทั้งหมด"); const [view, setView] = useState<"list" | "grid">("list"); const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [categoryOrderOverride, setCategoryOrderOverride] = useState<string[] | null>(null);
  const [activeCategoryDrag, setActiveCategoryDrag] = useState<string | null>(null);
  // Drag-to-reorder always works on every active product, independent of
  // whatever category filter is selected elsewhere in the panel — sort_order
  // is a single global sequence, so reordering a filtered subset in place
  // would leave its relationship to everything outside that subset undefined.
  // Dragging is therefore only offered on the unfiltered, list-view display.
  // baseOrderIds is the server-driven order; dragOverride is the optimistic
  // order shown mid-drag/save, cleared once the request settles (at which
  // point baseOrderIds has already caught up, or reverted on failure).
  const baseOrderIds = useMemo(() => products.filter((product) => product.status !== "ซ่อนสินค้า").map((product) => product.id), [products]);
  const [dragOverride, setDragOverride] = useState<string[] | null>(null);
  const sortIds = dragOverride ?? baseOrderIds;
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const categoryDragSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const categoryNames = useMemo(
    () => orderCategoryNames(categoryNamesFromProducts(products), categoryOrderOverride ?? categoryOrder),
    [categoryOrder, categoryOrderOverride, products],
  );
  // Deleting or renaming the last product of a category makes the selected
  // filter vanish from the list. Falling back while reading keeps the panel
  // showing everything instead of an empty result for a category that is no
  // longer there, without a render pass that stores a filter nothing matches.
  const activeCategory = categoryNames.includes(category) ? category : "ทั้งหมด";

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }
  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortIds.indexOf(String(active.id));
    const newIndex = sortIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(sortIds, oldIndex, newIndex);
    setDragOverride(next);
    await mutate("product.reorder", { ids: next }, "เรียงสินค้าแล้ว");
    setDragOverride(null);
  }

  function handleCategoryDragStart(event: DragStartEvent) {
    setActiveCategoryDrag(String(event.active.id));
  }

  async function handleCategoryDragEnd(event: DragEndEvent) {
    setActiveCategoryDrag(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categoryNames.indexOf(String(active.id));
    const newIndex = categoryNames.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(categoryNames, oldIndex, newIndex);
    setCategoryOrderOverride(next);
    await mutate("category.reorder", { categories: next }, "จัดเรียงหมวดหมู่แล้ว");
    setCategoryOrderOverride(null);
  }

  const visible = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = activeCategory === "ทั้งหมด" || (product.category || "อื่น ๆ") === activeCategory;
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const matchesSearch = !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.id.toLowerCase().includes(normalizedQuery) ||
        (product.category || "").toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery]);
  // Products still in rotation (on sale, paused, or waiting for info) show up
  // front. Ones the admin closed on purpose move to a separate collapsed
  // section below, so the main list only ever shows what's actively managed.
  const activeVisible = useMemo(() => visible.filter((product) => product.status !== "ซ่อนสินค้า"), [visible]);
  const archivedVisible = useMemo(() => visible.filter((product) => product.status === "ซ่อนสินค้า"), [visible]);
  const canReorder = view === "list" && activeCategory === "ทั้งหมด" && !searchQuery.trim();
  const isReordering = saving === "product.reorder";
  const isCategoryReordering = saving === "category.reorder";

  const activeProduct = useMemo(() => {
    if (editing) return products.find((p) => p.id === editing) ?? null;
    return null;
  }, [editing, products]);
  const activeDragProduct = useMemo(
    () => products.find((product) => product.id === activeDragId) ?? null,
    [activeDragId, products],
  );

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

  function productHandlers(product: AdminProduct): ProductCardHandlers {
    return {
      onEdit: () => { setDraft({ id: product.id, name: product.name, unit: product.unit || "", detail: product.detail || "", price: product.price, status: product.status, imageUrl: product.imageUrl || "", category: product.category || "" }); setEditing(product.id); setCreating(false); },
      onArchive: () => setConfirm({ title: `ปิดขาย ${product.name}?`, description: "สินค้าจะหายจากหน้าร้าน แต่ประวัติออเดอร์เก่าจะยังอยู่ครบและนำกลับมาได้", confirmLabel: "ปิดขายสินค้า", tone: "danger", action: async () => { await mutate("product.update", { product: { ...product, status: "ซ่อนสินค้า" } }, "ปิดขายสินค้าแล้ว"); } }),
      onRestore: () => setConfirm({ title: `เปิดขาย ${product.name} อีกครั้ง?`, description: "สินค้าจะกลับมาแสดงบนหน้าร้านทันที", confirmLabel: "เปิดขายสินค้า", tone: "primary", action: async () => { await mutate("product.update", { product: { ...product, status: "ปิดชั่วคราว" } }, "เปิดขายสินค้าอีกครั้ง"); } }),
    };
  }

  function productCard(product: AdminProduct) {
    return <article className={`admin-product-card ${product.status === "ซ่อนสินค้า" ? "is-archived" : ""}`} key={product.id}>
      {productCardBody(product, productHandlers(product), undefined, saving !== null)}
    </article>;
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
            <button type="button" className={`admin-category-chip-btn ${activeCategory === "ทั้งหมด" ? "active" : ""}`} onClick={() => setCategory("ทั้งหมด")}>ทั้งหมด</button>
            <DndContext sensors={categoryDragSensors} collisionDetection={closestCenter} onDragStart={handleCategoryDragStart} onDragEnd={handleCategoryDragEnd} onDragCancel={() => setActiveCategoryDrag(null)}>
              <SortableContext items={categoryNames} strategy={horizontalListSortingStrategy}>
                {categoryNames.map((value) => <SortableCategoryChip key={value} category={value} active={activeCategory === value} disabled={isCategoryReordering} onSelect={() => setCategory(value)} />)}
              </SortableContext>
              <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
                {activeCategoryDrag ? <div className="admin-category-sort-item admin-category-drag-overlay"><span>{activeCategoryDrag}</span><AdminIcon name="grip" /></div> : null}
              </DragOverlay>
            </DndContext>
          </div>
          <div className="admin-view-toggle" aria-label="รูปแบบแสดงสินค้า">
            <button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")} aria-label="แบบรายการ"><AdminIcon name="list" /></button>
            <button className={view === "grid" ? "active" : ""} type="button" onClick={() => setView("grid")} aria-label="แบบตาราง"><AdminIcon name="grid" /></button>
          </div>
        </div>
        {categoryNames.length > 1 && <p className="admin-category-sort-hint">กดค้างที่จุดจับ <AdminIcon name="grip" /> แล้วลากเพื่อจัดเรียงหมวดหมู่</p>}

        <button className="admin-primary-button add-product-mobile-btn" type="button" onClick={() => { setDraft({ ...EMPTY_PRODUCT_INPUT, id: nextProductId(products) }); setCreating(true); setEditing(null); }}>
          <AdminIcon name="plus" />เพิ่มสินค้าใหม่
        </button>

        {canReorder ? (
          <>
            {activeVisible.length > 1 && <p className="admin-sort-hint">กดค้างที่จุดจับ <AdminIcon name="grip" /> แล้วลากขึ้นลงเพื่อจัดเรียงลำดับสินค้าใหม่</p>}
            <DndContext
              sensors={dragSensors}
              collisionDetection={closestCenter}
              autoScroll
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveDragId(null)}
            >
              <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
                <div className="admin-card-list admin-product-list view-list">
                  {sortIds.map((id) => {
                    const product = products.find((item) => item.id === id);
                    if (!product) return null;
                    return <SortableProductCard key={id} product={product} isActiveDrag={activeDragId === id} disabled={isReordering} busy={saving !== null} handlers={productHandlers(product)} />;
                  })}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
                {activeDragProduct ? (
                  <article className="admin-product-card admin-product-drag-overlay" aria-hidden="true">
                    {productCardBody(activeDragProduct, productHandlers(activeDragProduct), undefined, true)}
                  </article>
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        ) : (
          <>
            {(category !== "ทั้งหมด" || searchQuery.trim()) && <p className="admin-sort-hint">ล้างตัวกรองและคำค้นหาเพื่อจัดเรียงลำดับสินค้าใหม่</p>}
            <div className={`admin-card-list admin-product-list view-${view}`}>
              {activeVisible.map((product) => productCard(product))}
            </div>
          </>
        )}
        {activeVisible.length === 0 && <p className="admin-empty-note">ไม่พบสินค้าที่ตรงกับตัวกรอง</p>}

        <button type="button" className="admin-archived-toggle" onClick={() => setShowArchived((current) => !current)}>
          <AdminIcon name={showArchived ? "up" : "down"} />
          สินค้าที่ปิดขายแล้ว ({archivedVisible.length})
        </button>
        {showArchived && (
          <div className={`admin-card-list admin-product-list view-${view} admin-archived-list`}>
            {archivedVisible.length === 0
              ? <p className="admin-empty-note">ยังไม่มีสินค้าที่ปิดขาย</p>
              : archivedVisible.map((product) => productCard(product))}
          </div>
        )}
      </>
    )}

    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel={confirm?.confirmLabel ?? "ยืนยัน"} tone={confirm?.tone} busy={saving !== null} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }} />
  </section>;
}

type ProductCardHandlers = { onEdit: () => void; onArchive: () => void; onRestore: () => void };

function productCardBody(product: AdminProduct, handlers: ProductCardHandlers, dragHandle?: React.ReactNode, busy = false) {
  const firstImage = product.imageUrl ? product.imageUrl.split(",")[0] : "";
  return <div className="product-card-body">
    {dragHandle}
    <div className="product-card-image-wrap">
      {firstImage ? <Image src={adminImageSrc(firstImage)} alt={`รูปสินค้า ${product.name}`} fill sizes="96px" /> : <div className="product-card-no-image"><AdminIcon name="image" /></div>}
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
        <button type="button" className="action-btn edit-btn" disabled={busy} onClick={handlers.onEdit}><AdminIcon name="edit" /><span>แก้ไข</span></button>
        {product.status !== "ซ่อนสินค้า" ? (
          <button className="action-btn delete-btn" type="button" disabled={busy} onClick={handlers.onArchive}><AdminIcon name="hide" /><span>ปิดขาย</span></button>
        ) : (
          <button className="action-btn restore-btn" type="button" disabled={busy} onClick={handlers.onRestore}><AdminIcon name="check" /><span>เปิดขาย</span></button>
        )}
      </div>
    </div>
  </div>;
}

function SortableProductCard({ product, isActiveDrag, disabled, busy, handlers }: { product: AdminProduct; isActiveDrag: boolean; disabled: boolean; busy: boolean; handlers: ProductCardHandlers }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled,
    transition: {
      duration: 200,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const dragHandle = <button type="button" className="product-drag-handle" disabled={disabled} aria-label={`ลากเพื่อจัดเรียง ${product.name}`} {...attributes} {...listeners}><AdminIcon name="grip" /></button>;
  return <article ref={setNodeRef} style={style} className={`admin-product-card${isDragging ? " is-dragging" : ""}${isActiveDrag ? " is-active-drag" : ""}`}>
    {productCardBody(product, handlers, dragHandle, busy)}
  </article>;
}

function SortableCategoryChip({ category, active, disabled, onSelect }: { category: string; active: boolean; disabled: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return <div ref={setNodeRef} style={style} className={`admin-category-sort-item${active ? " is-active" : ""}${isDragging ? " is-dragging" : ""}`}>
    <button type="button" className="admin-category-chip-btn" onClick={onSelect}>{category}</button>
    <button type="button" className="category-drag-handle" disabled={disabled} aria-label={`ลากเพื่อจัดเรียงหมวดหมู่ ${category}`} {...attributes} {...listeners}><AdminIcon name="grip" /></button>
  </div>;
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
                <Image src={adminImageSrc(imgUrl)} alt={idx === 0 ? `รูปหลักของ ${value.name || "สินค้า"}` : `รูปที่ ${idx + 1} ของ ${value.name || "สินค้า"}`} fill sizes="120px" />
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
  function toggleFreeShippingPromotion(disabled: boolean) {
    setDraft((current) => {
      const lastMinimum = current.lastFreeShippingMinimum ?? current.freeShippingMinimum ?? 300;
      return disabled
        ? { ...current, freeShippingMinimum: null, lastFreeShippingMinimum: lastMinimum }
        : { ...current, freeShippingMinimum: lastMinimum, lastFreeShippingMinimum: lastMinimum };
    });
  }
  function setFreeShippingMinimum(value: number | null) {
    setDraft((current) => ({ ...current, freeShippingMinimum: value, lastFreeShippingMinimum: value ?? current.lastFreeShippingMinimum }));
  }

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
            <div className="free-shipping-control full">
              <label className="free-shipping-toggle" htmlFor="free-shipping-disabled">
                <input id="free-shipping-disabled" type="checkbox" checked={draft.freeShippingMinimum === null} onChange={(event) => toggleFreeShippingPromotion(event.target.checked)} aria-describedby="free-shipping-help" />
                <span className="free-shipping-toggle-track" aria-hidden="true"><span className="free-shipping-toggle-thumb" /></span>
                <span className="free-shipping-toggle-copy"><strong>ไม่มีโปรโมชันส่งฟรี</strong><small>{draft.freeShippingMinimum === null ? "เก็บค่าส่งตามปกติทุกยอดสั่งซื้อ" : `ส่งฟรีเมื่อซื้อครบ ${draft.freeShippingMinimum.toLocaleString("th-TH")} บาท`}</small></span>
                <span className="free-shipping-toggle-state" aria-hidden="true">{draft.freeShippingMinimum === null ? "ปิด" : "เปิด"}</span>
              </label>
              <small className="field-help" id="free-shipping-help">เปิดสวิตช์เพื่อปิดโปรโมชันส่งฟรีชั่วคราว</small>
            </div>
            {draft.freeShippingMinimum !== null && <label><span>ซื้อครบกี่บาทส่งฟรี</span><input min="1" max="1000000" type="number" value={draft.freeShippingMinimum} onChange={(event) => setFreeShippingMinimum(event.target.value ? Number(event.target.value) : null)} /></label>}
            <label className="full"><span>ที่อยู่รับเองหน้าร้าน</span><textarea maxLength={500} rows={4} value={draft.pickupAddress} onChange={(event) => field("pickupAddress", event.target.value)} /></label>
            <label className="full"><span>ลิงก์ Google Maps</span><input type="url" maxLength={500} value={draft.pickupMapUrl} onChange={(event) => field("pickupMapUrl", event.target.value)} /></label>
          </div>
          <h3>บัญชีรับเงินพร้อมเพย์</h3>
          <div className="admin-form-grid">
            <label>
              <span>เลขพร้อมเพย์</span>
              <input inputMode="numeric" maxLength={20} placeholder="เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน 13 หลัก" value={draft.promptPayId} onChange={(event) => field("promptPayId", event.target.value)} />
            </label>
            <label>
              <span>ชื่อบัญชีพร้อมเพย์</span>
              <input maxLength={100} placeholder="ชื่อที่จะโชว์ให้ลูกค้าเห็นตอนจ่ายเงิน" value={draft.promptPayName} onChange={(event) => field("promptPayName", event.target.value)} />
            </label>
            <small className="field-help full">ใช้สร้าง QR รับเงินหน้าเว็บ ตรวจให้ถูกต้องก่อนบันทึกทุกครั้ง พิมพ์ผิดจะทำให้เงินลูกค้าโอนไปผิดบัญชี</small>
          </div>
        </div>
      )}
      <div className={`admin-sticky-save${dirty ? " dirty" : ""}`}><span>{dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : "ข้อมูลเป็นปัจจุบันแล้ว"}</span>{dirty && <button className="admin-discard-button" type="button" disabled={saving !== null || uploading !== null} onClick={() => { setDraft(settings); setNotice("ยกเลิกการแก้ไขแล้ว กลับไปใช้ข้อมูลล่าสุดที่บันทึกไว้"); }}>ยกเลิกการแก้ไข</button>}<button className="admin-save-button" type="submit" disabled={saving !== null || uploading !== null || !dirty}>{saving ? "กำลังบันทึก…" : "บันทึกหน้าร้าน"}</button></div>
    </form>
  </section>;
}

function BrandAsset({ label, value, ratio, uploading, onUpload }: { label: string; value: string; ratio: "square" | "cover"; uploading: boolean; onUpload: (file: File) => void }) {
  return <label className={`admin-brand-asset ${ratio}`}><span>{label}</span><span className="admin-brand-asset-preview">{value ? <Image src={adminImageSrc(value)} alt={`ตัวอย่าง${label}`} fill sizes="320px" /> : <AdminIcon name="image" />}</span><span className="admin-brand-upload"><AdminIcon name="image" />{uploading ? "กำลังอัปโหลด…" : "เลือกรูป"}</span><input disabled={uploading} type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} /></label>;
}

function Kpi({ icon, label, value, accent = false }: { icon: AdminIconName; label: string; value: string; accent?: boolean }) { return <div className={accent ? "accent" : ""}><span><AdminIcon name={icon} />{label}</span><strong>{value}</strong></div>; }
function FormActions({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) { return <div className="admin-form-actions"><button type="button" onClick={onCancel}>ยกเลิก</button><button className="admin-save-button" type="submit" disabled={disabled}>{disabled ? "กำลังบันทึก…" : "บันทึก"}</button></div>; }
// A 401 now means the Cloudflare Access session expired mid-session. Reloading
// the current URL hands the request back to Access, which re-authenticates and
// returns the admin to the page they were on — there is no login page of our
// own to send them to any more.
function redirectToLogin() { window.location.reload(); }
function adminTabFromUrl(): AdminTab {
  const value = new URL(window.location.href).searchParams.get("tab");
  return value === "stickers" || value === "rounds" || value === "products" || value === "storefront" ? value : "orders";
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
