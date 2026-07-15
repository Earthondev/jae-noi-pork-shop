import { PRODUCT_IMAGE_PLACEHOLDER } from "../../../lib/product-catalog";
import type { Product } from "../../_hooks/use-storefront";

export type ProductCardProps = Readonly<{
  product: Product;
  quantity: number;
  index: number;
  onUpdateQuantity: (productId: string, delta: number) => void;
}>;

export function ProductCard({ product, quantity, index, onUpdateQuantity }: ProductCardProps) {
  const isPurchasable = product.status === "เปิดขาย" && product.price !== null;
  const badge = product.status === "ปิดชั่วคราว" ? "ปิดรับชั่วคราว" : product.status === "รอข้อมูล" ? "รอข้อมูล" : product.unit;
  const statusClass = product.status === "เปิดขาย" ? "open" : product.status === "ปิดชั่วคราว" ? "closed" : "waiting";

  return (
    <article className={`product-card status-${statusClass}`} style={{ "--delay": `${index * 90}ms` } as React.CSSProperties}>
      <div className="product-image-wrap">
        {/* Product URLs are server-validated against the dedicated public R2 media origin. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          width={760}
          height={680}
          loading={index === 0 ? "eager" : "lazy"}
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
          }}
        />
        <span className={`product-badge${product.status === "ปิดชั่วคราว" ? " closed" : ""}`}>{badge}</span>
        {product.status === "ปิดชั่วคราว" && <span className="product-closed-overlay" aria-hidden="true">พักขาย</span>}
      </div>
      <div className="product-info">
        <div>
          <h3>{product.name}</h3>
          <p>{product.detail}</p>
        </div>
        {quantity === 0 ? (
          <div className="product-purchase-row">
            <p className={product.price === null ? "price pending" : "price"}>{product.price === null ? "รอข้อมูลราคา" : product.price}</p>
            {isPurchasable ? (
              <button className="product-add-button" type="button" onClick={() => onUpdateQuantity(product.id, 1)} aria-label={`เพิ่ม ${product.name} ลงตะกร้า`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            ) : (
              <span className={`product-unavailable${product.status === "ปิดชั่วคราว" ? " closed" : ""}`}>
                {product.status === "ปิดชั่วคราว" ? "ปิดรับ" : "รอข้อมูล"}
              </span>
            )}
          </div>
        ) : (
          <div className="product-purchase-row">
            <p className="price">{product.price}</p>
            <div className="stepper" aria-label={`จำนวน ${product.name}`}>
              <button className="decrease-button" type="button" onClick={() => onUpdateQuantity(product.id, -1)} aria-label={`ลดจำนวน ${product.name}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <output key={quantity} aria-live="polite">{quantity}</output>
              <button className="increase-button" type="button" onClick={() => onUpdateQuantity(product.id, 1)} aria-label={`เพิ่มจำนวน ${product.name}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
