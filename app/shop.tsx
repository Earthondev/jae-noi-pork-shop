"use client";

import Image from "next/image";
import Link from "next/link";
import generatePromptPayPayload from "promptpay-qr";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "./_components/shop/bottom-nav";
import { CartDrawer } from "./_components/shop/cart-drawer";
import { Hero } from "./_components/shop/hero";
import { PhoneStrip } from "./_components/shop/phone-strip";
import { ProductGrid } from "./_components/shop/product-grid";
import { SiteHeader } from "./_components/shop/site-header";
import { useCart } from "./_hooks/use-cart";
import { useStorefront } from "./_hooks/use-storefront";

type ClientPaymentStatus = "waiting" | "verified" | "review" | "invalid";

export function Shop() {
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<ClientPaymentStatus>("waiting");
  const drawerRef = useRef<HTMLElement>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const { quantities, updateQuantity: updateCartQuantity, clearCart, pruneUnavailable } = useCart();
  const storefront = useStorefront({ cartOpen, pruneUnavailable });

  const updateQuantity = useCallback(
    (productId: string, delta: number) => updateCartQuantity(storefront.products, productId, delta),
    [updateCartQuantity, storefront.products],
  );

  useEffect(() => {
    if (!cartOpen) return;
    const drawer = drawerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(drawer?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    focusable()[0]?.focus();
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setCartOpen(false);
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      previousFocus?.focus();
    };
  }, [cartOpen]);

  const cartItems = storefront.products.filter((product) => (quantities[product.id] ?? 0) > 0);
  const cartCount = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const subtotal = useMemo(
    () =>
      storefront.products.reduce(
        (sum, product) => sum + (product.price ?? 0) * (quantities[product.id] ?? 0),
        0,
      ),
    [storefront.products, quantities],
  );
  const unavailableProduct = cartItems.find((product) => product.status !== "เปิดขาย" || product.price === null);
  const shippingCost = storefront.fulfilment === "postal" ? storefront.shippingFee : 0;
  const orderTotal = subtotal + (shippingCost ?? 0);
  let promptPayPayload: string | null = null;
  if (storefront.promptPayId && orderTotal > 0 && !unavailableProduct && shippingCost !== null) {
    try {
      promptPayPayload = generatePromptPayPayload(storefront.promptPayId, { amount: orderTotal });
    } catch {
      promptPayPayload = null;
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cartItems.length === 0) {
      storefront.setNotice("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    if (unavailableProduct) {
      storefront.setNotice(`${unavailableProduct.name} ไม่พร้อมขาย จึงยังยืนยันออเดอร์รายการนี้ไม่ได้`);
      return;
    }
    if (!storefront.selectedRound) { storefront.setNotice("ขณะนี้ยังไม่มีรอบพรีออเดอร์ที่เปิดรับ"); return; }
    if (storefront.fulfilment === "postal" && storefront.shippingFee === null) { storefront.setNotice("ค่าจัดส่งไปรษณีย์ยังรอข้อมูล"); return; }
    if (!storefront.secureWriteReady) { storefront.setNotice("โหมดดูตัวอย่าง: การบันทึกออเดอร์อย่างปลอดภัยกำลังรอเชื่อมบัญชีระบบ Google"); return; }

    setSubmitting(true);
    storefront.setNotice(null);
    const form = new FormData(event.currentTarget);
    form.set(
      "items",
      JSON.stringify(
        cartItems.map((product) => ({
          productId: product.id,
          name: product.name,
          quantity: quantities[product.id],
          unitPrice: product.price,
        })),
      ),
    );
    form.set("roundId", storefront.selectedRound);
    form.set("fulfilment", storefront.fulfilment);
    idempotencyKeyRef.current ??= crypto.randomUUID();
    form.set("idempotencyKey", idempotencyKeyRef.current);

    try {
      const response = await fetch("/api/orders", { method: "POST", body: form });
      const result = (await response.json()) as { orderId?: string; paymentStatus?: ClientPaymentStatus; error?: string };
      if (!response.ok || !result.orderId) throw new Error(result.error ?? "บันทึกออเดอร์ไม่สำเร็จ");
      setOrderId(result.orderId);
      setOrderPaymentStatus(result.paymentStatus ?? "waiting");
      idempotencyKeyRef.current = null;
      clearCart();
    } catch (error) {
      await storefront.refreshStorefront();
      storefront.setNotice(error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  function resetOrder() {
    setOrderId(null);
    setOrderPaymentStatus("waiting");
    setCartOpen(false);
  }

  return (
    <main>
      <SiteHeader cartCount={cartCount} onOpenCart={() => setCartOpen(true)} />
      <Hero storeLoading={storefront.storeLoading} rounds={storefront.rounds} nextRound={storefront.nextRound} />
      <ProductGrid
        storeLoading={storefront.storeLoading}
        products={storefront.products}
        quantities={quantities}
        onUpdateQuantity={updateQuantity}
      />
      <PhoneStrip />

      <section className="marquee" aria-label="จุดเด่นสินค้า">
        <div>ทำสดทุกวัน <span>◆</span> สูตรดั้งเดิมตะคร้อ <span>◆</span> แพ็กพร้อมส่ง <span>◆</span> อร่อยถึงเครื่อง</div>
      </section>

      <section className="order-flow" id="how-to-order">
        <div><span>1</span><h3>เลือกสินค้า</h3><p>เพิ่มจำนวนที่ต้องการลงตะกร้า</p></div>
        <div><span>2</span><h3>กรอกที่อยู่</h3><p>แจ้งชื่อ เบอร์โทร และที่จัดส่ง</p></div>
        <div><span>3</span><h3>ชำระเงิน</h3><p>สแกน QR พร้อมยอดออเดอร์ แล้วแนบสลิป</p></div>
      </section>

      <section className="story" id="story">
        <Image src="/images/products/jae-noi-presenting-pork-rinds-large-tubs.jpg" alt="เจ๊น้อยนำเสนอแคปหมูบรรจุกล่อง" width={760} height={960} />
        <div><p className="eyebrow">ทำเอง ขายเอง ใส่ใจทุกกล่อง</p><h2>ของดีจากเขียงหมูตะคร้อ</h2><p>รสชาติคุ้นเคยจากร้านท้องถิ่น ส่งต่อด้วยวัตถุดิบที่คัดแล้วและความตั้งใจในทุกแพ็ก จากมือเจ๊น้อยถึงมือลูกค้า</p><blockquote>“ให้ลูกค้าได้ของอร่อย เหมือนมาซื้อถึงหน้าร้าน”</blockquote></div>
      </section>

      <footer><Image src="/images/products/jae-noi-shop-logo.jpg" alt="เจ๊น้อย เขียงหมูตะคร้อ" width={150} height={90} /><p>โทรสั่งซื้อ / สอบถาม</p><div className="footer-phone-links" aria-label="เบอร์โทรร้านเจ๊น้อย"><a href="tel:0872416773">087-2416773</a><a href="tel:0878755479">087-8755479</a></div><Link href="/track">ติดตามออเดอร์</Link></footer>

      {cartOpen && (
        <CartDrawer
          drawerRef={drawerRef}
          onClose={() => setCartOpen(false)}
          cart={{ items: cartItems, quantities, subtotal, onUpdateQuantity: updateQuantity }}
          storefront={{
            rounds: storefront.rounds,
            nextRound: storefront.nextRound,
            selectedRound: storefront.selectedRound,
            onSelectRound: storefront.setSelectedRound,
            fulfilment: storefront.fulfilment,
            onSelectFulfilment: storefront.setFulfilment,
            shippingFee: storefront.shippingFee,
            pickupAddress: storefront.pickupAddress,
            pickupMapUrl: storefront.pickupMapUrl,
            promptPayId: storefront.promptPayId,
            promptPayName: storefront.promptPayName,
            secureWriteReady: storefront.secureWriteReady,
            notice: storefront.notice,
          }}
          order={{
            id: orderId,
            paymentStatus: orderPaymentStatus,
            submitting,
            promptPayPayload,
            orderTotal,
            shippingCost,
            onSubmit: submitOrder,
            onReset: resetOrder,
          }}
        />
      )}
      {storefront.notice && !cartOpen && (
        <div className={`storefront-notice${cartCount > 0 ? " with-cart" : ""}`} role="status">
          <span>{storefront.notice}</span>
          <button type="button" onClick={() => storefront.setNotice(null)} aria-label="ปิดข้อความแจ้งเตือน">×</button>
        </div>
      )}
      {cartCount > 0 && !cartOpen && (
        <button className="floating-cart" type="button" onClick={() => setCartOpen(true)} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น รวมค่าสินค้า ${subtotal} บาท`}>
          <span className="floating-cart-copy"><strong>ตะกร้า · {cartCount} ชิ้น</strong><small>รวมสินค้า {subtotal.toLocaleString("th-TH")} บาท</small></span>
          <span className="floating-cart-arrow" aria-hidden="true">ดูตะกร้า →</span>
        </button>
      )}

      <BottomNav cartCount={cartCount} onOpenCart={() => setCartOpen(true)} />
    </main>
  );
}
