import type { Metadata } from "next";
import Link from "next/link";
import { GuideProducts } from "../../_components/shop/guide-products";
import { SeoPageNav } from "../../_components/shop/seo-page-nav";
import { SITE_URL, SHOP, productGuide, guideJsonLd } from "../../../lib/seo";

export const dynamic = "force-dynamic";

const PAGE_URL = `${SITE_URL}/products/naem-moo`;
const PRODUCT = productGuide("naem-moo");
const PRODUCT_NAME = PRODUCT.name;
const PRODUCT_IMAGE = PRODUCT.image;
const PAGE_TITLE = "แหนมหมูบัวใหญ่: ราคา ขนาด และการสั่งซื้อ | เจ๊น้อย";
const PAGE_DESCRIPTION =
  "แหนมหมูเจ๊น้อยจากบัวใหญ่ ดูราคา ขนาดและหน่วยขายปัจจุบัน รูปสินค้า ค่าจัดส่ง และวิธีสั่งซื้อ พร้อมข้อมูลสำหรับเลือกจำนวนแพ็ค";

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
    images: [{ url: PRODUCT_IMAGE, width: 760, height: 520, alt: "แหนมหมูสูตรร้านเจ๊น้อย เขียงหมูตะคร้อ" }],
  },
};

const jsonLd = guideJsonLd("naem-moo");

export default function NaemMooPage() {
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
          <h1>แหนมหมูบัวใหญ่: ราคา ขนาด และการสั่งซื้อ</h1>
          <p>เลือกแหนมหมูโดยดูทั้งราคาและปริมาณที่ได้รับในแต่ละแพ็ค พร้อมตรวจรายละเอียดรายการและวิธีสั่งซื้อจากร้านเจ๊น้อย เขียงหมูตะคร้อ</p>
          <div className="seo-page-actions">
            <Link className="seo-primary-action" href="#guide-prices-title">ดูราคาและขนาดสินค้า</Link>
            <Link className="seo-secondary-action" href="/products">ดูเมนูสินค้าทั้งหมด</Link>
          </div>
        </header>

        <GuideProducts slug="naem-moo" />

        <section className="seo-info-panel" aria-labelledby="guide-size-title">
          <h2 id="guide-size-title">เลือกจำนวนแพ็คแหนมหมูอย่างไร?</h2>
          <p>ก่อนเลือกจำนวนแพ็ค ให้ดูน้ำหนักต่อชิ้นและจำนวนชิ้นต่อแพ็คในรายละเอียดสินค้า เพราะจำนวนแพ็คอย่างเดียวอาจบอกปริมาณที่ได้รับไม่ครบ หากรายการยังไม่ระบุน้ำหนักหรือจำนวนชิ้น ให้สอบถามร้านก่อนสั่ง</p>
          <a href={`tel:${SHOP.phonePrimary.replace(/[^\d+]/g, "")}`}>สอบถามรายละเอียดกับร้าน</a>
        </section>

        <section className="seo-info-panel" aria-labelledby="guide-order-title">
          <h2 id="guide-order-title">สั่งแหนมหมูจากบัวใหญ่ได้ทางไหน?</h2>
          <p>เลือกรายการจากหน้าสินค้า แล้วตรวจรอบขายและตัวเลือกการรับสินค้าที่หน้าเว็บแสดง ดูขั้นตอนกรอกข้อมูลและชำระเงินได้ที่หน้าวิธีสั่งซื้อ</p>
          <Link href="/how-to-order">วิธีสั่งซื้อและการจัดส่ง</Link>
          <Link href="/products/sai-krok-isan">ดูคู่มือไส้กรอกอีสาน</Link>
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
