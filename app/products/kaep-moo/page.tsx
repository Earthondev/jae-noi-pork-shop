import type { Metadata } from "next";
import Link from "next/link";
import { GuideProducts } from "../../_components/shop/guide-products";
import { SeoPageNav } from "../../_components/shop/seo-page-nav";
import { SITE_URL, SHOP, productGuide, guideJsonLd } from "../../../lib/seo";

export const dynamic = "force-dynamic";

const PAGE_URL = `${SITE_URL}/products/kaep-moo`;
const PRODUCT = productGuide("kaep-moo");
const PRODUCT_IMAGE = PRODUCT.image;
const PAGE_TITLE = "เลือกกากหมูและแคปหมูเจ๊น้อย: ดูรูป ขนาดและราคา";
const PAGE_DESCRIPTION =
  "เปรียบเทียบรายการกากหมูและแคปหมูของร้านเจ๊น้อย บัวใหญ่ จากรูป ราคา และหน่วยขาย พร้อมวิธีเทียบขนาดบรรจุและลิงก์รายละเอียดสินค้า";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
    locale: "th_TH",
    images: [{ url: PRODUCT_IMAGE, width: 760, height: 520, alt: "กากหมูและแคปหมูร้านเจ๊น้อย เขียงหมูตะคร้อ" }],
  },
};

const jsonLd = guideJsonLd("kaep-moo", "กากหมูและแคปหมู");

export default function KaepMooPage() {
  return (
    <main className="seo-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="seo-page-shell">
        <nav className="seo-breadcrumbs" aria-label="เส้นทางหน้าเว็บ">
          <Link href="/">หน้าแรก</Link>
          <span aria-hidden="true">/</span>
          <Link href="/products">เมนูสินค้า</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">กากหมูและแคปหมู</span>
        </nav>

        <header className="seo-page-hero seo-page-hero-compact">
          <p className="eyebrow">ของดีจากเขียงหมูตะคร้อ</p>
          <h1>เลือกกากหมูและแคปหมูเจ๊น้อย: ดูรูป ขนาดและราคา</h1>
          <p>เปรียบเทียบรูปสินค้าและหน่วยขายของแต่ละรายการก่อนเลือก อย่าเทียบเฉพาะราคาต่อถุงหากขนาดบรรจุต่างกัน และตรวจรายละเอียดของรายการที่ต้องการทุกครั้ง</p>
          <div className="seo-page-actions">
            <Link className="seo-primary-action" href="#guide-prices-title">ดูราคาและขนาดสินค้า</Link>
            <Link className="seo-secondary-action" href="/products">ดูเมนูสินค้าทั้งหมด</Link>
          </div>
        </header>

        <GuideProducts slug="kaep-moo" />

        <section className="seo-info-panel" aria-labelledby="guide-size-title">
          <h2 id="guide-size-title">แบบถุงกับแบบกิโลกรัมเทียบราคาอย่างไร?</h2>
          <p>เทียบราคาต่อน้ำหนักได้เมื่อทั้งสองรายการระบุน้ำหนักชัดเจน หากรายการระบุเพียง “1 ถุง” ต้องตรวจน้ำหนักกับร้านก่อน จึงจะบอกได้ว่าแบบใดคุ้มกว่า ชื่อสินค้าคล้ายกันไม่ได้ยืนยันว่าสูตรหรือขนาดเหมือนกัน</p>
          <a href={`tel:${SHOP.phonePrimary.replace(/[^\d+]/g, "")}`}>สอบถามรายละเอียดกับร้าน</a>
        </section>

        <section className="seo-info-panel" aria-labelledby="guide-order-title">
          <h2 id="guide-order-title">ดูรายละเอียดและวิธีสั่งกากหมูหรือแคปหมูได้ที่ไหน?</h2>
          <p>เลือกรายการจากหน้าสินค้า แล้วตรวจรอบขายและตัวเลือกการรับสินค้าที่หน้าเว็บแสดง ดูขั้นตอนกรอกข้อมูลและชำระเงินได้ที่หน้าวิธีสั่งซื้อ</p>
          <Link href="/how-to-order">วิธีสั่งซื้อและการจัดส่ง</Link>
          <Link href="/products/naem-moo">ดูคู่มือแหนมหมู</Link>
        </section>

        <footer className="seo-page-footer">
          <strong>{SHOP.legalName}</strong>
          <span>{SHOP.street} {SHOP.subdistrict} {SHOP.district} {SHOP.province} {SHOP.postalCode}</span>
          <span>โทร {SHOP.phonePrimary} หรือ {SHOP.phoneSecondary}</span>
          <div>
            <Link href="/">กลับหน้าแรก</Link>
            <Link href="/products">เมนูสินค้า</Link>
            <Link href="/how-to-order">วิธีสั่งซื้อ</Link>
          </div>
        </footer>
      </div>
      <SeoPageNav activeTab="products" />
    </main>
  );
}
