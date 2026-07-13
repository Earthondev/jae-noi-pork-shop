"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Product = {
  id: string;
  name: string;
  detail: string;
  price: number | null;
  image: string;
  badge: string;
};

const products: Product[] = [
  {
    id: "naem-pork",
    name: "แหนมหมู",
    detail: "250 กรัม · รสจัดจ้านแบบตะคร้อ",
    price: 50,
    image: "/images/products/spicy-naem-pork-bags-closeup.jpg",
    badge: "ขายดี",
  },
  {
    id: "isan-sausage",
    name: "ไส้กรอกอีสาน",
    detail: "แพ็กละ 10 ชิ้น · ราคาอยู่ระหว่างยืนยัน",
    price: null,
    image: "/images/products/jae-noi-presenting-vacuum-packed-pork-sausages.jpg",
    badge: "แพ็ก 10 ชิ้น",
  },
  {
    id: "pork-rinds",
    name: "แคปหมู",
    detail: "1 กล่อง · กรอบ หอม ทำสด",
    price: 150,
    image: "/images/products/jae-noi-pork-rinds-product-display.jpg",
    badge: "กล่องใหญ่",
  },
];

type Quantities = Record<string, number>;

export function Shop() {
  const [quantities, setQuantities] = useState<Quantities>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement>(null);

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

  const cartItems = products.filter((product) => (quantities[product.id] ?? 0) > 0);
  const cartCount = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const subtotal = useMemo(
    () =>
      products.reduce(
        (sum, product) => sum + (product.price ?? 0) * (quantities[product.id] ?? 0),
        0,
      ),
    [quantities],
  );
  const hasPendingPrice = cartItems.some((product) => product.price === null);

  function updateQuantity(productId: string, delta: number) {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, (current[productId] ?? 0) + delta),
    }));
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cartItems.length === 0) {
      setNotice("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    if (hasPendingPrice) {
      setNotice("ไส้กรอกอีสานยังรอข้อมูลราคา จึงยังยืนยันออเดอร์รายการนี้ไม่ได้");
      return;
    }

    setSubmitting(true);
    setNotice(null);
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

    try {
      const response = await fetch("/api/orders", { method: "POST", body: form });
      const result = (await response.json()) as { orderId?: string; error?: string };
      if (!response.ok || !result.orderId) throw new Error(result.error ?? "บันทึกออเดอร์ไม่สำเร็จ");
      setOrderId(result.orderId);
      setQuantities({});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="กลับไปด้านบน">
          <Image src="/images/products/jae-noi-shop-logo.jpg" alt="โลโก้ร้านเจ้น้อย เขียงหมูตะคร้อ" width={168} height={100} priority />
        </a>
        <nav aria-label="เมนูหลัก">
          <a href="#products">สินค้า</a>
          <a href="#how-to-order">วิธีสั่ง</a>
          <a href="#story">เรื่องของร้าน</a>
        </nav>
        <button className="cart-button" type="button" onClick={() => setCartOpen(true)} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น`}>
          <span aria-hidden="true">ตะกร้า</span>
          <strong>{cartCount}</strong>
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">ของอร่อยจากตะคร้อ · ทำสดทุกวัน</p>
          <h1>อร่อยถึงเครื่อง<br /><span>สั่งง่ายถึงบ้าน</span></h1>
          <p className="hero-lead">แหนมหมู ไส้กรอกอีสาน และแคปหมูสูตรร้านเจ้น้อย เลือกของอร่อย ใส่ตะกร้า แล้วสั่งได้เลย</p>
          <div className="hero-actions">
            <a className="primary-action" href="#products">เลือกสินค้า</a>
            <span>☎ 087-2416773 · 087-8755479</span>
          </div>
        </div>
        <div className="hero-image-wrap">
          <span className="sunburst" aria-hidden="true" />
          <Image className="hero-image" src="/images/products/jae-noi-holding-two-naem-pork-bags.jpg" alt="เจ้น้อยถือแหนมหมูสองถุงที่หน้าร้าน" width={900} height={900} priority />
          <p className="hero-stamp">สดจริง<br /><strong>จากร้าน</strong></p>
        </div>
      </section>

      <section className="marquee" aria-label="จุดเด่นสินค้า">
        <div>ทำสดทุกวัน <span>◆</span> สูตรดั้งเดิมตะคร้อ <span>◆</span> แพ็กพร้อมส่ง <span>◆</span> อร่อยถึงเครื่อง</div>
      </section>

      <section className="products-section" id="products">
        <div className="section-heading">
          <div><p className="eyebrow">เลือกของอร่อย</p><h2>สินค้าของเจ้น้อย</h2></div>
          <p>กดเพิ่มลงตะกร้าได้ทันที รายการที่ข้อมูลยังไม่ครบจะแสดง “รอข้อมูล” อย่างชัดเจน</p>
        </div>
        <div className="product-grid">
          {products.map((product, index) => {
            const quantity = quantities[product.id] ?? 0;
            return (
              <article className="product-card" key={product.id} style={{ "--delay": `${index * 90}ms` } as React.CSSProperties}>
                <div className="product-image-wrap">
                  <Image src={product.image} alt={product.name} width={760} height={680} />
                  <span className="product-badge">{product.badge}</span>
                </div>
                <div className="product-info">
                  <div><h3>{product.name}</h3><p>{product.detail}</p></div>
                  <p className={product.price === null ? "price pending" : "price"}>{product.price === null ? "รอข้อมูลราคา" : `${product.price} บาท`}</p>
                  {product.price === null && quantity === 0 ? (
                    <button className="waiting-button" type="button" disabled>รอข้อมูล</button>
                  ) : quantity === 0 ? (
                    <button className="add-button" type="button" onClick={() => updateQuantity(product.id, 1)}>+ เพิ่มลงตะกร้า</button>
                  ) : (
                    <div className="stepper" aria-label={`จำนวน ${product.name}`}>
                      <button type="button" onClick={() => updateQuantity(product.id, -1)} aria-label={`ลดจำนวน ${product.name}`}>−</button>
                      <output aria-live="polite">{quantity}</output>
                      <button type="button" onClick={() => updateQuantity(product.id, 1)} aria-label={`เพิ่มจำนวน ${product.name}`}>+</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="order-flow" id="how-to-order">
        <div><span>1</span><h3>เลือกสินค้า</h3><p>เพิ่มจำนวนที่ต้องการลงตะกร้า</p></div>
        <div><span>2</span><h3>กรอกที่อยู่</h3><p>แจ้งชื่อ เบอร์โทร และที่จัดส่ง</p></div>
        <div><span>3</span><h3>ชำระเงิน</h3><p>QR พร้อมเพย์กำลังรอข้อมูล</p></div>
      </section>

      <section className="story" id="story">
        <Image src="/images/products/jae-noi-presenting-pork-rinds-large-tubs.jpg" alt="เจ้น้อยนำเสนอแคปหมูบรรจุกล่อง" width={760} height={960} />
        <div><p className="eyebrow">ทำเอง ขายเอง ใส่ใจทุกกล่อง</p><h2>ของดีจากเขียงหมูตะคร้อ</h2><p>รสชาติคุ้นเคยจากร้านท้องถิ่น ส่งต่อด้วยวัตถุดิบที่คัดแล้วและความตั้งใจในทุกแพ็ก จากมือเจ้น้อยถึงมือลูกค้า</p><blockquote>“ให้ลูกค้าได้ของอร่อย เหมือนมาซื้อถึงหน้าร้าน”</blockquote></div>
      </section>

      <footer><Image src="/images/products/jae-noi-shop-logo.jpg" alt="เจ้น้อย เขียงหมูตะคร้อ" width={150} height={90} /><p>โทร 087-2416773, 087-8755479</p><Link href="/admin">หลังบ้านร้านค้า</Link></footer>

      {cartOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCartOpen(false)}>
          <aside ref={drawerRef} className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="drawer-heading"><div><p className="eyebrow">รายการของคุณ</p><h2 id="cart-title">ตะกร้าสินค้า</h2></div><button type="button" onClick={() => setCartOpen(false)} aria-label="ปิดตะกร้า">×</button></div>
            {orderId ? (
              <div className="success-card" role="status"><span>✓</span><h3>รับคำสั่งซื้อแล้ว</h3><p>เลขที่ออเดอร์</p><strong>{orderId}</strong><p>ร้านจะตรวจสอบข้อมูลและติดต่อกลับเมื่อข้อมูลการชำระเงินพร้อม</p><button type="button" onClick={() => { setOrderId(null); setCartOpen(false); }}>กลับหน้าร้าน</button></div>
            ) : (
              <form onSubmit={submitOrder}>
                <div className="cart-list">
                  {cartItems.length === 0 ? <p className="empty-cart">ยังไม่มีสินค้าในตะกร้า</p> : cartItems.map((product) => (
                    <div className="cart-line" key={product.id}><div><strong>{product.name}</strong><small>{product.price === null ? "รอข้อมูลราคา" : `${product.price} บาท/รายการ`}</small></div><div className="stepper compact"><button type="button" onClick={() => updateQuantity(product.id, -1)} aria-label={`ลด ${product.name}`}>−</button><output>{quantities[product.id]}</output><button type="button" onClick={() => updateQuantity(product.id, 1)} aria-label={`เพิ่ม ${product.name}`}>+</button></div></div>
                  ))}
                </div>
                <div className="summary-row"><span>รวมค่าสินค้า</span><strong>{subtotal} บาท</strong></div>
                <div className="summary-row pending-row"><span>ค่าจัดส่ง</span><strong>รอข้อมูล</strong></div>
                <div className="form-grid">
                  <label>ชื่อผู้รับ<input name="customerName" required autoComplete="name" placeholder="ชื่อ–นามสกุล" /></label>
                  <label>เบอร์โทร<input name="phone" required inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx" /></label>
                  <label className="full">ที่อยู่จัดส่ง<textarea name="address" required autoComplete="street-address" rows={3} placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" /></label>
                  <label className="full">หมายเหตุ<textarea name="note" rows={2} placeholder="เช่น เวลาที่สะดวกรับสินค้า (ถ้ามี)" /></label>
                  <div className="payment-waiting full"><strong>QR พร้อมเพย์</strong><span>รอข้อมูลพร้อมเพย์จากร้าน</span></div>
                  <label className="full file-label">แนบสลิป (ส่งภายหลังได้)<input name="slip" type="file" accept="image/jpeg,image/png,image/webp" /></label>
                </div>
                {notice && <p className="form-notice" role="alert">{notice}</p>}
                <button className="submit-order" type="submit" disabled={submitting || cartItems.length === 0}>{submitting ? "กำลังบันทึก..." : "ยืนยันคำสั่งซื้อ"}</button>
              </form>
            )}
          </aside>
        </div>
      )}
      <button className="floating-cart" type="button" onClick={() => setCartOpen(true)} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น`}><span>ดูตะกร้า</span><strong>{cartCount}</strong></button>
    </main>
  );
}
