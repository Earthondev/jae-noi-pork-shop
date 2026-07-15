"use client";

import Image from "next/image";
import Link from "next/link";

export type SiteHeaderProps = Readonly<{
  cartCount: number;
  onOpenCart: () => void;
  storeName: string;
  storeLogoUrl: string;
}>; 

export function SiteHeader({ cartCount, onOpenCart, storeName, storeLogoUrl }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="กลับไปด้านบน">
        <span className="brand-mark">
          <Image src={storeLogoUrl} alt="" width={80} height={80} priority unoptimized={storeLogoUrl.startsWith("/media/")} />
        </span>
        <span className="brand-name">{storeName}</span>
      </a>
      <nav aria-label="เมนูหลัก">
        <a href="#products">สินค้า</a>
        <Link href="/track">ติดตามออเดอร์</Link>
      </nav>
      <button className="cart-button" type="button" onClick={onOpenCart} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
        <strong>{cartCount}</strong>
      </button>
    </header>
  );
}
