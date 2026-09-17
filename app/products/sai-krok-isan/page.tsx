import type { Metadata } from "next";
import Link from "next/link";
import { GuideProducts } from "../../_components/shop/guide-products";
import { SeoPageNav } from "../../_components/shop/seo-page-nav";
import { SITE_URL, SHOP, productGuide, guideJsonLd } from "../../../lib/seo";

export const dynamic = "force-dynamic";

const PAGE_URL = `${SITE_URL}/products/sai-krok-isan`;
const PRODUCT = productGuide("sai-krok-isan");
const PRODUCT_NAME = PRODUCT.name;
const PRODUCT_IMAGE = PRODUCT.image;
const PAGE_TITLE = "ไส้กรอกอีสานบัวใหญ่: ราคาและขนาดแพ็ค | เจ๊น้อย";
const PAGE_DESCRIPTION =
  "ดูราคาไส้กรอกอีสานเจ๊น้อย บัวใหญ่ ขนาดแพ็คและรายละเอียดที่ร้านระบุ พร้อมรูปสินค้า ค่าจัดส่ง และลิงก์วิธีสั่งซื้อ";

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
    images: [{ url: PRODUCT_IMAGE, width: 760, height: 520, alt: "ไส้กรอกอีสานจากร้านเจ๊น้อย เขียงหมูตะคร้อ" }],
  },
};

const jsonLd = guideJsonLd("sai-krok-isan");

export default function SaiKrokIsanPage() {
  return (
    <main className="seo-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="seo-page-shell">
        <nav className="seo-breadcrumbs" aria-label="เส้นทางหน้าเว็บ">
          <Link href="/">หน้าแรก</Link>
          <span aria-hidden="true">/</span>
          <Link href="/products">เมนูสินค้า</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{PRODUCT_NAME}</span>
        </nav>

        <header className="seo-page-hero seo-page-hero-compact">
          <p className="eyebrow">ของดีจากเขียงหมูตะคร้อ</p>
          <h1>ไส้กรอกอีสานบัวใหญ่: ราคาและขนาดแพ็ค</h1>
          <p>เลือกไส้กรอกอีสานจากราคา หน่วยขาย และรายละเอียดของแต่ละรายการ ตรวจข้อมูลแพ็คที่ร้านระบุด้านล่างก่อนเลือกจำนวน</p>
          <div className="seo-page-actions">
            <Link className="seo-primary-action" href="#guide-prices-title">ดูราคาและขนาดสินค้า</Link>
            <Link className="seo-secondary-action" href="/products">ดูเมนูสินค้าทั้งหมด</Link>
          </div>
        </header>

        <GuideProducts slug="sai-krok-isan" />

        <section className="seo-info-panel" aria-labelledby="guide-size-title">
          <h2 id="guide-size-title">ไส้กรอกอีสานหนึ่งแพ็คมีกี่ชิ้น?</h2>
          <p>ดูจำนวนชิ้นที่ร้านระบุในหน่วยขายหรือรายละเอียดรายการด้านบน หากระบุเพียง “1 แพ็ค” โดยไม่มีจำนวนชิ้น ต้องสอบถามร้านเพิ่มเติมก่อนสั่ง ไม่ควรใช้จำนวนชิ้นในภาพเป็นจำนวนที่จะได้รับ</p>
          <a href={`tel:${SHOP.phonePrimary.replace(/[^\d+]/g, "")}`}>สอบถามรายละเอียดกับร้าน</a>
        </section>

        <section className="seo-info-panel" aria-labelledby="guide-order-title">
          <h2 id="guide-order-title">สั่งไส้กรอกอีสานและดูการจัดส่งได้ที่ไหน?</h2>
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
