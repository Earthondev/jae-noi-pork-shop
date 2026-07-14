import Image from "next/image";
import type { PreorderRound, StorefrontContent } from "../../_hooks/use-storefront";

export type HeroProps = Readonly<{
  storeLoading: boolean;
  rounds: readonly PreorderRound[];
  nextRound: PreorderRound | null;
  content: StorefrontContent;
}>;

export function Hero({ storeLoading, rounds, nextRound, content }: HeroProps) {
  return (
    <>
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span aria-hidden="true" />ของอร่อยจากตะคร้อ · ทำสดทุกวัน</p>
          <h1>
            {content.heroTitle}<br />
            <span>{content.heroHighlight}</span>
          </h1>
          <p className="hero-lead">{content.heroDescription}</p>
          <div className="hero-actions">
            <a className="primary-action" href="#products">เลือกสินค้า</a>
          </div>
        </div>
        <div className="hero-image-wrap">
          <Image className="hero-image" src="/images/products/jae-noi-holding-two-naem-pork-bags.jpg" alt="เจ๊น้อยถือแหนมหมูสองถุงที่หน้าร้าน" width={900} height={900} priority />
          <p className="hero-stamp">สดจริง<br /><strong>จากร้าน</strong></p>
        </div>
      </section>
      <section className="preorder-status" aria-label="สถานะรอบพรีออเดอร์">
        <div className={`round-callout${storeLoading ? " is-loading" : ""}`} role="status" aria-live="polite" aria-busy={storeLoading}>
          <span className="round-status-icon" aria-hidden="true">{storeLoading ? "…" : rounds[0] ? "✓" : "×"}</span>
          {storeLoading ? (
            <>
              <span className="sr-only">กำลังโหลดข้อมูลรอบพรีออเดอร์</span>
              <span className="round-skeleton round-skeleton-title" aria-hidden="true" />
              <span className="round-skeleton round-skeleton-detail" aria-hidden="true" />
            </>
          ) : rounds[0] ? (
            <>
              <strong>{rounds[0].label}</strong>
              <span>ปิดตะกร้า {rounds[0].closesAt}</span>
            </>
          ) : (
            <>
              <strong>ยังไม่มีรอบที่เปิดรับ</strong>
              <span>{nextRound ? `รอบถัดไปเปิดวันที่ ${nextRound.opensAt}` : "ติดตามรอบถัดไปเร็ว ๆ นี้"}</span>
            </>
          )}
        </div>
      </section>
    </>
  );
}
