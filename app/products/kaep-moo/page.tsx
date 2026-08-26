import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SITE_URL, SHOP } from "../../../lib/seo";

const PAGE_URL = `${SITE_URL}/products/kaep-moo`;
// "กากหมูโบราณ" is the product's name in the admin catalogue and structured
// data; "แคปหมู" is the name customers actually search for. Same product, not
// two — see the matching comment in lib/seo.ts.
const PRODUCT_NAME = "กากหมูโบราณ";
const PRODUCT_ALT_NAME = "แคปหมู";
const PRODUCT_IMAGE = "/images/products/jae-noi-presenting-pork-rinds-large-tubs.jpg";
const PRODUCT_PRICE = 185;
const PAGE_TITLE = "แคปหมูติดมัน กากหมูโบราณ | เจ๊น้อย เขียงหมูตะคร้อ";
const PAGE_DESCRIPTION =
  "กากหมูโบราณ (แคปหมูติดมัน) จากเจ๊น้อย เขียงหมูตะคร้อ อ.บัวใหญ่ จ.นครราชสีมา เจียวสูตรโบราณ หอมกรอบ ราคาเริ่มต้น 185 บาท ส่งไปรษณีย์ทั่วไทย";

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
    images: [{ url: PRODUCT_IMAGE, width: 760, height: 520, alt: "แคปหมูติดมัน หรือกากหมูโบราณ เจ๊น้อย เขียงหมูตะคร้อ" }],
  },
};

const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": `${PAGE_URL}#product`,
      name: PRODUCT_NAME,
      alternateName: PRODUCT_ALT_NAME,
      description: PAGE_DESCRIPTION,
      image: `${SITE_URL}${PRODUCT_IMAGE}`,
      url: PAGE_URL,
      category: "อาหารแปรรูปจากหมู",
      brand: { "@type": "Brand", name: SHOP.name },
      offers: { "@type": "Offer", price: PRODUCT_PRICE, priceCurrency: "THB", availability: "https://schema.org/PreOrder", url: PAGE_URL },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "หน้าแรก", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "เมนูสินค้า", item: `${SITE_URL}/products` },
        { "@type": "ListItem", position: 3, name: "แคปหมูติดมัน", item: PAGE_URL },
      ],
    },
  ],
});

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
          <span aria-current="page">แคปหมูติดมัน</span>
        </nav>

        <header className="seo-page-hero seo-page-hero-compact">
          <p className="eyebrow">ของดีจากเขียงหมูตะคร้อ</p>
          <h1>แคปหมูติดมัน (กากหมูโบราณ) เจ๊น้อย</h1>
          <p>
            กากหมูเจียวสูตรโบราณ หอมกรอบ โดยใช้ชื่อแคปหมูเป็นคำที่ลูกค้าค้นหาได้ง่ายในหน้าร้านและช่องทางออนไลน์
            ราคาเริ่มต้น {PRODUCT_PRICE} บาทต่อแพ็ก
          </p>
          <div className="seo-page-actions">
            <Link className="seo-primary-action" href="/#products">สั่งแคปหมูตอนนี้</Link>
            <Link className="seo-secondary-action" href="/products">ดูเมนูสินค้าทั้งหมด</Link>
          </div>
        </header>

        <section className="seo-product-grid" aria-labelledby="product-detail-title">
          <div className="section-heading">
            <span className="eyebrow">รายละเอียดสินค้า</span>
            <h2 id="product-detail-title">แคปหมูติดมันเจ๊น้อย ทำสดทุกวัน</h2>
          </div>
          <div className="seo-card-grid">
            <article className="seo-card">
              <Image src={PRODUCT_IMAGE} alt="แคปหมูติดมัน หรือกากหมูโบราณ เจ๊น้อย เขียงหมูตะคร้อ" width={760} height={520} />
              <div>
                <h3>แคปหมูติดมัน</h3>
                <p>กากหมูเจียวสูตรโบราณ หอมกรอบ โดยใช้ชื่อแคปหมูเป็นคำที่ลูกค้าค้นหาได้ง่ายในหน้าร้านและช่องทางออนไลน์</p>
                <Link href="/#products">ดูสถานะสินค้าและรอบสั่งซื้อ <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          </div>
        </section>

        <section className="seo-info-panel" aria-labelledby="shop-info-title">
          <div>
            <p className="eyebrow">ทำไมต้องแคปหมูเจ๊น้อย</p>
            <h2 id="shop-info-title">เจ๊น้อย เขียงหมูตะคร้อ อ.บัวใหญ่ จ.นครราชสีมา</h2>
          </div>
          <p>
            ทำสดทุกวัน สั่งออนไลน์ได้ตามรอบพรีออเดอร์ พร้อมบริการจัดส่งไปรษณีย์ทั่วไทย
            และตัวเลือกรับเองหน้าร้านเมื่อมีการเปิดรับในรอบนั้น
          </p>
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
    </main>
  );
}
