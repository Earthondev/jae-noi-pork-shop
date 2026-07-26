import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import type { Quantities } from "../../_hooks/use-checkout-draft";
import type { Fulfilment, PreorderRound, Product } from "../../_hooks/use-storefront";
import { computePillWidth, fitFontSize } from "../../../lib/qr-image";
import { AddressFields, type AddressFieldName } from "./address-fields";

type ClientPaymentStatus = "waiting" | "verified" | "review" | "invalid";

export type OrderRecap = Readonly<{
  items: ReadonlyArray<{ name: string; quantity: number; lineTotal: number }>;
  shippingCost: number;
  total: number;
}>;

export type CartDrawerProps = Readonly<{
  drawerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  cart: Readonly<{
    items: readonly Product[];
    quantities: Quantities;
    subtotal: number;
    onUpdateQuantity: (productId: string, delta: number) => void;
  }>;
  checkout: Readonly<{
    customerName: string;
    phone: string;
    address: string;
    addressLine: string;
    subdistrict: string;
    district: string;
    province: string;
    postalCode: string;
    note: string;
    hasContent: boolean;
    rememberDetails: boolean;
    rememberedForCurrentPhone: boolean;
    onChange: (field: "customerName" | "phone" | "address" | "note" | AddressFieldName, value: string) => void;
    onToggleRemember: (enabled: boolean) => void;
    onForgetRemembered: () => void;
    onClear: () => void;
  }>;
  storefront: Readonly<{
    storeName: string;
    orderingOpen: boolean;
    rounds: readonly PreorderRound[];
    nextRound: PreorderRound | null;
    selectedRound: string;
    onSelectRound: (roundId: string) => void;
    fulfilment: Fulfilment;
    onSelectFulfilment: (fulfilment: Fulfilment) => void;
    shippingFee: number | null;
    pickupAddress: string | null;
    pickupMapUrl: string | null;
    promptPayId: string | null;
    promptPayName: string | null;
    secureWriteReady: boolean;
    notice: string | null;
    phonePrimary: string;
    phoneSecondary: string;
  }>;
  order: Readonly<{
    id: string | null;
    paymentStatus: ClientPaymentStatus;
    submitting: boolean;
    promptPayPayload: string | null;
    orderTotal: number;
    shippingCost: number | null;
    recap: OrderRecap | null;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onReset: () => void;
  }>;
}>;

export function CartDrawer({ drawerRef, onClose, cart, checkout, storefront, order }: CartDrawerProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [orderCopyStatus, setOrderCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [qrSaveStatus, setQrSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [receiptSaveStatus, setReceiptSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [prevOrderId, setPrevOrderId] = useState(order.id);
  const successCardRef = useRef<HTMLDivElement | null>(null);

  // Keep the customer's locally selected slip after a successful submission
  // so it can be placed into the downloadable confirmation image. It is
  // cleared as soon as the success state is reset and is never persisted.
  if (order.id !== prevOrderId) {
    setPrevOrderId(order.id);
    if (!order.id) {
      setSlipFile(null);
      setSlipPreviewUrl(null);
      setOrderCopyStatus("idle");
      setReceiptSaveStatus("idle");
      setReceiptError(null);
    }
  }

  useEffect(() => {
    return () => {
      if (slipPreviewUrl) URL.revokeObjectURL(slipPreviewUrl);
    };
  }, [slipPreviewUrl]);

  useEffect(() => {
    if (!slipFile && slipInputRef.current) slipInputRef.current.value = "";
  }, [slipFile]);

  // Submission errors surface in the notice near the top of the drawer while
  // the submit button sits at the bottom, so bring the message into view.
  useEffect(() => {
    if (storefront.notice) noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [storefront.notice]);

  // After a successful submission the drawer content is replaced by the
  // success card; move focus there so it's announced and visible.
  useEffect(() => {
    if (order.id) successCardRef.current?.focus();
  }, [order.id]);

  const SLIP_MAX_BYTES = 5 * 1024 * 1024;
  const SLIP_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  function clearSlip() {
    setSlipFile(null);
    setSlipPreviewUrl(null);
  }

  function handleSlipChange(file: File | null) {
    setSlipError(null);
    if (!file) return;
    if (!SLIP_ACCEPTED_TYPES.includes(file.type)) {
      setSlipError("สลิปต้องเป็นไฟล์รูป JPG, PNG หรือ WebP เท่านั้น");
      setSlipFile(null);
      setSlipPreviewUrl(null);
      return;
    }
    if (file.size > SLIP_MAX_BYTES) {
      setSlipError("ไฟล์รูปสลิปต้องมีขนาดไม่เกิน 5 MB");
      setSlipFile(null);
      setSlipPreviewUrl(null);
      return;
    }
    setSlipFile(file);
    setSlipPreviewUrl(URL.createObjectURL(file));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!slipFile) {
      event.preventDefault();
      setSlipError("กรุณาแนบรูปสลิปโอนเงินก่อนยืนยันคำสั่งซื้อ");
      slipInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    order.onSubmit(event);
  }

  const copyToClipboard = async (text: string, type: "id" | "amount" | "order") => {
    const copied = await writeClipboardText(text);
    if (!copied) {
      if (type === "order") {
        setOrderCopyStatus("error");
        setTimeout(() => setOrderCopyStatus("idle"), 4000);
      }
      return;
    }
    if (type === "id") {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else if (type === "amount") {
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    } else {
      setOrderCopyStatus("copied");
      setTimeout(() => setOrderCopyStatus("idle"), 2500);
    }
  };

  const saveOrderConfirmation = async () => {
    if (!order.id || !order.recap || !slipFile) {
      setReceiptSaveStatus("error");
      setReceiptError("ยังสร้างใบยืนยันไม่ได้ กรุณาเก็บเลขออเดอร์ไว้และติดต่อร้านหากต้องการความช่วยเหลือ");
      return;
    }
    setReceiptSaveStatus("saving");
    setReceiptError(null);
    try {
      const blob = await createOrderConfirmationPng({
        storeName: storefront.storeName,
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        recap: order.recap,
        slipFile,
      });
      const filename = `jae-noi-order-${order.id}.png`;
      const shareFiles = { files: [new File([blob], filename, { type: "image/png" })] };
      if (navigator.share && navigator.canShare?.(shareFiles)) {
        try {
          await navigator.share({
            ...shareFiles,
            title: `${confirmationContent(order.paymentStatus).documentTitle} ${order.id}`,
            text: `เลขออเดอร์ ${order.id}`,
          });
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") {
            setReceiptSaveStatus("idle");
            return;
          }
          downloadBlob(blob, filename);
        }
      } else {
        downloadBlob(blob, filename);
      }
      setReceiptSaveStatus("saved");
      window.setTimeout(() => setReceiptSaveStatus("idle"), 3000);
    } catch (saveError) {
      setReceiptSaveStatus("error");
      setReceiptError(saveError instanceof Error ? saveError.message : "บันทึกใบยืนยันไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  const saveQrImage = async () => {
    const qrCanvas = qrCanvasRef.current;
    if (!qrCanvas || !order.promptPayPayload || !storefront.promptPayId) {
      setQrSaveStatus("error");
      return;
    }

    setQrSaveStatus("saving");
    // Without this, canvas text can render (and get measured) with a
    // fallback font before Noto Sans Thai finishes loading, garbling glyphs
    // and throwing off every width calculation below.
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    // iOS Safari resolves canvas web fonts and text direction unreliably
    // for a canvas that's never been part of the document — it can silently
    // fall back to a system font with different Thai glyph widths, which
    // throws off every measureText-based centering below (Android/Chrome
    // doesn't have this quirk, which is why this only showed up on iPhone).
    // Parking it off-screen in the DOM while we draw avoids that.
    canvas.style.position = "fixed";
    canvas.style.left = "-9999px";
    canvas.style.top = "0";
    document.body.appendChild(canvas);
    try {
      const context = canvas.getContext("2d");
      if (!context) {
        setQrSaveStatus("error");
        return;
      }
      context.direction = "ltr";
      context.textBaseline = "alphabetic";
      context.textAlign = "left";

      context.fillStyle = "#FAF9F6";
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.fillStyle = "#7A1F1F";
      context.fillRect(0, 0, canvas.width, 200);
      context.fillStyle = "#D4A017";
      context.fillRect(0, 200, canvas.width, 12);

      context.fillStyle = "#FFFFFF";
      fitFontSize(context, storefront.storeName, 920, 800, 58, 32);
      fillTextCentered(context, storefront.storeName, canvas.width / 2, 96);
      context.font = '700 32px "Noto Sans Thai", sans-serif';
      context.fillStyle = "#F5E8C7";
      fillTextCentered(context, "พร้อมเพย์ · สแกนเพื่อชำระเงิน", canvas.width / 2, 160);

      context.fillStyle = "#FFFFFF";
      fillRoundedRect(context, 64, 252, 952, 940, 44);
      context.strokeStyle = "#EBD6C8";
      context.lineWidth = 4;
      strokeRoundedRect(context, 64, 252, 952, 940, 44);

      context.fillStyle = "#FFFFFF";
      fillRoundedRect(context, 250, 292, 580, 580, 28);
      context.strokeStyle = "#D4A017";
      context.lineWidth = 5;
      strokeRoundedRect(context, 250, 292, 580, 580, 28);
      context.drawImage(qrCanvas, 280, 322, 520, 520);

      context.fillStyle = "#6E5855";
      context.font = '600 26px "Noto Sans Thai", sans-serif';
      fillTextCentered(context, "สแกนด้วยแอปธนาคารใดก็ได้", canvas.width / 2, 918);

      // The pill background is sized to the actual measured text width, not a
      // fixed guess — a fixed-width pill let long amounts spill past its
      // right edge onto the white card behind it, where white-on-white text
      // simply vanished instead of visibly clipping.
      const amountText = `ยอดชำระ ${order.orderTotal.toLocaleString("th-TH")} บาท`;
      const amountPaddingX = 56;
      const amountMaxWidth = 880;
      fitFontSize(context, amountText, amountMaxWidth - amountPaddingX * 2, 800, 44, 28);
      const amountTextWidth = context.measureText(amountText).width;
      const pillWidth = computePillWidth(amountTextWidth, { paddingX: amountPaddingX, minWidth: 320, maxWidth: amountMaxWidth });
      context.fillStyle = "#7A1F1F";
      fillRoundedRect(context, (canvas.width - pillWidth) / 2, 946, pillWidth, 92, 46);
      context.fillStyle = "#FFFFFF";
      fillTextCentered(context, amountText, canvas.width / 2, 1006);

      context.fillStyle = "#6E5855";
      context.font = '600 26px "Noto Sans Thai", sans-serif';
      fillTextCentered(context, "ชื่อบัญชีพร้อมเพย์", canvas.width / 2, 1082);
      context.fillStyle = "#2A1816";
      const promptPayNameText = storefront.promptPayName ?? "ร้านเจ๊น้อย";
      fitFontSize(context, promptPayNameText, 820, 800, 40, 24);
      fillTextCentered(context, promptPayNameText, canvas.width / 2, 1130);
      context.fillStyle = "#6E5855";
      context.font = '700 30px "Noto Sans Thai", sans-serif';
      fillTextCentered(context, formatPromptPayId(storefront.promptPayId), canvas.width / 2, 1172);

      context.fillStyle = "#7A1F1F";
      context.font = '800 34px "Noto Sans Thai", sans-serif';
      fillTextCentered(context, "อร่อยจากใจเจ๊น้อย · ขอบคุณที่อุดหนุนค่ะ", canvas.width / 2, 1248);

      context.fillStyle = "#6E5855";
      context.font = '600 24px "Noto Sans Thai", sans-serif';
      fillTextCentered(context, "กรุณาตรวจสอบชื่อผู้รับและยอดเงินก่อนยืนยันการโอน", canvas.width / 2, 1312);

      const filename = `promptpay-jae-noi-${order.orderTotal}.png`;
      const blob = dataUrlToBlob(canvas.toDataURL("image/png"));
      const file = new File([blob], filename, { type: "image/png" });
      const shareFiles = { files: [file] };

      if (navigator.share && navigator.canShare?.(shareFiles)) {
        void navigator.share({
          ...shareFiles,
          title: `QR พร้อมเพย์ ${storefront.storeName}`,
          text: `ยอดชำระ ${order.orderTotal.toLocaleString("th-TH")} บาท`,
        }).then(() => {
          showQrSaveSuccess(setQrSaveStatus);
        }).catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            setQrSaveStatus("idle");
            return;
          }
          downloadBlob(blob, filename);
          showQrSaveSuccess(setQrSaveStatus);
        });
        return;
      }

      downloadBlob(blob, filename);
      showQrSaveSuccess(setQrSaveStatus);
    } finally {
      document.body.removeChild(canvas);
    }
  };

  const successContent = confirmationContent(order.paymentStatus);

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={drawerRef} className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="drawer-handle" />
        <div className="drawer-heading">
          <div>
            <p className="eyebrow">รายการของคุณ</p>
            <h2 id="cart-title">ตะกร้าสินค้า</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิดตะกร้า">×</button>
        </div>

        {order.id ? (
          <div ref={successCardRef} tabIndex={-1} className={`success-card${order.paymentStatus === "invalid" ? " invalid" : ""}`} role={order.paymentStatus === "invalid" ? "alert" : "status"}>
            <span>{order.paymentStatus === "invalid" ? "!" : "✓"}</span>
            <h3>{order.paymentStatus === "invalid" ? "บันทึกคำสั่งซื้อแล้ว" : "รับคำสั่งซื้อแล้ว"}</h3>
            <p className="success-payment-state">{successContent.message}</p>
            <div className="success-reminder" role="note">
              <strong>เก็บเลขออเดอร์นี้ไว้</strong>
              <span>ใช้คู่กับเบอร์โทร 4 ตัวท้ายเพื่อติดตามสินค้า หากปิดหน้านี้แล้วร้านจะไม่สามารถแสดงเลขให้คุณเห็นจากข้อมูลส่วนตัวเพียงอย่างเดียว</span>
            </div>
            <div className="success-order-id" aria-label={`เลขออเดอร์ ${order.id}`}>
              <span>เลขออเดอร์</span>
              <strong>{order.id}</strong>
              <button type="button" onClick={() => void copyToClipboard(order.id!, "order")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {orderCopyStatus === "copied" ? "คัดลอกแล้ว" : "คัดลอกรหัส"}
              </button>
            </div>
            <p className={orderCopyStatus === "error" ? "copy-order-error" : "sr-only"} aria-live="polite">
              {orderCopyStatus === "copied"
                ? `คัดลอกเลขออเดอร์ ${order.id} แล้ว`
                : orderCopyStatus === "error"
                  ? "คัดลอกอัตโนมัติไม่สำเร็จ กรุณากดค้างที่เลขออเดอร์แล้วเลือกคัดลอก"
                  : ""}
            </p>
            {order.recap && order.recap.items.length > 0 && (
              <div className="success-recap" aria-label="สรุปรายการที่สั่ง">
                <h4>รายการที่สั่ง</h4>
                {order.recap.items.map((item, index) => (
                  <div className="success-recap-line" key={`${item.name}-${index}`}>
                    <span>{item.name} × {item.quantity}</span>
                    <strong>{item.lineTotal.toLocaleString("th-TH")} บาท</strong>
                  </div>
                ))}
                {order.recap.shippingCost > 0 && (
                  <div className="success-recap-line">
                    <span>ค่าจัดส่งไปรษณีย์</span>
                    <strong>{order.recap.shippingCost.toLocaleString("th-TH")} บาท</strong>
                  </div>
                )}
                <div className="success-recap-line total">
                  <span>ยอดชำระทั้งหมด</span>
                  <strong>{order.recap.total.toLocaleString("th-TH")} บาท</strong>
                </div>
              </div>
            )}
            {slipPreviewUrl && (
              <div className="success-slip">
                <div>
                  <strong>สลิปที่แนบมากับออเดอร์</strong>
                  <small>รูปนี้อยู่ชั่วคราวในหน้านี้และจะไม่ถูกเก็บในอุปกรณ์</small>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slipPreviewUrl} alt="สลิปที่แนบกับออเดอร์นี้" />
              </div>
            )}
            <button className="save-confirmation-button" type="button" onClick={() => void saveOrderConfirmation()} disabled={receiptSaveStatus === "saving"}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                <path d="M5 19h14" />
              </svg>
              {receiptSaveStatus === "saving"
                ? "กำลังสร้างใบยืนยัน..."
                : receiptSaveStatus === "saved"
                  ? "เปิดเมนูบันทึกแล้ว"
                  : "บันทึกใบยืนยันพร้อมสลิป"}
            </button>
            <p className="receipt-save-help">ใบยืนยันจะมีเลขออเดอร์ รายการ ยอด สถานะล่าสุด และรูปสลิปที่คุณแนบ</p>
            {receiptError && <p className="form-notice" role="alert">{receiptError}</p>}
            <Link className="track-order-link" href={`/track?order=${encodeURIComponent(order.id)}`}>ติดตามออเดอร์นี้</Link>
            <button type="button" onClick={order.onReset}>กลับหน้าร้าน</button>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {cart.items.length === 0 ? (
                <p className="empty-cart">ยังไม่มีสินค้าในตะกร้า</p>
              ) : (
                cart.items.map((product) => (
                  <div className="cart-line" key={product.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <small>{product.price === null ? "รอข้อมูลราคา" : `${product.price.toLocaleString("th-TH")} บาท/รายการ`}</small>
                    </div>
                    <div className="stepper compact">
                      <button className="decrease-button" type="button" onClick={() => cart.onUpdateQuantity(product.id, -1)} aria-label={`ลด ${product.name}`}>−</button>
                      <output>{cart.quantities[product.id]}</output>
                      <button
                        className="increase-button"
                        type="button"
                        onClick={() => cart.onUpdateQuantity(product.id, 1)}
                        aria-label={storefront.orderingOpen ? `เพิ่ม ${product.name}` : `ยังเพิ่ม ${product.name} ไม่ได้จนกว่าจะเปิดรอบ`}
                        disabled={!storefront.orderingOpen}
                      >+</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="summary-row"><span>รวมค่าสินค้า</span><strong>{cart.subtotal.toLocaleString("th-TH")} บาท</strong></div>
            {storefront.notice && <p ref={noticeRef} className="form-notice cart-notice" role="alert">{storefront.notice}</p>}
            {checkout.hasContent && (
              <div className="saved-draft-control" aria-label="ข้อมูลที่บันทึกชั่วคราว">
                {confirmingClear ? (
                  <>
                    <span role="alert"><strong>ล้างสินค้าและข้อมูลที่กรอกทั้งหมด?</strong><small>ข้อมูลบนเครื่องนี้จะหายทันที ย้อนกลับไม่ได้</small></span>
                    <span className="saved-draft-confirm-actions">
                      <button type="button" className="saved-draft-clear-btn" onClick={() => {
                        checkout.onClear();
                        if (storefront.rounds.length === 1) storefront.onSelectRound(storefront.rounds[0].id);
                        setConfirmingClear(false);
                      }}>ล้างเลย</button>
                      <button type="button" onClick={() => setConfirmingClear(false)}>เก็บไว้</button>
                    </span>
                  </>
                ) : (
                  <>
                    <span><strong>จำข้อมูลไว้บนเครื่องนี้</strong><small>ตะกร้าและข้อมูลที่กรอกจะอยู่ต่อ 24 ชั่วโมง</small></span>
                    <button type="button" onClick={() => setConfirmingClear(true)}>ล้างข้อมูล</button>
                  </>
                )}
              </div>
            )}

            {!storefront.orderingOpen ? (
              <section className="closed-round-cart" role="status" aria-labelledby="closed-round-title">
                <span className="closed-round-mark" aria-hidden="true">ปิด</span>
                <p className="eyebrow">ขณะนี้ยังไม่เปิดรับออเดอร์</p>
                <h3 id="closed-round-title">ตะกร้ารอบนี้ยังปิดอยู่</h3>
                <p className="closed-round-date">{storefront.nextRound ? `รอบถัดไปเปิดวันที่ ${formatStorefrontDateTime(storefront.nextRound.opensAt)}` : "ติดตามรอบถัดไปเร็ว ๆ นี้"}</p>
                <p className="closed-round-note">สินค้าในตะกร้ายังไม่ถูกจองและยังไม่ต้องชำระเงิน หากต้องการสอบถาม โทรหาร้านได้ทันที</p>
                <div className="closed-round-phone-links" aria-label="โทรสอบถามร้านเจ๊น้อย">
                  <a href={`tel:${storefront.phonePrimary.replace(/[^\d+]/g, "")}`} aria-label={`โทรหาร้านเจ๊น้อยที่เบอร์ ${storefront.phonePrimary}`}>☎ {storefront.phonePrimary}</a>
                  <a href={`tel:${storefront.phoneSecondary.replace(/[^\d+]/g, "")}`} aria-label={`โทรหาร้านเจ๊น้อยที่เบอร์ ${storefront.phoneSecondary}`}>☎ {storefront.phoneSecondary}</a>
                </div>
                <button className="closed-round-back" type="button" onClick={onClose}>กลับไปเลือกสินค้า</button>
              </section>
            ) : cart.items.length === 0 ? (
              <div style={{ padding: "16px 0", textAlign: "center" }}>
                <button className="closed-round-back" type="button" onClick={onClose}>
                  กลับไปเลือกสินค้า
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="summary-row pending-row">
                  <span>{storefront.fulfilment === "pickup" ? "รับเองหน้าร้าน" : "ค่าจัดส่งไปรษณีย์"}</span>
                  <strong>{storefront.fulfilment === "pickup" ? "0 บาท (ฟรี)" : storefront.shippingFee === null ? "รอข้อมูล" : `${storefront.shippingFee.toLocaleString("th-TH")} บาท`}</strong>
                </div>
                <div className="summary-row total-row">
                  <span>ยอดชำระทั้งหมด</span>
                  <strong>{order.shippingCost === null ? "รอข้อมูล" : `${order.orderTotal.toLocaleString("th-TH")} บาท`}</strong>
                </div>
                <div className="form-grid">
                  <p className="required-note full">ช่องที่มี <span className="req" aria-hidden="true">*</span> จำเป็นต้องกรอก</p>
                  <div className="round-selection full">
                    <span className="field-label">รอบจัดส่ง</span>
                    {storefront.rounds.length === 1 ? (
                      <div className="round-selection-state selected" role="status">
                        <strong>{storefront.rounds[0].label}</strong>
                        <small>เลือกรอบนี้ให้อัตโนมัติ · ปิดรับ {formatStorefrontDateTime(storefront.rounds[0].closesAt)}</small>
                      </div>
                    ) : (
                      <label className="round-select-label">
                        <span className="sr-only">เลือกรอบจัดส่ง</span>
                        <select name="roundId" required value={storefront.selectedRound} onChange={(event) => storefront.onSelectRound(event.target.value)}>
                          <option value="">เลือกรอบ</option>
                          {storefront.rounds.map((round) => <option value={round.id} key={round.id}>{round.label} · ปิดรับ {formatStorefrontDateTime(round.closesAt)}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  <fieldset className="fulfilment-choice full">
                    <legend>วิธีรับสินค้า</legend>
                    <label className={`${storefront.fulfilment === "pickup" ? "selected " : ""}${!storefront.pickupAddress ? "disabled" : ""}`.trim()}>
                      <input type="radio" name="fulfilment" value="pickup" checked={storefront.fulfilment === "pickup"} onChange={() => storefront.onSelectFulfilment("pickup")} disabled={!storefront.pickupAddress} />
                      <span><strong>รับเองหน้าร้าน</strong><small>{storefront.pickupAddress ?? "ปิดชั่วคราว · รอข้อมูลที่อยู่ร้าน"}</small></span>
                    </label>
                    <label className={storefront.fulfilment === "postal" ? "selected" : ""}>
                      <input type="radio" name="fulfilment" value="postal" checked={storefront.fulfilment === "postal"} onChange={() => storefront.onSelectFulfilment("postal")} />
                      <span><strong>จัดส่งไปรษณีย์</strong><small>{storefront.shippingFee === null ? "ค่าส่งรอข้อมูล" : `ค่าส่ง ${storefront.shippingFee.toLocaleString("th-TH")} บาท`}</small></span>
                    </label>
                  </fieldset>
                  {storefront.fulfilment === "pickup" && storefront.pickupMapUrl && (
                    <a className="pickup-map-link full" href={storefront.pickupMapUrl} target="_blank" rel="noopener noreferrer" aria-label="เปิดแผนที่ร้านเจ๊น้อยใน Google Maps แท็บใหม่">
                      <span aria-hidden="true">⌖</span> เปิดแผนที่ / นำทาง <span aria-hidden="true">↗</span>
                    </a>
                  )}
                  <label>ชื่อผู้รับ<span className="req" aria-hidden="true">*</span><input name="customerName" required autoComplete="name" placeholder="ชื่อ–นามสกุล" value={checkout.customerName} onChange={(event) => checkout.onChange("customerName", event.target.value)} /></label>
                  <label>
                    เบอร์โทร<span className="req" aria-hidden="true">*</span><input name="phone" required inputMode="tel" autoComplete="tel" pattern="0[0-9]{8,9}" maxLength={10} title="กรอกเบอร์โทร 9-10 หลัก เริ่มต้นด้วย 0" placeholder="08x-xxx-xxxx" aria-describedby="phone-help" value={checkout.phone} onChange={(event) => checkout.onChange("phone", event.target.value.replace(/\D/g, "").slice(0, 10))} />
                    <small className="field-help" id="phone-help">ใช้เบอร์นี้ติดตามสถานะออเดอร์ภายหลัง</small>
                  </label>
                  {storefront.fulfilment === "postal" && (
                    <AddressFields
                      values={{
                        addressLine: checkout.addressLine,
                        subdistrict: checkout.subdistrict,
                        district: checkout.district,
                        province: checkout.province,
                        postalCode: checkout.postalCode,
                      }}
                      onChange={checkout.onChange}
                    />
                  )}
                  <section className="remember-customer-control full" aria-label="การจำข้อมูลลูกค้าบนอุปกรณ์นี้">
                    <label>
                      <input type="checkbox" checked={checkout.rememberDetails} onChange={(event) => checkout.onToggleRemember(event.target.checked)} />
                      <span><strong>จำชื่อและที่อยู่บนอุปกรณ์นี้</strong><small>ช่วยเติมข้อมูลให้อัตโนมัติครั้งหน้า · เก็บไว้ 90 วัน และลบได้ทุกเมื่อ</small></span>
                    </label>
                    {checkout.rememberedForCurrentPhone && (
                      <div className="remembered-customer-status" role="status">
                        <span>✓ เติมข้อมูลที่จำไว้แล้ว แก้ไขได้ตามปกติ</span>
                        <button type="button" onClick={checkout.onForgetRemembered}>ลบข้อมูลที่จำไว้</button>
                      </div>
                    )}
                  </section>
                  <label className="full">หมายเหตุ<textarea name="note" rows={2} placeholder="เช่น เวลาที่สะดวกรับสินค้า (ถ้ามี)" value={checkout.note} onChange={(event) => checkout.onChange("note", event.target.value)} /></label>
                   <section className="payment-card full" aria-labelledby="promptpay-title">
                    <div className="payment-heading">
                      <span>พร้อมเพย์</span>
                      <strong id="promptpay-title">{storefront.promptPayName ?? "รอชื่อบัญชี"}</strong>
                      <small style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {storefront.promptPayId ?? "รอเลขพร้อมเพย์"}
                        {storefront.promptPayId && (
                          <button
                            type="button"
                            className="copy-badge-btn"
                            onClick={() => copyToClipboard(storefront.promptPayId!, "id")}
                          >
                            {copiedId ? "คัดลอกแล้ว!" : "คัดลอก"}
                          </button>
                        )}
                      </small>
                    </div>
                    {order.promptPayPayload ? (
                      <div className="qr-download-group">
                        <div className="qr-frame">
                          <QRCodeCanvas
                            ref={qrCanvasRef}
                            value={order.promptPayPayload}
                            size={1024}
                            level="M"
                            marginSize={4}
                            style={{ width: "100%", height: "100%", display: "block" }}
                            title={`QR พร้อมเพย์ ${storefront.promptPayName ?? "ร้านเจ๊น้อย"} ยอด ${order.orderTotal} บาท`}
                          />
                        </div>
                        <button className="qr-save-button" type="button" onClick={() => void saveQrImage()} disabled={qrSaveStatus === "saving"}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                            <path d="M5 19h14" />
                          </svg>
                          {qrSaveStatus === "saving" ? "กำลังเตรียมรูป..." : qrSaveStatus === "saved" ? "เปิดเมนูบันทึกแล้ว" : "บันทึก / แชร์รูป QR"}
                        </button>
                        {qrSaveStatus === "error" && <p className="qr-save-error" role="alert">บันทึกรูปไม่สำเร็จ กรุณาลองอีกครั้ง</p>}
                      </div>
                    ) : (
                      <div className="qr-placeholder" role="status">
                        <span>QR</span>
                        <p>{cart.items.length === 0 ? "เลือกสินค้าก่อนเพื่อสร้าง QR พร้อมยอด" : "ยังสร้าง QR ไม่ได้ กรุณาตรวจสอบยอดออเดอร์"}</p>
                      </div>
                    )}
                    <p className="payment-amount">
                      ยอดใน QR <strong>{order.promptPayPayload ? `${order.orderTotal.toLocaleString("th-TH")} บาท` : "—"}</strong>
                      {order.promptPayPayload && (
                        <button
                          type="button"
                          className="copy-badge-btn"
                          style={{ marginLeft: 8 }}
                          onClick={() => copyToClipboard(order.orderTotal.toString(), "amount")}
                        >
                          {copiedAmount ? "คัดลอกแล้ว!" : "คัดลอกยอด"}
                        </button>
                      )}
                    </p>
                    <p className="payment-check">ตรวจสอบชื่อผู้รับและยอดเงินในแอปธนาคารก่อนยืนยันทุกครั้ง</p>

                    <div className="slip-upload-field">
                      <span className="field-label">แนบสลิปโอนเงิน<span className="req" aria-hidden="true">*</span></span>
                      <input
                        ref={slipInputRef}
                        className="sr-only"
                        type="file"
                        name="slip"
                        accept="image/jpeg,image/png,image/webp"
                        aria-describedby="slip-help"
                        onChange={(event) => handleSlipChange(event.target.files?.[0] ?? null)}
                      />
                      {slipPreviewUrl && slipFile ? (
                        <div className="slip-preview-container">
                          <span className="slip-preview-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={slipPreviewUrl} alt="ตัวอย่างสลิปที่แนบ" />
                          </span>
                          <span className="slip-preview-info">
                            <strong>{slipFile.name}</strong>
                            <small>{formatFileSize(slipFile.size)}</small>
                          </span>
                          <button type="button" className="slip-preview-remove-btn" onClick={clearSlip}>ลบ</button>
                        </div>
                      ) : (
                        <button type="button" className="slip-upload-empty" onClick={() => slipInputRef.current?.click()}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="3" />
                            <circle cx="9" cy="9" r="2" />
                            <path d="m21 15-5-5-9 9" />
                          </svg>
                          <span>แตะเพื่อแนบรูปสลิปโอนเงิน</span>
                        </button>
                      )}
                      <small id="slip-help" className="field-help">รองรับไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB</small>
                      {slipError && <p className="form-notice" role="alert">{slipError}</p>}
                    </div>
                  </section>
                </div>
                {!storefront.secureWriteReady && <p className="preview-mode">โหมดดูตัวอย่าง · ยังไม่รับข้อมูลลูกค้าจนกว่าจะเชื่อมบัญชีระบบที่ปลอดภัย</p>}
                <button className="submit-order" type="submit" disabled={order.submitting || cart.items.length === 0}>
                  {order.submitting ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                      <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                        <line x1="12" y1="2" x2="12" y2="6"></line>
                        <line x1="12" y1="18" x2="12" y2="22"></line>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                        <line x1="2" y1="12" x2="6" y2="12"></line>
                        <line x1="18" y1="12" x2="22" y2="12"></line>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                      </svg>
                      กำลังบันทึก...
                    </span>
                  ) : (
                    "ยืนยันคำสั่งซื้อ"
                  )}
                </button>
              </form>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

type ConfirmationContent = Readonly<{
  documentTitle: string;
  statusLabel: string;
  message: string;
  statusColor: string;
  statusBackground: string;
}>;

type OrderConfirmationInput = Readonly<{
  storeName: string;
  orderId: string;
  paymentStatus: ClientPaymentStatus;
  recap: OrderRecap;
  slipFile: File;
}>;

function confirmationContent(status: ClientPaymentStatus): ConfirmationContent {
  if (status === "verified") {
    return {
      documentTitle: "ใบยืนยันการชำระเงิน",
      statusLabel: "ตรวจสลิปแล้ว · ชำระเรียบร้อย",
      message: "ตรวจสลิปและยอดชำระเรียบร้อยแล้ว ร้านจะเริ่มเตรียมสินค้า",
      statusColor: "#237343",
      statusBackground: "#E3F3E8",
    };
  }
  if (status === "invalid") {
    return {
      documentTitle: "ใบยืนยันคำสั่งซื้อ",
      statusLabel: "รอร้านตรวจสอบสลิป",
      message: "ยังยืนยันสลิปไม่ได้ ร้านเก็บออเดอร์ไว้แล้ว กรุณาอย่าโอนซ้ำจนกว่าร้านจะแจ้ง",
      statusColor: "#8D1014",
      statusBackground: "#FCE4E2",
    };
  }
  if (status === "review") {
    return {
      documentTitle: "ใบยืนยันคำสั่งซื้อและรับสลิป",
      statusLabel: "รับสลิปแล้ว · รอตรวจสอบ",
      message: "รับสลิปแล้วและอยู่ระหว่างตรวจสอบ ร้านจะยืนยันอีกครั้งก่อนเตรียมสินค้า",
      statusColor: "#7C5800",
      statusBackground: "#FFF1BF",
    };
  }
  return {
    documentTitle: "ใบยืนยันคำสั่งซื้อ",
    statusLabel: "รอการยืนยันชำระเงิน",
    message: "ร้านบันทึกออเดอร์ไว้แล้วและกำลังตรวจสอบการชำระเงิน",
    statusColor: "#7C5800",
    statusBackground: "#FFF1BF",
  };
}

async function createOrderConfirmationPng(input: OrderConfirmationInput): Promise<Blob> {
  await document.fonts.ready;
  const content = confirmationContent(input.paymentStatus);
  const canvas = document.createElement("canvas");
  const itemRowHeight = 60;
  const itemsTop = 570;
  const totalTop = itemsTop + input.recap.items.length * itemRowHeight + 34;
  const slipTop = totalTop + 150;
  canvas.width = 1080;
  canvas.height = slipTop + 690;
  canvas.style.position = "fixed";
  canvas.style.left = "-9999px";
  canvas.style.top = "0";
  document.body.appendChild(canvas);

  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("อุปกรณ์นี้ยังไม่รองรับการสร้างใบยืนยัน");
    context.direction = "ltr";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";

    context.fillStyle = "#FFF9EE";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#7A1F1F";
    context.fillRect(0, 0, canvas.width, 190);
    context.fillStyle = "#D4A017";
    context.fillRect(0, 190, canvas.width, 12);

    context.fillStyle = "#FFFFFF";
    fitFontSize(context, input.storeName, 920, 800, 56, 30);
    fillTextCentered(context, input.storeName, canvas.width / 2, 88);
    context.fillStyle = "#F5E8C7";
    fitFontSize(context, content.documentTitle, 900, 700, 34, 24);
    fillTextCentered(context, content.documentTitle, canvas.width / 2, 148);

    context.fillStyle = "#FFFFFF";
    fillRoundedRect(context, 64, 250, 952, 230, 30);
    context.strokeStyle = "#EAD6B5";
    context.lineWidth = 3;
    strokeRoundedRect(context, 64, 250, 952, 230, 30);
    context.fillStyle = "#765D56";
    context.font = '700 25px "Noto Sans Thai", sans-serif';
    context.fillText("เลขออเดอร์", 108, 310);
    context.fillStyle = "#281616";
    fitFontSize(context, input.orderId, 860, 800, 46, 28);
    context.fillText(input.orderId, 108, 370);

    context.fillStyle = content.statusBackground;
    const statusWidth = Math.min(840, Math.max(360, measureTextAtFont(context, content.statusLabel, 700, 26) + 60));
    fillRoundedRect(context, 108, 400, statusWidth, 52, 26);
    context.fillStyle = content.statusColor;
    context.font = '700 26px "Noto Sans Thai", sans-serif';
    context.fillText(content.statusLabel, 138, 435);

    context.fillStyle = "#281616";
    context.font = '800 30px "Noto Sans Thai", sans-serif';
    context.fillText("รายการสินค้า", 78, 535);
    input.recap.items.forEach((item, index) => {
      const y = itemsTop + index * itemRowHeight;
      const itemText = `${item.name} × ${item.quantity}`;
      const amountText = `${item.lineTotal.toLocaleString("th-TH")} บาท`;
      context.fillStyle = "#281616";
      fitFontSize(context, itemText, 650, 600, 27, 18);
      context.fillText(itemText, 78, y);
      context.fillStyle = "#765D56";
      fitFontSize(context, amountText, 260, 700, 27, 18);
      context.fillText(amountText, 1002 - context.measureText(amountText).width, y);
    });
    if (input.recap.shippingCost > 0) {
      context.fillStyle = "#765D56";
      context.font = '600 24px "Noto Sans Thai", sans-serif';
      context.fillText(`รวมค่าจัดส่ง ${input.recap.shippingCost.toLocaleString("th-TH")} บาท`, 78, totalTop - 24);
    }
    context.strokeStyle = "#EAD6B5";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(78, totalTop);
    context.lineTo(1002, totalTop);
    context.stroke();
    const totalText = `ยอดชำระทั้งหมด  ${input.recap.total.toLocaleString("th-TH")} บาท`;
    context.fillStyle = "#8D1014";
    fitFontSize(context, totalText, 924, 800, 40, 24);
    context.fillText(totalText, 78, totalTop + 66);

    context.fillStyle = "#281616";
    context.font = '800 30px "Noto Sans Thai", sans-serif';
    context.fillText("สลิปที่แนบมากับออเดอร์", 78, slipTop);
    context.fillStyle = "#765D56";
    context.font = '500 22px "Noto Sans Thai", sans-serif';
    context.fillText("สำเนาจากไฟล์ที่ลูกค้าเลือกบนอุปกรณ์นี้", 78, slipTop + 40);

    const slipImage = await loadLocalImage(input.slipFile);
    const frame = { x: 78, y: slipTop + 72, width: 924, height: 470 };
    context.fillStyle = "#FFFFFF";
    fillRoundedRect(context, frame.x, frame.y, frame.width, frame.height, 24);
    context.strokeStyle = "#EAD6B5";
    context.lineWidth = 3;
    strokeRoundedRect(context, frame.x, frame.y, frame.width, frame.height, 24);
    drawImageContained(context, slipImage, frame.x + 18, frame.y + 18, frame.width - 36, frame.height - 36);

    context.fillStyle = "#765D56";
    context.font = '600 22px "Noto Sans Thai", sans-serif';
    const issuedText = `สร้างเมื่อ ${new Date().toLocaleString("th-TH")} · กรุณาเก็บเลขออเดอร์ไว้ติดตามสินค้า`;
    fitFontSize(context, issuedText, 924, 600, 22, 16);
    context.fillText(issuedText, 78, slipTop + 600);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("สร้างรูปใบยืนยันไม่สำเร็จ กรุณาลองใหม่"));
      }, "image/png");
    });
  } finally {
    canvas.remove();
  }
}

function measureTextAtFont(context: CanvasRenderingContext2D, text: string, weight: number, size: number): number {
  context.font = `${weight} ${size}px "Noto Sans Thai", sans-serif`;
  return context.measureText(text).width;
}

async function loadLocalImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("รูปสลิปที่แนบไม่สามารถนำมาสร้างใบยืนยันได้"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawImageContained(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  roundedRectPath(context, x, y, width, height, radius);
  context.fill();
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  roundedRectPath(context, x, y, width, height, radius);
  context.stroke();
}

// iOS Safari has been observed drawing fillText with textAlign "center" at
// the wrong x position on this canvas (text runs off the right edge instead
// of centering) while Android/desktop render it correctly — measuring the
// text ourselves and drawing with the default left alignment sidesteps
// whatever WebKit is getting wrong about "center" here.
function fillTextCentered(context: CanvasRenderingContext2D, text: string, centerX: number, y: number) {
  const width = context.measureText(text).width;
  context.fillText(text, centerX - width / 2, y);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPromptPayId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const separator = dataUrl.indexOf(",");
  const metadata = dataUrl.slice(0, separator);
  const encoded = dataUrl.slice(separator + 1);
  const mimeType = metadata.match(/^data:([^;]+)/)?.[1] ?? "image/png";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function downloadBlob(blob: Blob, filename: string) {
  const imageUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = imageUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1_000);
}

function showQrSaveSuccess(setStatus: (status: "idle" | "saving" | "saved" | "error") => void) {
  setStatus("saved");
  window.setTimeout(() => setStatus("idle"), 2_500);
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function formatStorefrontDateTime(value: string): string {
  if (!value) return "—";
  try {
    const [date, time] = value.split("T");
    const [year, month, day] = date.split("-");
    const mIdx = parseInt(month, 10) - 1;
    const mStr = THAI_MONTHS[mIdx] ?? month;
    const beYear = parseInt(year, 10) + 543;
    const formattedTime = time ? ` เวลา ${time.slice(0, 5)} น.` : "";
    return `${parseInt(day, 10)} ${mStr} ${beYear}${formattedTime}`;
  } catch {
    return value;
  }
}
