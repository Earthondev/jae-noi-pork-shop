import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SeoPageNav } from "../../_components/shop/seo-page-nav";
import { SITE_URL, SHOP } from "../../../lib/seo";

const PAGE_URL = `${SITE_URL}/products/sai-krok-isan`;
const PRODUCT_NAME = "ไส้กรอกอีสาน";
const PRODUCT_IMAGE = "/images/products/jae-noi-holding-two-naem-pork-bags.jpg";
const PRODUCT_PRICE = 100;
const PAGE_TITLE = "ไส้กรอกอีสาน รสเปรี้ยวกำลังดี | เจ๊น้อย เขียงหมูตะคร้อ";
const PAGE_DESCRIPTION =
  "ไส้กรอกอีสานรสเปรี้ยวกำลังดีจากเจ๊น้อย เขียงหมูตะคร้อ อ.บัวใหญ่ จ.นครราชสีมา ทำสดใหม่ ราคาเริ่มต้น 100 บาท สั่งออนไลน์ ส่งไปรษณีย์ทั่วไทย";

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

const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": `${PAGE_URL}#product`,
      name: PRODUCT_NAME,
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
        { "@type": "ListItem", position: 3, name: PRODUCT_NAME, item: PAGE_URL },
      ],
    },
  ],
});

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
          <h1>ไส้กรอกอีสาน เจ๊น้อย เขียงหมูตะคร้อ</h1>
          <p>
            ไส้กรอกอีสานรสเปรี้ยวกำลังดี ย่างทานร้อน ๆ ได้รสชาติแบบอาหารอีสานที่คุ้นเคย จัดส่งทั่วไทยตามรอบพรีออเดอร์
            ราคาเริ่มต้น {PRODUCT_PRICE} บาทต่อแพ็ก
          </p>
          <div className="seo-page-actions">
            <Link className="seo-primary-action" href="/#products">สั่งไส้กรอกอีสานตอนนี้</Link>
            <Link className="seo-secondary-action" href="/products">ดูเมนูสินค้าทั้งหมด</Link>
          </div>
        </header>

        <section className="seo-product-grid" aria-labelledby="product-detail-title">
          <div className="section-heading">
            <span className="eyebrow">รายละเอียดสินค้า</span>
            <h2 id="product-detail-title">ไส้กรอกอีสานเจ๊น้อย ทำสดทุกวัน</h2>
          </div>
          <div className="seo-card-grid single-card">
            <article className="seo-card seo-card-detail">
              <Image src={PRODUCT_IMAGE} alt="ไส้กรอกอีสานจากร้านเจ๊น้อย เขียงหมูตะคร้อ" width={760} height={520} />
              <div>
                <h3>{PRODUCT_NAME}</h3>
                <p>ไส้กรอกอีสานรสเปรี้ยวกำลังดี ย่างทานร้อน ๆ ได้รสชาติแบบอาหารอีสานที่คุ้นเคย และจัดส่งทั่วไทยตามรอบพรีออเดอร์</p>
                <Link href="/#products">ดูสถานะสินค้าและรอบสั่งซื้อ <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          </div>
        </section>

        <section className="seo-info-panel" aria-labelledby="shop-info-title">
          <div>
            <p className="eyebrow">ทำไมต้องไส้กรอกอีสานเจ๊น้อย</p>
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
      <SeoPageNav activeTab="products" />
    </main>
  );
}
