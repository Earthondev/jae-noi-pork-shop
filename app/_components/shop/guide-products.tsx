import Image from "next/image";
import Link from "next/link";
import { getPublicStorefront } from "../../../db/public-storefront";
import { productsForGuide, type GuideSlug } from "../../../lib/guide-products";
import { displayProductName } from "../../../lib/product-catalog";
import { productPath, productOrderState } from "../../../lib/catalogue-seo";
import { CatalogueShipping } from "./catalogue-shipping";

const headings: Record<GuideSlug, string> = {
  "naem-moo": "แหนมหมูเจ๊น้อยราคาเท่าไร และหนึ่งแพ็คได้เท่าไร?",
  "sai-krok-isan": "ไส้กรอกอีสานขายแพ็คละเท่าไร?",
  "kaep-moo": "กากหมูและแคปหมูของร้านมีรายการไหนให้เลือกบ้าง?",
};

export async function GuideProducts({ slug }: { slug: GuideSlug }) {
  // Guides remain useful during a database outage, without retaining old prices.
  const storefront = await getPublicStorefront().catch(() => null);
  const products = productsForGuide(slug, storefront?.products ?? []);
  return <section className="seo-product-grid" aria-labelledby="guide-prices-title">
    <div className="section-heading">
      <h2 id="guide-prices-title">{headings[slug]}</h2>
      <p>ดูรูป ราคา และหน่วยขายของแต่ละรายการก่อนเลือกจำนวน</p>
    </div>
    {!storefront ? <p>ขณะนี้ยังโหลดราคาและขนาดสินค้าไม่ได้ กรุณา<Link href="/products">ตรวจสอบที่หน้าสินค้า</Link>อีกครั้ง</p>
      : products.length === 0 ? <p>ขณะนี้ไม่มีรายการที่แสดงในคู่มือนี้ ดูรายการอื่นได้ที่<Link href="/products">สินค้าทั้งหมด</Link></p>
      : <>
        <div className="seo-card-grid">
          {products.map((product) => <article className="seo-card" key={product.id}>
            <Image src={product.image} alt={displayProductName(product.name)} width={760} height={520} />
            <div>
              <h3><Link href={productPath(product.id)}>{displayProductName(product.name)}</Link></h3>
              <p>{product.price !== null && Number.isFinite(product.price) && product.price > 0 ? `${product.price} บาท` : "รอข้อมูลราคา"} · {product.unit}</p>
              <p>{product.detail}</p>
              <p>{productOrderState(product, storefront).label}</p>
              <Link href={productPath(product.id)}>ดูรูปและรายละเอียดรายการนี้ <span aria-hidden="true">→</span></Link>
            </div>
          </article>)}
        </div>
        <CatalogueShipping {...storefront} />
      </>}
  </section>;
}
