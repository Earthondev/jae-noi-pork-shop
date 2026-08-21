import Image from "next/image";
import { useEffect, useState } from "react";
import type { PreorderRound, StorefrontContent } from "../../_hooks/use-storefront";

export type HeroProps = Readonly<{
  storeLoading: boolean;
  orderingOpen: boolean;
  rounds: readonly PreorderRound[];
  nextRound: PreorderRound | null;
  content: StorefrontContent;
  shippingFee: number | null;
  freeShippingMinimum: number | null;
  pickupAvailable: boolean;
}>;

export function Hero({ storeLoading, orderingOpen, rounds, nextRound, content, shippingFee, freeShippingMinimum, pickupAvailable }: HeroProps) {
  const [interestCount, setInterestCount] = useState<number | null>(null);
  const [interestTapped, setInterestTapped] = useState(false);
  const [interestPending, setInterestPending] = useState(false);
  const showInterestPrompt = !storeLoading && !orderingOpen;
  const heroDescription = content.heroDescription.replace(
    "แคปหมูสูตรร้านเจ๊น้อย",
    "กากหมูโบราณ (แคปหมูติดมัน) สูตรร้านเจ๊น้อย",
  );

  // Only fetched while there's nothing to buy — this is the number shown in
  // place of the dead-end "ยังไม่เปิดรับออเดอร์" button.
  useEffect(() => {
    if (!showInterestPrompt) return;
    const controller = new AbortController();
    void fetch("/api/round-interest", { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ count: number }>) : null))
      .then((data) => { if (data) setInterestCount(data.count); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [showInterestPrompt]);

  const tapInterest = () => {
    if (interestPending || interestTapped) return;
    setInterestPending(true);
    void fetch("/api/round-interest", { method: "POST" })
      .then((response) => (response.ok ? (response.json() as Promise<{ count: number }>) : null))
      .then((data) => {
        setInterestTapped(true);
        if (data) setInterestCount(data.count);
      })
      .catch(() => undefined)
      .finally(() => setInterestPending(false));
  };

  return (
    <>
      <section className="hero" id="top">
        <div className="hero-photo" aria-hidden="true">
          <Image
            className="hero-photo-img"
            src="/images/products/hero-basket-spread.jpg"
            alt=""
            width={1100}
            height={846}
            priority
          />
        </div>
        <div className="hero-copy">
          <div className="hero-copy-top">
            <p className="eyebrow">
              <svg className="eyebrow-icon" aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="7.4" cy="7.6" rx="1.7" ry="2.5" transform="rotate(-24 7.4 7.6)" fill="currentColor" />
                <ellipse cx="16.6" cy="7.6" rx="1.7" ry="2.5" transform="rotate(24 16.6 7.6)" fill="currentColor" />
                <circle cx="12" cy="12.6" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <rect x="9" y="13.6" width="6" height="3.6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="10.5" cy="15.4" r="0.6" fill="currentColor" />
                <circle cx="13.5" cy="15.4" r="0.6" fill="currentColor" />
                <circle cx="9.3" cy="11" r="0.7" fill="currentColor" />
                <circle cx="14.7" cy="11" r="0.7" fill="currentColor" />
              </svg>
              แหนมหมูและของอร่อยจากตะคร้อ · ทำสดทุกวัน
            </p>
            <h1>
              {content.heroTitle}<br />
              <span>{content.heroHighlight}</span>
            </h1>
            <p className="hero-lead">{heroDescription}</p>
          </div>
          <div
            className={`hero-ordering-panel${storeLoading ? " is-loading" : orderingOpen ? " is-open" : " is-closed"}`}
            aria-busy={storeLoading}
          >
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {storeLoading
                ? "กำลังตรวจสอบรอบ ปุ่มสั่งซื้อยังไม่พร้อม"
                : orderingOpen
                  ? `${rounds[0].label} เปิดรับออเดอร์แล้ว ปุ่มเลือกสินค้าพร้อมใช้งาน`
                  : "ยังไม่มีรอบที่เปิดรับ กดปุ่มสนใจรอบหน้าเพื่อแจ้งความสนใจได้"}
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
                <a className="primary-action" href="#products" aria-label="เลือกสินค้า">
                  <svg className="primary-action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9h18l-1.5 11a2 2 0 0 1-2 1.8H6.5a2 2 0 0 1-2-1.8L3 9Z" />
                    <path d="M8 9V7a4 4 0 0 1 8 0v2" />
                  </svg>
                  <span className="primary-action-label">เลือกของอร่อยในรอบนี้</span>
                  <svg className="primary-action-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </a>
              ) : storeLoading ? (
                <button className="primary-action" type="button" disabled>กำลังตรวจสอบรอบ</button>
              ) : (
                <div className="hero-interest">
                  <button
                    className="primary-action"
                    type="button"
                    onClick={tapInterest}
                    disabled={interestPending || interestTapped}
                  >
                    {interestTapped ? "รับทราบแล้ว ขอบคุณค่ะ" : "กดสนใจรอบหน้า"}
                  </button>
                  {interestCount !== null && interestCount > 0 && (
                    <span className="hero-interest-count">มีคนกดสนใจรอบหน้าแล้ว {interestCount} คน</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="hero-shipping-summary" aria-label="ข้อมูลการรับสินค้าและค่าจัดส่ง">
            <div className="shipping-card">
              <svg className="shipping-card-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.5 3.5 20 11l-8.5 8.5a2 2 0 0 1-2.8 0L4 15a2 2 0 0 1 0-2.8L12.5 3.5Z" />
                <path d="M4 12.2 11.8 4" />
                <circle cx="15.5" cy="8.5" r="1.3" />
              </svg>
              <div className="shipping-card-text">
                <span>จัดส่งไปรษณีย์</span>
                <strong>{shippingFee === null ? "รอข้อมูลค่าส่ง" : `${shippingFee.toLocaleString("th-TH")} บาท`}</strong>
              </div>
            </div>
            {freeShippingMinimum !== null && (
              <div className="shipping-card">
                <svg className="shipping-card-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="6" width="13" height="10"></rect>
                  <polygon points="14 10 18 10 21.5 13 21.5 16 14 16 14 10"></polygon>
                  <circle cx="5" cy="17.5" r="2"></circle>
                  <circle cx="17" cy="17.5" r="2"></circle>
                </svg>
                <div className="shipping-card-text">
                  <span>ครบ {freeShippingMinimum.toLocaleString("th-TH")} บาท</span>
                  <strong>ส่งฟรี</strong>
                </div>
              </div>
            )}
            {pickupAvailable && (
              <div className="shipping-card">
                <svg className="shipping-card-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 9.5 5 4h14l1 5.5" />
                  <path d="M4 9.5a2.3 2.3 0 0 0 4.4 1 2.3 2.3 0 0 0 4.4 0 2.3 2.3 0 0 0 4.4 0 2.3 2.3 0 0 0 4.4-1" />
                  <path d="M5.5 11v9h13v-9" />
                  <path d="M10 20v-5h4v5" />
                </svg>
                <div className="shipping-card-text">
                  <span>รับเองที่หน้าร้าน</span>
                  <strong>ฟรี</strong>
                </div>
              </div>
            )}
          </div>
          <div className="hero-highlights">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
              </svg>
              ทำสดใหม่ทุกวัน
            </span>
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
              ส่งด่วนทั่วประเทศ
            </span>
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
                <polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon>
                <polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"></polygon>
                <polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"></polygon>
              </svg>
              แพ็กดี ปลอดภัย
            </span>
          </div>
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
