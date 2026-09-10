import type { Metadata } from "next";
import Image from "next/image";
import { ProductGallery } from "../../../_components/shop/product-gallery";
import { getProductContent, PRODUCT_CONTENT_FIELDS } from "../../../../lib/product-content";
import "./product-detail.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicStorefront } from "../../../../db/public-storefront";
import { displayProductName } from "../../../../lib/product-catalog";
import { productOrderState, productPageJsonLd, productPath } from "../../../../lib/catalogue-seo";
import { SITE_URL } from "../../../../lib/seo";
import { SeoPageNav } from "../../../_components/shop/seo-page-nav";
import { CatalogueShipping } from "../../../_components/shop/catalogue-shipping";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function loadProduct(params: Props["params"]) {
  const { id } = await params;
  const storefront = await getPublicStorefront();
  const product = storefront.products.find((entry) => entry.id === id);
  // D1 errors propagate rather than turning a temporary outage into a 404.
  if (!product) notFound();
  return { product, storefront };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { product, storefront } = await loadProduct(params);
  const name = displayProductName(product.name);
  const title = `${name} | ${storefront.content.storeName}`;
  const url = `${SITE_URL}${productPath(product.id)}`;
  return {
    title, description: product.detail,
    alternates: { canonical: url },
    openGraph: { title, description: product.detail, url, type: "website", images: [{ url: new URL(product.image, SITE_URL).href, alt: name }] },
  };
}

export default async function ProductDetail({ params }: Props) {
  const { product, storefront } = await loadProduct(params);
  const name = displayProductName(product.name);
  const state = productOrderState(product, storefront);
  const content = getProductContent(product.id);
  return (
    <main className="seo-page product-detail">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productPageJsonLd(product, storefront) }} />
      <div className="seo-page-shell">
        <nav className="seo-breadcrumbs" aria-label="เส้นทางหน้าเว็บ">
          <Link href="/">หน้าแรก</Link><span aria-hidden="true">/</span>
          <Link href="/products">เมนูสินค้า</Link><span aria-hidden="true">/</span>
          <span aria-current="page">{name}</span>
        </nav>
        <section className="pd-top" aria-label="รายละเอียดสินค้า">
          <ProductGallery key={product.id} images={product.images?.length ? product.images : [product.image]} name={name} />
          <div className="pd-buy">
            <p className="pd-store">{storefront.content.storeName}</p>
            <h1>{name}</h1>
            {product.detail.trim() !== `${name} ${product.unit}`.trim() && <p className="pd-description">{product.detail}</p>}
            <p className="pd-price">{product.price === null ? "รอข้อมูลราคา" : `${product.price.toLocaleString("th-TH")} บาท`} <span>{product.unit && `/ ${product.unit}`}</span></p>
            <p className="pd-state">{!storefront.rounds.length && !state.canOrder ? "ขณะนี้ยังไม่เปิดรับออเดอร์" : state.label}</p>
            <CatalogueShipping {...storefront} />
            <div className="pd-actions">
              <Link className="pd-cta" href={state.canOrder ? `/#product-${encodeURIComponent(product.id)}` : "/#top"}>{state.canOrder ? "เลือกสินค้านี้" : "ดูรอบขาย"}</Link>
              <Link href="/products">สินค้าทั้งหมด</Link>
            </div>
            {content.careNote && <p className="pd-care">{content.careNote}</p>}
          </div>
        </section>
        <div className="pd-information">
          {PRODUCT_CONTENT_FIELDS.filter(([key]) => key !== "careNote" && content[key]).map(([key, label]) => (
            <details className="pd-section" key={key}>
              <summary><h2>{key === "faq" ? "คำถามที่พบบ่อย" : `${label}${key === "storage" || key === "cooking" ? name : ""}`}</h2></summary>
              <p>{content[key]}</p>
            </details>
          ))}
        </div>
        {storefront.products.length > 1 && <section className="pd-related" aria-labelledby="related-title">
          <h2 id="related-title">สินค้าอื่นที่น่าสนใจ</h2>
          <div className="pd-related-grid">{storefront.products.filter((item) => item.id !== product.id).sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category)).slice(0, 4).map((item) => (
            <Link key={item.id} href={productPath(item.id)}>
              <Image src={item.image} alt={displayProductName(item.name)} width={256} height={256} sizes="(max-width: 720px) 45vw, 25vw" />
              <h3>{displayProductName(item.name)}</h3>
              <p>{item.price === null ? "รอข้อมูลราคา" : `${item.price.toLocaleString("th-TH")} บาท`} <span>/ {item.unit}</span></p>
            </Link>
          ))}</div>
        </section>}
      </div>
      <SeoPageNav activeTab="products" />
    </main>
  );
}
