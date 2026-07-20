"use client";

import Image from "next/image";
import Link from "next/link";
import generatePromptPayPayload from "promptpay-qr";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "./_components/shop/bottom-nav";
import { CartDrawer, type OrderRecap } from "./_components/shop/cart-drawer";
import { Hero } from "./_components/shop/hero";
import { PhoneStrip } from "./_components/shop/phone-strip";
import { ProductGrid } from "./_components/shop/product-grid";
import { SiteHeader } from "./_components/shop/site-header";
import { useCheckoutDraft } from "./_hooks/use-checkout-draft";
import { useStorefront } from "./_hooks/use-storefront";
import {
  CustomerFacingError,
  PUBLIC_ERROR_MESSAGES,
  safeClientApiMessage,
} from "../lib/public-errors";
import {
  browserCustomerStorage,
  forgetRememberedCustomer,
  normalizeCustomerPhone,
  readRememberedCustomer,
  saveRememberedCustomer,
} from "../lib/remembered-customer";
import { formatThaiAddress } from "../lib/thai-address";

type ClientPaymentStatus = "waiting" | "verified" | "review" | "invalid";

const StarIcon = () => (
  <svg viewBox="0 0 24 24" fill="var(--gold-500)" style={{ width: 17, height: 17, display: "inline-block" }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export function Shop() {
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<ClientPaymentStatus>("waiting");
  const [orderRecap, setOrderRecap] = useState<OrderRecap | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("ทั้งหมด");
  const [activeTab, setActiveTab] = useState<"home" | "products">("home");
  const [rememberDetails, setRememberDetails] = useState(true);
  const [rememberedForCurrentPhone, setRememberedForCurrentPhone] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const appliedRememberedPhoneRef = useRef<string | null>(null);
  const [nearProducts, setNearProducts] = useState(true);

  const checkout = useCheckoutDraft();
  const {
    draft: checkoutDraft,
    restored: checkoutRestored,
    hasContent: checkoutHasContent,
    setField: setCheckoutField,
    updateQuantity: updateCheckoutQuantity,
    pruneUnavailable,
    clearDraft,
  } = checkout;
  const quantities = checkoutDraft.quantities;
  const setSelectedRound = useCallback((round: string) => setCheckoutField("selectedRound", round), [setCheckoutField]);
  const setFulfilment = useCallback((fulfilment: "pickup" | "postal") => setCheckoutField("fulfilment", fulfilment), [setCheckoutField]);
  const storefront = useStorefront({
    cartOpen,
    pruneUnavailable,
    selectedRound: checkoutDraft.selectedRound,
    setSelectedRound,
    fulfilment: checkoutDraft.fulfilment,
    setFulfilment,
  });
  const {
    storeLoading,
    notice: storefrontNotice,
    setNotice: setStorefrontNotice,
    refreshStorefront,
  } = storefront;
  const restoredNoticeShownRef = useRef(false);

  const updateQuantity = useCallback(
    (productId: string, delta: number) => updateCheckoutQuantity(storefront.products, productId, delta),
    [updateCheckoutQuantity, storefront.products],
  );

  const changeCheckoutField = useCallback((field: "customerName" | "phone" | "address" | "note" | "addressLine" | "subdistrict" | "district" | "province" | "postalCode", value: string) => {
    setCheckoutField(field, value);
    if (field !== "phone") return;

    const normalizedPhone = normalizeCustomerPhone(value);
    setRememberedForCurrentPhone(false);
    if (!rememberDetails) {
      appliedRememberedPhoneRef.current = null;
      return;
    }
    if (!/^0\d{8,9}$/.test(normalizedPhone)) {
      appliedRememberedPhoneRef.current = null;
      return;
    }
    if (appliedRememberedPhoneRef.current === normalizedPhone) return;

    const remembered = readRememberedCustomer(browserCustomerStorage(), normalizedPhone);
    if (!remembered) {
      appliedRememberedPhoneRef.current = null;
      return;
    }
    appliedRememberedPhoneRef.current = normalizedPhone;
    setCheckoutField("customerName", remembered.customerName);
    setCheckoutField("address", remembered.address);
    setCheckoutField("addressLine", remembered.addressLine);
    setCheckoutField("subdistrict", remembered.subdistrict);
    setCheckoutField("district", remembered.district);
    setCheckoutField("province", remembered.province);
    setCheckoutField("postalCode", remembered.postalCode);
    setRememberedForCurrentPhone(true);
  }, [rememberDetails, setCheckoutField]);

  const forgetCurrentCustomer = useCallback(() => {
    forgetRememberedCustomer(browserCustomerStorage(), checkoutDraft.phone);
    appliedRememberedPhoneRef.current = null;
    setRememberedForCurrentPhone(false);
  }, [checkoutDraft.phone]);

  useEffect(() => {
    if (checkoutRestored) void refreshStorefront();
  }, [checkoutRestored, refreshStorefront]);

  useEffect(() => {
    if (!checkoutRestored || storeLoading || restoredNoticeShownRef.current) return;
    restoredNoticeShownRef.current = true;
    if (!storefrontNotice) setStorefrontNotice("กู้คืนตะกร้าและข้อมูลที่กรอกไว้แล้ว พร้อมตรวจราคาและสถานะสินค้าล่าสุดให้แล้ว");
  }, [checkoutRestored, setStorefrontNotice, storefrontNotice, storeLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("cart") !== "open") return;

    const url = new URL(window.location.href);
    url.searchParams.delete("cart");
    window.history.replaceState({}, document.title, url.pathname + url.search);

    // Open after hydration so the server and first client render stay identical.
    const timer = window.setTimeout(() => setCartOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.id === "products") {
              setActiveTab("products");
            } else if (entry.target.id === "top") {
              setActiveTab("home");
            }
          }
          if (entry.target.id === "products") {
            // Once the product grid has scrolled above the viewport, the
            // floating cart pill would otherwise sit on top of unrelated
            // content (e.g. the order-steps section) with no clear space
            // reserved for it, so hide it once we're past the shopping area.
            setNearProducts(entry.isIntersecting || entry.boundingClientRect.top > 0);
          }
        });
      },
      { threshold: 0.15, rootMargin: "-80px 0px -40% 0px" }
    );

    const productsEl = document.getElementById("products");
    const topEl = document.getElementById("top");

    if (productsEl) observer.observe(productsEl);
    if (topEl) observer.observe(topEl);

    const handleHashChange = () => {
      if (window.location.hash === "#products") {
        setActiveTab("products");
      } else if (window.location.hash === "#top" || window.location.hash === "") {
        setActiveTab("home");
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

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

  const categories = useMemo(() => {
    const list = new Set<string>();
    list.add("ทั้งหมด");
    storefront.products.forEach((product) => list.add(product.category || "อื่น ๆ"));
    return Array.from(list);
  }, [storefront.products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === "ทั้งหมด") return storefront.products;
    return storefront.products.filter((product) => (product.category || "อื่น ๆ") === selectedCategory);
  }, [storefront.products, selectedCategory]);
  
  const cartItems = storefront.products.filter((product) => (quantities[product.id] ?? 0) > 0);
  const cartCount = cartItems.reduce((sum, product) => sum + (quantities[product.id] ?? 0), 0);
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
    if (storefront.fulfilment === "postal") {
      form.set("address", formatThaiAddress({
        addressLine: String(form.get("addressLine") ?? ""),
        subdistrict: String(form.get("subdistrict") ?? ""),
        district: String(form.get("district") ?? ""),
        province: String(form.get("province") ?? ""),
        postalCode: String(form.get("postalCode") ?? ""),
      }));
    }
    idempotencyKeyRef.current ??= crypto.randomUUID();
    form.set("idempotencyKey", idempotencyKeyRef.current);

    try {
      const response = await fetch("/api/orders", { method: "POST", body: form });
      const result = (await response.json().catch(() => null)) as { orderId?: string; paymentStatus?: ClientPaymentStatus; error?: string } | null;
      if (!response.ok || !result?.orderId) {
        throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ORDER_UNAVAILABLE"));
      }
      setOrderId(result.orderId);
      setOrderPaymentStatus(result.paymentStatus ?? "waiting");
      // Snapshot what was ordered before the cart is cleared, so the success
      // screen can show the customer a recap of their order.
      setOrderRecap({
        items: cartItems.map((product) => ({
          name: product.name,
          quantity: quantities[product.id] ?? 0,
          lineTotal: (product.price ?? 0) * (quantities[product.id] ?? 0),
        })),
        shippingCost: shippingCost ?? 0,
        total: orderTotal,
      });
      if (rememberDetails) {
        const remembered = saveRememberedCustomer(browserCustomerStorage(), {
          customerName: String(form.get("customerName") ?? ""),
          phone: String(form.get("phone") ?? ""),
          address: String(form.get("address") ?? checkoutDraft.address),
          addressLine: String(form.get("addressLine") ?? checkoutDraft.addressLine),
          subdistrict: String(form.get("subdistrict") ?? checkoutDraft.subdistrict),
          district: String(form.get("district") ?? checkoutDraft.district),
          province: String(form.get("province") ?? checkoutDraft.province),
          postalCode: String(form.get("postalCode") ?? checkoutDraft.postalCode),
        });
        setRememberedForCurrentPhone(remembered);
      }
      idempotencyKeyRef.current = null;
      clearDraft();
    } catch (error) {
      await storefront.refreshStorefront();
      storefront.setNotice(
        error instanceof CustomerFacingError
          ? error.message
          : PUBLIC_ERROR_MESSAGES.ORDER_UNAVAILABLE,
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetOrder() {
    setOrderId(null);
    setOrderPaymentStatus("waiting");
    setOrderRecap(null);
    setCartOpen(false);
  }

  return (
    <main id="top">
      <SiteHeader cartCount={cartCount} onOpenCart={() => setCartOpen(true)} storeName={storefront.content.storeName} storeLogoUrl={storefront.content.storeLogoUrl} />
      <Hero storeLoading={storefront.storeLoading} rounds={storefront.rounds} nextRound={storefront.nextRound} content={storefront.content} />

      <ProductGrid
        storeLoading={storefront.storeLoading}
        products={filteredProducts}
        quantities={quantities}
        onUpdateQuantity={updateQuantity}
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />
      <PhoneStrip phonePrimary={storefront.content.phonePrimary} phoneSecondary={storefront.content.phoneSecondary} />

      <section className="order-flow" id="how-to-order">
        <div><span>1</span><h3>เลือกสินค้า</h3><p>เพิ่มจำนวนที่ต้องการลงตะกร้า</p></div>
        <div><span>2</span><h3>กรอกที่อยู่</h3><p>แจ้งชื่อ เบอร์โทร และที่จัดส่ง</p></div>
        <div><span>3</span><h3>ชำระเงิน</h3><p>สแกน QR พร้อมยอดออเดอร์ แล้วแนบสลิป</p></div>
      </section>

      <section className="story" id="story">
        <Image src="/images/products/jae-noi-presenting-pork-rinds-large-tubs.jpg" alt="เจ๊น้อยนำเสนอแคปหมูบรรจุกล่อง" width={760} height={960} />
        <div><p className="eyebrow">ทำเอง ขายเอง ใส่ใจทุกกล่อง</p><h2>{storefront.content.storyTitle}</h2><p>{storefront.content.storyDescription}</p><blockquote>“ให้ลูกค้าได้ของอร่อย เหมือนมาซื้อถึงหน้าร้าน”</blockquote></div>
      </section>

      <section className="reviews-section" id="reviews">
        <div className="section-heading">
          <span className="eyebrow">เสียงตอบรับจากลูกค้า</span>
          <h2>การันตีความอร่อยจากลูกค้าจริง</h2>
          <p>ส่งจริง อร่อยจริง ทั่วประเทศไทย</p>
        </div>
        <div className="reviews-grid">
          <div className="review-card">
            <div className="review-stars" aria-label="คะแนน 5 ดาวเต็ม">
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
            </div>
            <p className="review-text">“แหนมหมูสามชั้นอร่อยมาก สั่งพรีออเดอร์มาทานกับที่บ้าน ทำสดสะอาด แพ็กสูญญากาศดีมากครับ”</p>
            <div className="review-author">
              <strong>คุณสมชาย</strong>
              <span>กรุงเทพฯ</span>
            </div>
          </div>
          <div className="review-card">
            <div className="review-stars" aria-label="คะแนน 5 ดาวเต็ม">
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
            </div>
            <p className="review-text">“ไส้กรอกอีสานเปรี้ยวกำลังดี ย่างทานร้อนๆ หอมมากค่ะ สั่งไปรษณีย์ส่งไวมาก แพ็กแน่นหนา”</p>
            <div className="review-author">
              <strong>คุณสุรีย์</strong>
              <span>นครราชสีมา</span>
            </div>
          </div>
          <div className="review-card">
            <div className="review-stars" aria-label="คะแนน 5 ดาวเต็ม">
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
            </div>
            <p className="review-text">“แคปหมูติดมันกรอบอร่อยมาก ไม่เหม็นหืน ซื้อเป็นของฝากญาติๆ ชอบกันทุกคนเลยครับ”</p>
            <div className="review-author">
              <strong>คุณปอนด์</strong>
              <span>ขอนแก่น</span>
            </div>
          </div>
        </div>
      </section>

      <footer><Image src={storefront.content.storeLogoUrl} alt={storefront.content.storeName} width={150} height={90} unoptimized={storefront.content.storeLogoUrl.startsWith("/media/")} /><p>โทรสั่งซื้อ / สอบถาม</p><div className="footer-phone-links" aria-label="เบอร์โทรร้านเจ๊น้อย"><a href={`tel:${storefront.content.phonePrimary.replace(/[^\d+]/g, "")}`}>{storefront.content.phonePrimary}</a><a href={`tel:${storefront.content.phoneSecondary.replace(/[^\d+]/g, "")}`}>{storefront.content.phoneSecondary}</a></div><Link href="/track">ติดตามออเดอร์</Link></footer>

      {cartOpen && (
        <CartDrawer
          drawerRef={drawerRef}
          onClose={() => setCartOpen(false)}
          cart={{ items: cartItems, quantities, subtotal, onUpdateQuantity: updateQuantity }}
          checkout={{
            customerName: checkoutDraft.customerName,
            phone: checkoutDraft.phone,
            address: checkoutDraft.address,
            addressLine: checkoutDraft.addressLine,
            subdistrict: checkoutDraft.subdistrict,
            district: checkoutDraft.district,
            province: checkoutDraft.province,
            postalCode: checkoutDraft.postalCode,
            note: checkoutDraft.note,
            hasContent: checkoutHasContent,
            rememberDetails,
            rememberedForCurrentPhone,
            onChange: changeCheckoutField,
            onToggleRemember: setRememberDetails,
            onForgetRemembered: forgetCurrentCustomer,
            onClear: clearDraft,
          }}
          storefront={{
            storeName: storefront.content.storeName,
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
            phonePrimary: storefront.content.phonePrimary,
            phoneSecondary: storefront.content.phoneSecondary,
          }}
          order={{
            id: orderId,
            paymentStatus: orderPaymentStatus,
            submitting,
            promptPayPayload,
            orderTotal,
            shippingCost,
            recap: orderRecap,
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
      {cartCount > 0 && !cartOpen && nearProducts && (
        <button className="floating-cart" type="button" onClick={() => setCartOpen(true)} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น รวมค่าสินค้า ${subtotal} บาท`}>
          <span className="floating-cart-copy">
            <strong key={cartCount}>ตะกร้า · {cartCount} ชิ้น</strong>
            <small key={subtotal}>รวมสินค้า {subtotal.toLocaleString("th-TH")} บาท</small>
          </span>
          <span className="floating-cart-arrow" aria-hidden="true">ดูตะกร้า →</span>
        </button>
      )}

      <BottomNav cartCount={cartCount} onOpenCart={() => setCartOpen(true)} activeTab={activeTab} />
    </main>
  );
}
