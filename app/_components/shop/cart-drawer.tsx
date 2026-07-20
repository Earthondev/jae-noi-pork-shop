import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import type { Quantities } from "../../_hooks/use-checkout-draft";
import type { Fulfilment, PreorderRound, Product } from "../../_hooks/use-storefront";
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
  const [qrSaveStatus, setQrSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [prevOrderId, setPrevOrderId] = useState(order.id);
  const successCardRef = useRef<HTMLDivElement | null>(null);

  // Reset the attached slip once an order has just been placed successfully,
  // following React's documented pattern for adjusting state when a prop
  // changes (done during render, not in an effect, to avoid an extra render).
  if (order.id !== prevOrderId) {
    setPrevOrderId(order.id);
    if (order.id) {
      setSlipFile(null);
      setSlipPreviewUrl(null);
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

  const copyToClipboard = async (text: string, type: "id" | "amount") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "id") {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      } else {
        setCopiedAmount(true);
        setTimeout(() => setCopiedAmount(false), 2000);
      }
    } catch {
      // fallback
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
    const context = canvas.getContext("2d");
    if (!context) {
      setQrSaveStatus("error");
      return;
    }

    context.fillStyle = "#FAF9F6";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "#7A1F1F";
    context.fillRect(0, 0, canvas.width, 200);
    context.fillStyle = "#D4A017";
    context.fillRect(0, 200, canvas.width, 12);

    context.textAlign = "center";
    context.fillStyle = "#FFFFFF";
    fitFontSize(context, storefront.storeName, 920, 800, 58, 32);
    context.fillText(storefront.storeName, canvas.width / 2, 96);
    context.font = '700 32px "Noto Sans Thai", sans-serif';
    context.fillStyle = "#F5E8C7";
    context.fillText("พร้อมเพย์ · สแกนเพื่อชำระเงิน", canvas.width / 2, 160);

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
    context.fillText("สแกนด้วยแอปธนาคารใดก็ได้", canvas.width / 2, 918);

    // The pill background is sized to the actual measured text width, not a
    // fixed guess — a fixed-width pill let long amounts spill past its
    // right edge onto the white card behind it, where white-on-white text
    // simply vanished instead of visibly clipping.
    const amountText = `ยอดชำระ ${order.orderTotal.toLocaleString("th-TH")} บาท`;
    const amountPaddingX = 56;
    const amountMaxWidth = 880;
    fitFontSize(context, amountText, amountMaxWidth - amountPaddingX * 2, 800, 44, 28);
    const amountTextWidth = context.measureText(amountText).width;
    const pillWidth = Math.min(amountMaxWidth, Math.max(320, amountTextWidth + amountPaddingX * 2));
    context.fillStyle = "#7A1F1F";
    fillRoundedRect(context, (canvas.width - pillWidth) / 2, 946, pillWidth, 92, 46);
    context.fillStyle = "#FFFFFF";
    context.fillText(amountText, canvas.width / 2, 1006);

    context.fillStyle = "#6E5855";
    context.font = '600 26px "Noto Sans Thai", sans-serif';
    context.fillText("ชื่อบัญชีพร้อมเพย์", canvas.width / 2, 1082);
    context.fillStyle = "#2A1816";
    const promptPayNameText = storefront.promptPayName ?? "ร้านเจ๊น้อย";
    fitFontSize(context, promptPayNameText, 820, 800, 40, 24);
    context.fillText(promptPayNameText, canvas.width / 2, 1130);
    context.fillStyle = "#6E5855";
    context.font = '700 30px "Noto Sans Thai", sans-serif';
    context.fillText(formatPromptPayId(storefront.promptPayId), canvas.width / 2, 1172);

    context.fillStyle = "#7A1F1F";
    context.font = '800 34px "Noto Sans Thai", sans-serif';
    context.fillText("อร่อยจากใจเจ๊น้อย · ขอบคุณที่อุดหนุนค่ะ", canvas.width / 2, 1248);

    context.fillStyle = "#6E5855";
    context.font = '600 24px "Noto Sans Thai", sans-serif';
    context.fillText("กรุณาตรวจสอบชื่อผู้รับและยอดเงินก่อนยืนยันการโอน", canvas.width / 2, 1312);

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
  };

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
            <p>เลขที่ออเดอร์</p>
            <strong>{order.id}</strong>
            <p>
              {order.paymentStatus === "verified"
                ? "ตรวจสลิปและยอดชำระเรียบร้อยแล้ว ร้านจะเริ่มเตรียมสินค้า"
                : order.paymentStatus === "review"
                  ? "สลิปอยู่ระหว่างตรวจสอบ ร้านจะยืนยันอีกครั้งก่อนเตรียมสินค้า"
                  : order.paymentStatus === "invalid"
                    ? "ยังยืนยันสลิปไม่ได้ ร้านเก็บออเดอร์ไว้แล้วและจะตรวจสอบหรือติดต่อกลับ กรุณาอย่าโอนซ้ำจนกว่าร้านจะแจ้ง"
                    : "ยังไม่ได้แนบสลิป ออเดอร์อยู่ในสถานะรอชำระเงิน"}
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
                      <button className="increase-button" type="button" onClick={() => cart.onUpdateQuantity(product.id, 1)} aria-label={`เพิ่ม ${product.name}`}>+</button>
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

            {storefront.rounds.length === 0 ? (
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
                      <span><strong>จำชื่อและที่อยู่บนอุปกรณ์นี้</strong><small>ช่วยเติมข้อมูลให้อัตโนมัติครั้งหน้า · เก็บไว้ 180 วัน</small></span>
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

/** Sets context.font to the largest size (in 2px steps) that fits `text` within `maxWidth`, and returns the final size. */
function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  startSize: number,
  minSize: number,
): number {
  let size = startSize;
  context.font = `${weight} ${size}px "Noto Sans Thai", sans-serif`;
  while (context.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    context.font = `${weight} ${size}px "Noto Sans Thai", sans-serif`;
  }
  return size;
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
