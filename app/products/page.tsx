import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SeoPageNav } from "../_components/shop/seo-page-nav";
import { SITE_URL, SHOP } from "../../lib/seo";
import { getPublicStorefront } from "../../db/public-storefront";
import { catalogueJsonLd, productPath, productOrderState } from "../../lib/catalogue-seo";
import { displayProductName } from "../../lib/product-catalog";
import { CatalogueShipping } from "../_components/shop/catalogue-shipping";

export const dynamic = "force-dynamic";

const PAGE_URL = `${SITE_URL}/products`;
const PAGE_TITLE = "สินค้าทั้งหมด | เจ๊น้อย เขียงหมูตะคร้อ";
const PAGE_DESCRIPTION =
  "รวมเมนูแหนมหมู ไส้กรอกอีสาน และแคปหมูติดมันจากเจ๊น้อย เขียงหมูตะคร้อ อ.บัวใหญ่ จ.นครราชสีมา ทำสด แพ็กสูญญากาศ พร้อมสั่งออนไลน์";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
    locale: "th_TH",
    images: [{ url: "/og.png", width: 1536, height: 909, alt: "เมนูแหนมหมู ไส้กรอกอีสาน และแคปหมู เจ๊น้อย เขียงหมูตะคร้อ" }],
  },
};

export default async function ProductsPage() {
  const storefront = await getPublicStorefront();
  const products = storefront.products;
  const collectionJsonLd = catalogueJsonLd(products, storefront);
  return (
    <main className="seo-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: collectionJsonLd }} />
      <div className="seo-page-shell">
        <nav className="seo-breadcrumbs" aria-label="เส้นทางหน้าเว็บ">
          <Link href="/">หน้าแรก</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">เมนูสินค้า</span>
        </nav>

        <header className="seo-page-hero">
          <p className="eyebrow">เมนูของอร่อยจากตะคร้อ</p>
          <h1>สินค้าทั้งหมดของ{storefront.content.storeName}</h1>
          <p>
            รวมสินค้าหลักของร้านเจ๊น้อย เขียงหมูตะคร้อ อำเภอบัวใหญ่ จังหวัดนครราชสีมา
            สำหรับลูกค้าที่กำลังหาแหนมหมู ไส้กรอกอีสาน หรือแคปหมูติดมันเพื่อทานเองและเป็นของฝาก
          </p>
          <div className="seo-page-actions">
            <Link className="seo-primary-action" href="/#products">ดูสินค้าพร้อมสั่ง</Link>
            <Link className="seo-secondary-action" href="/how-to-order">ดูวิธีสั่งซื้อ</Link>
          </div>
        </header>

        <section className="seo-product-grid" aria-labelledby="product-list-title">
          <div className="section-heading">
            <span className="eyebrow">เลือกตามเมนูที่ชอบ</span>
            <h2 id="product-list-title">เลือกสินค้าของเจ๊น้อย</h2>
            <p>ดูราคา หน่วยขาย และสถานะเปิดรับของแต่ละรายการก่อนสั่งซื้อ</p>
          </div>
          <CatalogueShipping {...storefront} />
          <div className="seo-card-grid">
            {products.map((product) => (
              <article className="seo-card" key={product.id}>
                <Image src={product.image} alt={displayProductName(product.name)} width={760} height={520} />
                <div>
                  <h3><Link href={productPath(product.id)}>{displayProductName(product.name)}</Link></h3>
                  <p>{product.detail}</p>
                  <p>{product.price === null ? "รอข้อมูลราคา" : `${product.price} บาท · ${product.unit}`}</p>
                  <p>{productOrderState(product, storefront).label}</p>
                  <Link href={productPath(product.id)}>ดูรายละเอียดสินค้า <span aria-hidden="true">→</span></Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="seo-info-panel" aria-labelledby="shop-info-title">
          <div>
            <p className="eyebrow">ร้านอยู่ที่ไหน</p>
            <h2 id="shop-info-title">เจ๊น้อย เขียงหมูตะคร้อ อ.บัวใหญ่ จ.นครราชสีมา</h2>
          </div>
          <p>
            ลูกค้าสามารถติดตามรอบพรีออเดอร์และสั่งออนไลน์ได้จากหน้าแรกของร้าน โดยมีบริการจัดส่งไปรษณีย์ทั่วไทย
            และตัวเลือกรับเองหน้าร้านเมื่อมีการเปิดรับในรอบนั้น
          </p>
        </section>

        <footer className="seo-page-footer">
          <strong>{SHOP.legalName}</strong>
          <span>{SHOP.street} {SHOP.subdistrict} {SHOP.district} {SHOP.province} {SHOP.postalCode}</span>
          <span>โทร {SHOP.phonePrimary} หรือ {SHOP.phoneSecondary}</span>
          <div>
            <Link href="/">กลับหน้าแรก</Link>
            <Link href="/how-to-order">วิธีสั่งซื้อ</Link>
            <a href={`tel:${SHOP.phonePrimary.replace(/[^\d+]/g, "")}`}>โทรสั่งซื้อ</a>
          </div>
        </footer>
      </div>
      <SeoPageNav activeTab="products" />
    </main>
  );
}
