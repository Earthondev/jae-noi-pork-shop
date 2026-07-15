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
          <span className="round-status-icon" aria-hidden="true">
            {storeLoading ? (
              <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="10" stroke="rgba(181, 21, 25, 0.1)" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeLinecap="round" />
              </svg>
            ) : rounds[0] ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <line x1="10" y1="14" x2="14" y2="18"></line>
                <line x1="14" y1="14" x2="10" y2="18"></line>
              </svg>
            )}
          </span>
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
