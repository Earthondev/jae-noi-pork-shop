import Link from "next/link";

export type BottomNavProps = Readonly<{
  cartCount: number;
  onOpenCart: () => void;
}>;

export function BottomNav({ cartCount, onOpenCart }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="เมนูด่วน">
      <a className="bottom-nav-item active" href="#top" aria-current="page">
        <span className="bottom-nav-icon" aria-hidden="true">🏠</span>
        <span>หน้าหลัก</span>
      </a>
      <a className="bottom-nav-item" href="#products">
        <span className="bottom-nav-icon" aria-hidden="true">📋</span>
        <span>สินค้า</span>
      </a>
      <Link className="bottom-nav-item" href="/track">
        <span className="bottom-nav-icon" aria-hidden="true">📦</span>
        <span>ติดตาม</span>
      </Link>
      <button type="button" className="bottom-nav-item" onClick={onOpenCart} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น`}>
        <span className="bottom-nav-icon" aria-hidden="true">🛒</span>
        <span aria-hidden="true">ตะกร้า</span>
        {cartCount > 0 && <strong className="bottom-nav-badge">{cartCount}</strong>}
      </button>
    </nav>
  );
}
