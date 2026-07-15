import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import type { Quantities } from "../../_hooks/use-checkout-draft";
import type { Fulfilment, PreorderRound, Product } from "../../_hooks/use-storefront";
import { AddressFields, type AddressFieldName } from "./address-fields";

type ClientPaymentStatus = "waiting" | "verified" | "review" | "invalid";

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
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onReset: () => void;
  }>;
}>;

export function CartDrawer({ drawerRef, onClose, cart, checkout, storefront, order }: CartDrawerProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [qrSaveStatus, setQrSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  const saveQrImage = () => {
    const qrCanvas = qrCanvasRef.current;
    if (!qrCanvas || !order.promptPayPayload || !storefront.promptPayId) {
      setQrSaveStatus("error");
      return;
    }

    setQrSaveStatus("saving");
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
    context.fillRect(0, 0, canvas.width, 230);
    context.fillStyle = "#D4A017";
    context.fillRect(0, 218, canvas.width, 12);

    context.textAlign = "center";
    context.fillStyle = "#FFFFFF";
    context.font = '800 54px "Noto Sans Thai", sans-serif';
    context.fillText(storefront.storeName, canvas.width / 2, 92);
    context.font = '700 32px "Noto Sans Thai", sans-serif';
    context.fillStyle = "#F5E8C7";
    context.fillText("พร้อมเพย์ · สแกนเพื่อชำระเงิน", canvas.width / 2, 154);

    context.fillStyle = "#FFFFFF";
    fillRoundedRect(context, 60, 178, 960, 1092, 42);
    context.strokeStyle = "#EBD6C8";
    context.lineWidth = 4;
    strokeRoundedRect(context, 60, 178, 960, 1092, 42);

    context.fillStyle = "#F5E8C7";
    fillRoundedRect(context, 90, 286, 190, 500, 36);
    context.fillStyle = "#D4A017";
    context.beginPath();
    context.arc(185, 398, 52, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#FFFFFF";
    context.font = '800 25px "Noto Sans Thai", sans-serif';
    context.fillText("ขอบคุณ", 185, 407);
    context.fillStyle = "#7A1F1F";
    context.font = '800 32px "Noto Sans Thai", sans-serif';
    context.fillText("อร่อย", 185, 522);
    context.fillText("จากใจ", 185, 568);
    context.fillText("เจ๊น้อย", 185, 614);
    context.fillStyle = "#6E5855";
    context.font = '600 22px "Noto Sans Thai", sans-serif';
    context.fillText("ร้านท้องถิ่น", 185, 698);
    context.fillText("ส่งตรงถึงคุณ", 185, 732);

    context.fillStyle = "#FFFFFF";
    context.fillRect(310, 220, 670, 670);
    context.drawImage(qrCanvas, 335, 245, 620, 620);

    context.save();
    context.setLineDash([16, 12]);
    context.strokeStyle = "#D4A017";
    context.lineWidth = 4;
    context.fillStyle = "#FAF9F6";
    fillRoundedRect(context, 86, 852, 300, 360, 36);
    strokeRoundedRect(context, 86, 852, 300, 360, 36);
    context.restore();
    context.fillStyle = "#EBD6C8";
    context.beginPath();
    context.arc(236, 984, 62, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#7A1F1F";
    context.font = '800 30px "Noto Sans Thai", sans-serif';
    context.fillText("รอรูป", 236, 993);
    context.fillStyle = "#6E5855";
    context.font = '700 25px "Noto Sans Thai", sans-serif';
    context.fillText("รูปเจ๊น้อยยืนไหว้", 236, 1090);
    context.font = '600 21px "Noto Sans Thai", sans-serif';
    context.fillText("จะวางในพื้นที่นี้", 236, 1128);

    const detailsCenter = 700;
    context.fillStyle = "#6E5855";
    context.font = '600 24px "Noto Sans Thai", sans-serif';
    context.fillText("ชื่อผู้รับ", detailsCenter, 924);
    context.fillStyle = "#2A1816";
    context.font = '800 36px "Noto Sans Thai", sans-serif';
    context.fillText(storefront.promptPayName ?? "ร้านเจ๊น้อย", detailsCenter, 970);
    context.fillStyle = "#6E5855";
    context.font = '600 28px "Noto Sans Thai", sans-serif';
    context.fillText(formatPromptPayId(storefront.promptPayId), detailsCenter, 1012);

    context.fillStyle = "#F5E8C7";
    fillRoundedRect(context, 430, 1042, 540, 88, 28);
    context.fillStyle = "#7A1F1F";
    context.font = '800 36px "Noto Sans Thai", sans-serif';
    context.fillText(`ยอดชำระ ${order.orderTotal.toLocaleString("th-TH")} บาท`, detailsCenter, 1100);

    context.fillStyle = "#7A1F1F";
    context.font = '800 31px "Noto Sans Thai", sans-serif';
    context.fillText("เจ๊น้อย ขอขอบคุณลูกค้า", detailsCenter, 1172);
    context.fillText("ที่อุดหนุนค่ะ", detailsCenter, 1215);

    context.fillStyle = "#6E5855";
    context.font = '600 24px "Noto Sans Thai", sans-serif';
    context.fillText("กรุณาตรวจสอบชื่อผู้รับและยอดเงินก่อนยืนยันการโอน", canvas.width / 2, 1320);

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
          <div className={`success-card${order.paymentStatus === "invalid" ? " invalid" : ""}`} role={order.paymentStatus === "invalid" ? "alert" : "status"}>
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
                      <small>{product.price === null ? "รอข้อมูลราคา" : `${product.price} บาท/รายการ`}</small>
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
            <div className="summary-row"><span>รวมค่าสินค้า</span><strong>{cart.subtotal} บาท</strong></div>
            {storefront.notice && <p className="form-notice cart-notice" role="alert">{storefront.notice}</p>}
            {checkout.hasContent && (
              <div className="saved-draft-control" aria-label="ข้อมูลที่บันทึกชั่วคราว">
                <span><strong>จำข้อมูลไว้บนเครื่องนี้</strong><small>ตะกร้าและข้อมูลที่กรอกจะอยู่ต่อ 24 ชั่วโมง</small></span>
                <button type="button" onClick={() => {
                  if (!window.confirm("ล้างสินค้าและข้อมูลที่กรอกไว้ทั้งหมดจากเครื่องนี้?")) return;
                  checkout.onClear();
                  if (storefront.rounds.length === 1) storefront.onSelectRound(storefront.rounds[0].id);
                }}>ล้างข้อมูล</button>
              </div>
            )}

            {storefront.rounds.length === 0 ? (
              <section className="closed-round-cart" role="status" aria-labelledby="closed-round-title">
                <span className="closed-round-mark" aria-hidden="true">ปิด</span>
                <p className="eyebrow">ขณะนี้ยังไม่เปิดรับออเดอร์</p>
                <h3 id="closed-round-title">ตะกร้ารอบนี้ยังปิดอยู่</h3>
                <p className="closed-round-date">{storefront.nextRound ? `รอบถัดไปเปิดวันที่ ${storefront.nextRound.opensAt}` : "ติดตามรอบถัดไปเร็ว ๆ นี้"}</p>
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
              <form onSubmit={order.onSubmit}>
                <div className="summary-row pending-row">
                  <span>{storefront.fulfilment === "pickup" ? "รับเองหน้าร้าน" : "ค่าจัดส่งไปรษณีย์"}</span>
                  <strong>{storefront.fulfilment === "pickup" ? "0 บาท (ฟรี)" : storefront.shippingFee === null ? "รอข้อมูล" : `${storefront.shippingFee} บาท`}</strong>
                </div>
                <div className="summary-row total-row">
                  <span>ยอดชำระทั้งหมด</span>
                  <strong>{order.shippingCost === null ? "รอข้อมูล" : `${order.orderTotal.toLocaleString("th-TH")} บาท`}</strong>
                </div>
                <div className="form-grid">
                  <div className="round-selection full">
                    <span className="field-label">รอบจัดส่ง</span>
                    {storefront.rounds.length === 1 ? (
                      <div className="round-selection-state selected" role="status">
                        <strong>{storefront.rounds[0].label}</strong>
                        <small>เลือกรอบนี้ให้อัตโนมัติ · ปิดรับ {storefront.rounds[0].closesAt}</small>
                      </div>
                    ) : (
                      <label className="round-select-label">
                        <span className="sr-only">เลือกรอบจัดส่ง</span>
                        <select name="roundId" required value={storefront.selectedRound} onChange={(event) => storefront.onSelectRound(event.target.value)}>
                          <option value="">เลือกรอบ</option>
                          {storefront.rounds.map((round) => <option value={round.id} key={round.id}>{round.label} · ปิดรับ {round.closesAt}</option>)}
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
                      <span><strong>จัดส่งไปรษณีย์</strong><small>{storefront.shippingFee === null ? "ค่าส่งรอข้อมูล" : `ค่าส่ง ${storefront.shippingFee} บาท`}</small></span>
                    </label>
                  </fieldset>
                  {storefront.fulfilment === "pickup" && storefront.pickupMapUrl && (
                    <a className="pickup-map-link full" href={storefront.pickupMapUrl} target="_blank" rel="noopener noreferrer" aria-label="เปิดแผนที่ร้านเจ๊น้อยใน Google Maps แท็บใหม่">
                      <span aria-hidden="true">⌖</span> เปิดแผนที่ / นำทาง <span aria-hidden="true">↗</span>
                    </a>
                  )}
                  <label>ชื่อผู้รับ<input name="customerName" required autoComplete="name" placeholder="ชื่อ–นามสกุล" value={checkout.customerName} onChange={(event) => checkout.onChange("customerName", event.target.value)} /></label>
                  <label>
                    เบอร์โทร<input name="phone" required inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx" aria-describedby="phone-help" value={checkout.phone} onChange={(event) => checkout.onChange("phone", event.target.value)} />
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
                        <button className="qr-save-button" type="button" onClick={saveQrImage} disabled={qrSaveStatus === "saving"}>
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
