import Image from "next/image";
import { useState } from "react";
import type { PreorderRound, StorefrontContent } from "../../_hooks/use-storefront";

export type HeroProps = Readonly<{
  storeLoading: boolean;
  orderingOpen: boolean;
  rounds: readonly PreorderRound[];
  nextRound: PreorderRound | null;
  content: StorefrontContent;
}>;

export function Hero({ storeLoading, orderingOpen, rounds, nextRound, content }: HeroProps) {
  // Hover already pauses the marquee; touch devices have no hover, so a tap
  // toggles the pause instead.
  const [marqueePaused, setMarqueePaused] = useState(false);
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
          <div
            className={`hero-ordering-panel${storeLoading ? " is-loading" : orderingOpen ? " is-open" : " is-closed"}`}
            aria-busy={storeLoading}
          >
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {storeLoading
                ? "กำลังตรวจสอบรอบ ปุ่มสั่งซื้อยังไม่พร้อม"
                : orderingOpen
                  ? `${rounds[0].label} เปิดรับออเดอร์แล้ว ปุ่มเลือกสินค้าพร้อมใช้งาน`
                  : "ยังไม่มีรอบที่เปิดรับ ปุ่มสั่งซื้อถูกปิดไว้"}
            </span>
            <span className="round-status-icon" aria-hidden="true">
              {storeLoading ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" opacity=".18" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              ) : orderingOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="10" y1="14" x2="14" y2="18" />
                  <line x1="14" y1="14" x2="10" y2="18" />
                </svg>
              )}
            </span>
            <div className="hero-ordering-copy">
              {storeLoading ? (
                <>
                  <strong>กำลังตรวจสอบรอบ</strong>
                  <span>รอสักครู่ก่อนเลือกสินค้า</span>
                </>
              ) : orderingOpen ? (
                <>
                  <strong>{rounds[0].label}</strong>
                  <span>ปิดตะกร้า {formatStorefrontDateTime(rounds[0].closesAt)}</span>
                </>
              ) : (
                <>
                  <strong>ยังไม่มีรอบที่เปิดรับ</strong>
                  <span>{nextRound ? `รอบถัดไปเปิดวันที่ ${formatStorefrontDateTime(nextRound.opensAt)}` : "ติดตามรอบถัดไปเร็ว ๆ นี้"}</span>
                </>
              )}
            </div>
            <div className="hero-actions">
              {orderingOpen ? (
                <a className="primary-action" href="#products">เลือกสินค้า</a>
              ) : (
                <button className="primary-action" type="button" disabled>
                  {storeLoading ? "กำลังตรวจสอบรอบ" : "ยังไม่เปิดรับออเดอร์"}
                </button>
              )}
            </div>
          </div>
          <div className="hero-features-container">
            <div
              className={`hero-features${marqueePaused ? " paused" : ""}`}
              onClick={() => setMarqueePaused((paused) => !paused)}
              title={marqueePaused ? "แตะเพื่อเลื่อนต่อ" : "แตะเพื่อหยุดเลื่อน"}
            >
              {/* Set 1 */}
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginRight: 4 }}>
                  <rect x="1" y="3" width="15" height="13"></rect>
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                  <circle cx="5.5" cy="18.5" r="2.5"></circle>
                  <circle cx="18.5" cy="18.5" r="2.5"></circle>
                </svg>
                ส่งด่วนทั่วประเทศ
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginRight: 4 }}>
                  <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
                  <polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon>
                  <polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"></polygon>
                  <polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"></polygon>
                </svg>
                แพ็กสูญญากาศปลอดภัย
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginRight: 4 }}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                </svg>
                ทำสดใหม่ทุกวัน
              </span>
              {/* Set 2 (Duplicate for seamless loop) */}
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginRight: 4 }}>
                  <rect x="1" y="3" width="15" height="13"></rect>
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                  <circle cx="5.5" cy="18.5" r="2.5"></circle>
                  <circle cx="18.5" cy="18.5" r="2.5"></circle>
                </svg>
                ส่งด่วนทั่วประเทศ
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginRight: 4 }}>
                  <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
                  <polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon>
                  <polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"></polygon>
                  <polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"></polygon>
                </svg>
                แพ็กสูญญากาศปลอดภัย
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginRight: 4 }}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                </svg>
                ทำสดใหม่ทุกวัน
              </span>
            </div>
          </div>
        </div>
        <div className="hero-image-wrap">
          <div className="hero-image-inner">
            <Image className="hero-image" src={content.storeCoverUrl} alt="ภาพปกหน้าร้านเจ๊น้อย" width={900} height={900} priority />
          </div>
          <p className="hero-stamp">สดจริง<br /><strong>จากร้าน</strong></p>
        </div>
      </section>
    </>
  );
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function formatStorefrontDateTime(value: string): string {
  if (!value) return "—";
  try {
    const [date, time] = value.split("T");
    const [year, month, day] = date.split("-");
    const mIdx = parseInt(month, 10) - 1;
    const mStr = THAI_MONTHS[mIdx] ?? month;
    const beYear = parseInt(year, 10) + 543;
    const formattedTime = time ? ` เวลา ${time.slice(0, 5)} น.` : "";
    return `${parseInt(day, 10)} ${mStr} ${beYear}${formattedTime}`;
  } catch {
    return value;
  }
}
