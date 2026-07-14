"use client";

import Image from "next/image";
import Link from "next/link";

export type SiteHeaderProps = Readonly<{
  cartCount: number;
  onOpenCart: () => void;
  storeName: string;
}>;

export function SiteHeader({ cartCount, onOpenCart, storeName }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="กลับไปด้านบน">
        <span className="brand-mark">
          <Image src="/images/products/jae-noi-shop-logo.jpg" alt="" width={80} height={80} priority />
        </span>
        <span className="brand-name">{storeName}</span>
      </a>
      <nav aria-label="เมนูหลัก">
        <a href="#products">สินค้า</a>
        <Link href="/track">ติดตามออเดอร์</Link>
      </nav>
      <button className="cart-button" type="button" onClick={onOpenCart} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น`}>
        <span aria-hidden="true">🛒</span>
        <strong>{cartCount}</strong>
      </button>
    </header>
  );
}
