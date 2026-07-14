import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { FormEvent, RefObject } from "react";
import type { Quantities } from "../../_hooks/use-cart";
import type { Fulfilment, PreorderRound, Product } from "../../_hooks/use-storefront";

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
  storefront: Readonly<{
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

export function CartDrawer({ drawerRef, onClose, cart, storefront, order }: CartDrawerProps) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={drawerRef} className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
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

            {storefront.rounds.length === 0 ? (
              <section className="closed-round-cart" role="status" aria-labelledby="closed-round-title">
                <span className="closed-round-mark" aria-hidden="true">ปิด</span>
                <p className="eyebrow">ขณะนี้ยังไม่เปิดรับออเดอร์</p>
                <h3 id="closed-round-title">ตะกร้ารอบนี้ยังปิดอยู่</h3>
                <p className="closed-round-date">{storefront.nextRound ? `รอบถัดไปเปิดวันที่ ${storefront.nextRound.opensAt}` : "ติดตามรอบถัดไปเร็ว ๆ นี้"}</p>
                <p className="closed-round-note">สินค้าในตะกร้ายังไม่ถูกจองและยังไม่ต้องชำระเงิน หากต้องการสอบถาม โทรหาร้านได้ทันที</p>
                <div className="closed-round-phone-links" aria-label="โทรสอบถามร้านเจ๊น้อย">
                  <a href="tel:0872416773" aria-label="โทรหาร้านเจ๊น้อยที่เบอร์ 087 241 6773">☎ 087-2416773</a>
                  <a href="tel:0878755479" aria-label="โทรหาร้านเจ๊น้อยที่เบอร์ 087 875 5479">☎ 087-8755479</a>
                </div>
                <button className="closed-round-back" type="button" onClick={onClose}>กลับไปเลือกสินค้า</button>
              </section>
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
                  <label>ชื่อผู้รับ<input name="customerName" required autoComplete="name" placeholder="ชื่อ–นามสกุล" /></label>
                  <label>
                    เบอร์โทร<input name="phone" required inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx" aria-describedby="phone-help" />
                    <small className="field-help" id="phone-help">ใช้เบอร์นี้เช็กสถานะออเดอร์ภายหลังด้วยเลข 4 ตัวท้าย</small>
                  </label>
                  {storefront.fulfilment === "postal" && (
                    <label className="full">ที่อยู่จัดส่ง<textarea name="address" required autoComplete="street-address" rows={3} placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" /></label>
                  )}
                  <label className="full">หมายเหตุ<textarea name="note" rows={2} placeholder="เช่น เวลาที่สะดวกรับสินค้า (ถ้ามี)" /></label>
                  <section className="payment-card full" aria-labelledby="promptpay-title">
                    <div className="payment-heading">
                      <span>พร้อมเพย์</span>
                      <strong id="promptpay-title">{storefront.promptPayName ?? "รอชื่อบัญชี"}</strong>
                      <small>{storefront.promptPayId ?? "รอเลขพร้อมเพย์"}</small>
                    </div>
                    {order.promptPayPayload ? (
                      <div className="qr-frame">
                        <QRCodeSVG value={order.promptPayPayload} size={216} level="M" marginSize={4} title={`QR พร้อมเพย์ ${storefront.promptPayName ?? "ร้านเจ๊น้อย"} ยอด ${order.orderTotal} บาท`} />
                      </div>
                    ) : (
                      <div className="qr-placeholder" role="status">
                        <span>QR</span>
                        <p>{cart.items.length === 0 ? "เลือกสินค้าก่อนเพื่อสร้าง QR พร้อมยอด" : "ยังสร้าง QR ไม่ได้ กรุณาตรวจสอบยอดออเดอร์"}</p>
                      </div>
                    )}
                    <p className="payment-amount">ยอดใน QR <strong>{order.promptPayPayload ? `${order.orderTotal.toLocaleString("th-TH")} บาท` : "—"}</strong></p>
                    <p className="payment-check">ตรวจสอบชื่อผู้รับและยอดเงินในแอปธนาคารก่อนยืนยันทุกครั้ง</p>
                  </section>
                  <label className="full file-label">แนบสลิป (ส่งภายหลังได้)<input name="slip" type="file" accept="image/jpeg,image/png,image/webp" /></label>
                </div>
                {!storefront.secureWriteReady && <p className="preview-mode">โหมดดูตัวอย่าง · ยังไม่รับข้อมูลลูกค้าจนกว่าจะเชื่อมบัญชีระบบที่ปลอดภัย</p>}
                <button className="submit-order" type="submit" disabled={order.submitting || cart.items.length === 0}>{order.submitting ? "กำลังบันทึก..." : "ยืนยันคำสั่งซื้อ"}</button>
              </form>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
