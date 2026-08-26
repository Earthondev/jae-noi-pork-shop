import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SITE_URL, SHOP } from "../../lib/seo";

const PAGE_URL = `${SITE_URL}/products`;
const PAGE_TITLE = "แหนมหมู ไส้กรอกอีสาน แคปหมู | เจ๊น้อย เขียงหมูตะคร้อ";
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

const collectionJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${PAGE_URL}#collection`,
  name: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  url: PAGE_URL,
  isPartOf: { "@id": `${SITE_URL}/#store` },
  mainEntity: {
    "@type": "ItemList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "แหนมหมู" },
      { "@type": "ListItem", position: 2, name: "ไส้กรอกอีสาน" },
      { "@type": "ListItem", position: 3, name: "กากหมูโบราณ หรือ แคปหมูติดมัน" },
    ],
  },
});

const products = [
  {
    name: "แหนมหมู",
    slug: "naem-moo",
    image: "/images/products/jae-noi-holding-two-naem-pork-bags.jpg",
    alt: "แหนมหมูสูตรร้านเจ๊น้อย เขียงหมูตะคร้อ",
    text: "แหนมหมูสูตรดั้งเดิม ทำสดใหม่ แพ็กสูญญากาศ เหมาะสำหรับทานที่บ้านหรือสั่งเป็นของฝากจากบัวใหญ่",
  },
  {
    name: "ไส้กรอกอีสาน",
    slug: "sai-krok-isan",
    image: "/images/products/jae-noi-holding-two-naem-pork-bags.jpg",
    alt: "ไส้กรอกอีสานจากร้านเจ๊น้อย",
    text: "ไส้กรอกอีสานรสเปรี้ยวกำลังดี ย่างทานร้อน ๆ ได้รสชาติแบบอาหารอีสานที่คุ้นเคย และจัดส่งทั่วไทยตามรอบพรีออเดอร์",
  },
  {
    name: "แคปหมูติดมัน",
    slug: "kaep-moo",
    image: "/images/products/jae-noi-presenting-pork-rinds-large-tubs.jpg",
    alt: "แคปหมูติดมัน หรือกากหมูโบราณ เจ๊น้อย",
    text: "กากหมูเจียวสูตรโบราณ หอมกรอบ โดยใช้ชื่อแคปหมูเป็นคำที่ลูกค้าค้นหาได้ง่ายในหน้าร้านและช่องทางออนไลน์",
  },
] as const;

export default function ProductsPage() {
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
          <h1>แหนมหมู ไส้กรอกอีสาน และแคปหมูจากเจ๊น้อย</h1>
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
            <h2 id="product-list-title">เมนูแหนมหมูและของฝากจากบัวใหญ่</h2>
            <p>ชื่อสินค้าและรายละเอียดด้านล่างใช้คำที่ตรงกับสินค้าของร้าน เพื่อให้เลือกเมนูได้ง่ายก่อนเปิดรอบพรีออเดอร์</p>
          </div>
          <div className="seo-card-grid">
            {products.map((product) => (
              <article className="seo-card" key={product.name}>
                <Image src={product.image} alt={product.alt} width={760} height={520} />
                <div>
                  <h3><Link href={`/products/${product.slug}`}>{product.name}</Link></h3>
                  <p>{product.text}</p>
                  <Link href="/#products">ดูสถานะสินค้าและรอบสั่งซื้อ <span aria-hidden="true">→</span></Link>
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
    </main>
  );
}
