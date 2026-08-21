"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

export type SiteHeaderProps = Readonly<{
  cartCount: number;
  onOpenCart: () => void;
  storeName: string;
  storeLogoUrl: string;
  categories: readonly string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}>; 

export function SiteHeader({
  cartCount,
  onOpenCart,
  storeName,
  storeLogoUrl,
  categories,
  selectedCategory,
  onSelectCategory,
}: SiteHeaderProps) {
  const categoryMenuRef = useRef<HTMLDetailsElement>(null);
  const hasCategoryMenu = categories.length >= 3;

  function selectCategory(category: string) {
    onSelectCategory(category);
    categoryMenuRef.current?.removeAttribute("open");
    window.requestAnimationFrame(() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }));
  }

  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="กลับไปด้านบน">
        <span className="brand-mark">
          <Image src={storeLogoUrl} alt="" width={80} height={80} priority />
        </span>
        <span className="brand-name">{storeName}</span>
      </a>
      <nav className={hasCategoryMenu ? "has-category-menu" : undefined} aria-label="เมนูหลัก">
        <a className="products-nav-link" href="#products">สินค้า</a>
        {hasCategoryMenu && (
          <details className="category-menu" ref={categoryMenuRef}>
            <summary aria-label="เปิดเมนูหมวดสินค้า">
              สินค้า
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 7 5 5 5-5" />
              </svg>
            </summary>
            <div className="category-menu-popover" role="menu" aria-label="เลือกหมวดสินค้า">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selectedCategory === category}
                  onClick={() => selectCategory(category)}
                >
                  <span>{category}</span>
                  {selectedCategory === category && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </details>
        )}
        <Link href="/products">เมนูสินค้า</Link>
        <Link href="/how-to-order">วิธีสั่งซื้อ</Link>
        <Link href="/track">ติดตามออเดอร์</Link>
      </nav>
      <button className="cart-button" type="button" onClick={onOpenCart} aria-label={`เปิดตะกร้า มีสินค้า ${cartCount} ชิ้น`}>
        <span className="cart-button-label">ตะกร้า</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
        <strong>{cartCount}</strong>
      </button>
    </header>
  );
}
