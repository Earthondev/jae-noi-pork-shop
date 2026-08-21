import Image from "next/image";
import { useState } from "react";
import { displayProductName, PRODUCT_IMAGE_PLACEHOLDER } from "../../../lib/product-catalog";
import type { Product } from "../../_hooks/use-storefront";

export type ProductCardProps = Readonly<{
  product: Product;
  quantity: number;
  index: number;
  onUpdateQuantity: (productId: string, delta: number) => void;
  orderingOpen: boolean;
  /** False when the round on offer does not carry this product. */
  inRound?: boolean;
}>;

export function ProductCard({ product, quantity, index, onUpdateQuantity, orderingOpen, inRound = true }: ProductCardProps) {
  const productReady = product.status === "เปิดขาย" && product.price !== null;
  const isPurchasable = orderingOpen && productReady && inRound;
  // A product left out of the round is still on sale in general, so it keeps
  // its normal look and only loses the add button — unlike "ปิดชั่วคราว",
  // which is the shop pausing the product itself.
  const outOfRound = orderingOpen && productReady && !inRound;
  // The image ribbon carries a functional status first (paused / missing data
  // / not in this round) since that outranks any marketing badge the admin
  // set — a shopper needs to know a product can't be bought before "popular".
  const functionalBadge = outOfRound
    ? "ไม่มีในรอบนี้"
    : product.status === "ปิดชั่วคราว"
      ? "ปิดรับชั่วคราว"
      : product.status === "รอข้อมูล"
        ? "รอข้อมูล"
        : null;
  const statusClass = outOfRound ? "out-of-round" : product.status === "เปิดขาย" ? "open" : product.status === "ปิดชั่วคราว" ? "closed" : "waiting";
  const customerProductName = displayProductName(product.name);
  const [imageSrc, setImageSrc] = useState(product.image);
  const [trackedImage, setTrackedImage] = useState(product.image);
  if (product.image !== trackedImage) {
    setTrackedImage(product.image);
    setImageSrc(product.image);
  }

  return (
    <article className={`product-card status-${statusClass}`} style={{ "--delay": `${index * 90}ms` } as React.CSSProperties}>
      <div className="product-image-wrap">
        <Image
          src={imageSrc}
          alt={customerProductName}
          width={760}
          height={680}
          sizes="(max-width: 600px) 42vw, 380px"
          priority={index === 0}
          onError={() => setImageSrc(PRODUCT_IMAGE_PLACEHOLDER)}
        />
        {functionalBadge ? (
          <span className={`product-badge${product.status === "ปิดชั่วคราว" ? " closed" : outOfRound ? " out-of-round" : ""}`}>{functionalBadge}</span>
        ) : product.badge ? (
          <span className="product-badge product-badge-custom">{product.badge}</span>
        ) : null}
        {product.status === "ปิดชั่วคราว" && <span className="product-closed-overlay" aria-hidden="true">พักขาย</span>}
      </div>
      <div className="product-info">
        <div>
          <h3>{customerProductName}</h3>
          <p>{product.detail}</p>
        </div>
        {quantity === 0 ? (
          <div className="product-purchase-row">
            <div className="product-price-stack">
              <p className={product.price === null ? "price pending" : "price"}>{product.price === null ? "รอข้อมูลราคา" : product.price}</p>
              {product.unit && (
                <span className="product-unit-pill">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8 12 3 3 8l9 5 9-5Z" />
                    <path d="M3 8v8l9 5 9-5V8" />
                    <path d="M12 13v8" />
                  </svg>
                  {product.unit}
                </span>
              )}
            </div>
            {isPurchasable ? (
              <button className="product-add-button" type="button" onClick={() => onUpdateQuantity(product.id, 1)} aria-label={`เพิ่ม ${customerProductName} ลงตะกร้า`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                เพิ่มลงตะกร้า
              </button>
            ) : (
              <span className={`product-unavailable${outOfRound ? " out-of-round" : !orderingOpen && productReady ? " round-closed" : product.status === "ปิดชั่วคราว" ? " closed" : ""}`}>
                {outOfRound ? "ไม่มีในรอบนี้" : !orderingOpen && productReady ? "รอเปิดรอบ" : product.status === "ปิดชั่วคราว" ? "ปิดรับ" : "รอข้อมูล"}
              </span>
            )}
          </div>
        ) : (
          <div className="product-purchase-row">
            <p className="price">{product.price}</p>
            <div className="stepper" aria-label={`จำนวน ${customerProductName}`}>
              <button className="decrease-button" type="button" onClick={() => onUpdateQuantity(product.id, -1)} aria-label={`ลดจำนวน ${customerProductName}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <output key={quantity} aria-live="polite">{quantity}</output>
              <button
                className="increase-button"
                type="button"
                onClick={() => onUpdateQuantity(product.id, 1)}
                aria-label={outOfRound ? `${customerProductName} ไม่ได้เปิดขายในรอบนี้` : orderingOpen ? `เพิ่มจำนวน ${customerProductName}` : `ยังเพิ่ม ${customerProductName} ไม่ได้จนกว่าจะเปิดรอบ`}
                disabled={!orderingOpen || outOfRound}
              >
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
