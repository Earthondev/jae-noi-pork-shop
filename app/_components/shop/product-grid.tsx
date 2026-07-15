import type { Quantities } from "../../_hooks/use-checkout-draft";
import type { Product } from "../../_hooks/use-storefront";
import { ProductCard } from "./product-card";

export type ProductGridProps = Readonly<{
  storeLoading: boolean;
  products: readonly Product[];
  quantities: Quantities;
  onUpdateQuantity: (productId: string, delta: number) => void;
  categories: readonly string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}>;

export function ProductGrid({
  storeLoading,
  products,
  quantities,
  onUpdateQuantity,
  categories,
  selectedCategory,
  onSelectCategory,
}: ProductGridProps) {
  return (
    <section className="products-section" id="products">
      <div className="section-heading">
        <div>
          <p className="eyebrow">เลือกของอร่อย</p>
          <h2>สินค้าของเจ๊น้อย</h2>
        </div>
        <p>กดเพิ่มลงตะกร้าได้ทันที รายการที่ข้อมูลยังไม่ครบจะแสดง “รอข้อมูล” อย่างชัดเจน</p>
      </div>
      {categories.length > 1 && (
        <div className="categories-container" role="tablist" aria-label="หมวดหมู่สินค้า">
          {categories.map((category) => (
            <button
              key={category}
              className={`category-tab${selectedCategory === category ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={selectedCategory === category}
              onClick={() => onSelectCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      )}
      <div className="product-grid" aria-busy={storeLoading && products.length === 0}>
        {storeLoading && products.length === 0
          ? Array.from({ length: 3 }, (_, index) => (
              <article className="product-card product-card-skeleton" key={index} aria-hidden="true">
                <div className="product-image-skeleton" />
                <div className="product-info-skeleton"><span /><span /><span /><span /></div>
              </article>
            ))
          : products.length === 0 ? (
              <div className="empty-catalog" role="status">
                <strong>ยังไม่มีสินค้าแสดงหน้าร้าน</strong>
                <span>กรุณาติดตามรายการใหม่เร็ว ๆ นี้</span>
              </div>
            ) : (
              products.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={quantities[product.id] ?? 0}
                  index={index}
                  onUpdateQuantity={onUpdateQuantity}
                />
              ))
            )}
      </div>
    </section>
  );
}
