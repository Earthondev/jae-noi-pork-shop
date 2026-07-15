import Link from "next/link";

export type BottomNavProps = Readonly<{
  cartCount: number;
  onOpenCart: () => void;
  activeTab?: "home" | "products" | "track" | "cart";
}>;

export function BottomNav({ cartCount, onOpenCart, activeTab = "home" }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="เมนูด่วน">
      <Link className={`bottom-nav-item${activeTab === "home" ? " active" : ""}`} href="/" aria-current={activeTab === "home" ? "page" : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
        <span>หน้าหลัก</span>
      </Link>
      <Link className={`bottom-nav-item${activeTab === "products" ? " active" : ""}`} href="/#products" aria-current={activeTab === "products" ? "page" : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
        </svg>
        <span>สินค้า</span>
      </Link>
      <Link className={`bottom-nav-item${activeTab === "track" ? " active" : ""}`} href="/track" aria-current={activeTab === "track" ? "page" : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 10H9v-2h6v2zm5-5H4V6h16v3z" />
        </svg>
        <span>ติดตาม</span>
      </Link>
      <button type="button" className={`bottom-nav-item${activeTab === "cart" ? " active" : ""}`} onClick={onOpenCart} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
        <span>ตะกร้า</span>
        {cartCount > 0 && <strong key={cartCount} className="bottom-nav-badge">{cartCount}</strong>}
      </button>
    </nav>
  );
}
