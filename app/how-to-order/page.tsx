import type { Metadata } from "next";
import Link from "next/link";
import { SeoPageNav } from "../_components/shop/seo-page-nav";
import { SITE_URL, SHOP } from "../../lib/seo";

const PAGE_URL = `${SITE_URL}/how-to-order`;
const PAGE_TITLE = "วิธีสั่งแหนมหมูออนไลน์และการจัดส่ง | เจ๊น้อย เขียงหมูตะคร้อ";
const PAGE_DESCRIPTION =
  "วิธีสั่งแหนมหมู ไส้กรอกอีสาน และแคปหมูออนไลน์จากเจ๊น้อย เขียงหมูตะคร้อ เลือกสินค้า กรอกข้อมูล ชำระเงิน และติดตามออเดอร์ได้ในหน้าเดียว";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
    locale: "th_TH",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "วิธีสั่งแหนมหมูออนไลน์จากเจ๊น้อย เขียงหมูตะคร้อ" }],
  },
};

const faqItems = [
  {
    question: "สั่งแหนมหมูออนไลน์จากเจ๊น้อยอย่างไร",
    answer: ["เข้าเว็บไซต์ เลือกสินค้าในรอบพรีออเดอร์ กรอกข้อมูลจัดส่ง เลือกวิธีรับสินค้า ชำระเงินตามยอดออเดอร์ และแนบสลิปในขั้นตอนสั่งซื้อ"],
  },
  {
    question: "เจ๊น้อยส่งแหนมหมูไปต่างจังหวัดหรือไม่",
    answer: ["ร้านมีตัวเลือกจัดส่งไปรษณีย์ทั่วไทยเมื่อรอบนั้นเปิดรับออเดอร์ โดยค่าจัดส่งและรายละเอียดจะแสดงในขั้นตอนสั่งซื้อ"],
  },
  {
    question: "รับสินค้าเองที่ร้านได้หรือไม่",
    answer: ["ระบบจะแสดงตัวเลือกรับเองหน้าร้านเมื่อรอบพรีออเดอร์นั้นเปิดให้รับสินค้าเอง"],
  },
  {
    question: "ถ้าสั่งแล้วจะติดตามออเดอร์ได้ที่ไหน",
    answer: ["กรอกแค่เบอร์โทรที่ใช้ตอนสั่งซื้อที่ ", { text: "หน้าติดตามออเดอร์", href: "/track" }, " เพื่อตรวจสอบสถานะล่าสุด ไม่ต้องจำเลขออเดอร์"],
  },
] as const;

const faqJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${PAGE_URL}#faq`,
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer.map((part) => typeof part === "string" ? part : part.text).join(""),
    },
  })),
});

const steps = [
  { number: "1", title: "เลือกสินค้า", text: "เลือกแหนมหมู ไส้กรอกอีสาน หรือแคปหมูที่ต้องการจากหน้าสินค้า แล้วเพิ่มจำนวนลงตะกร้า" },
  { number: "2", title: "กรอกข้อมูลจัดส่ง", text: "กรอกชื่อ เบอร์โทร และที่อยู่ให้ครบถ้วน จากนั้นเลือกรับไปรษณีย์หรือรับเองหน้าร้านตามตัวเลือกที่แสดง" },
  { number: "3", title: "ชำระเงินและแนบสลิป", text: "ตรวจสอบรายการและยอดรวม สแกน QR พร้อมเพย์ตามข้อมูลในตะกร้า แล้วแนบหลักฐานการชำระเงิน" },
  { number: "4", title: "ติดตามออเดอร์", text: "เก็บเลขออเดอร์ไว้ใช้ตรวจสอบสถานะการชำระเงิน การเตรียมสินค้า และเลขพัสดุผ่านหน้าติดตามออเดอร์" },
] as const;

export default function HowToOrderPage() {
  return (
    <main className="seo-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd }} />
      <div className="seo-page-shell">
        <nav className="seo-breadcrumbs" aria-label="เส้นทางหน้าเว็บ">
          <Link href="/">หน้าแรก</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">วิธีสั่งซื้อ</span>
        </nav>

        <header className="seo-page-hero seo-page-hero-compact">
          <p className="eyebrow">สั่งง่ายถึงบ้าน</p>
          <h1>วิธีสั่งแหนมหมูออนไลน์จากเจ๊น้อย เขียงหมูตะคร้อ</h1>
          <p>
            ลูกค้าที่กำลังหาวิธีสั่งแหนมหมู ไส้กรอกอีสาน หรือแคปหมูออนไลน์สามารถทำรายการได้ตาม 4 ขั้นตอนนี้
            ร้านเปิดรับตามรอบพรีออเดอร์ จึงควรตรวจสอบสถานะรอบล่าสุดก่อนยืนยันรายการ
          </p>
          <div className="seo-page-actions">
            <Link className="seo-primary-action" href="/#products">เริ่มเลือกสินค้า</Link>
            <Link className="seo-secondary-action" href="/products">ดูเมนูสินค้า</Link>
          </div>
        </header>

        <section className="seo-steps" aria-labelledby="order-steps-title">
          <div className="section-heading">
            <span className="eyebrow">สั่งซื้อออนไลน์</span>
            <h2 id="order-steps-title">4 ขั้นตอนตั้งแต่เลือกของถึงติดตามพัสดุ</h2>
          </div>
          <div className="seo-step-grid">
            {steps.map((step) => (
              <article className="seo-step-card" key={step.number}>
                <span className="seo-step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="seo-faq" aria-labelledby="faq-title">
          <div className="section-heading">
            <span className="eyebrow">คำถามที่พบบ่อย</span>
            <h2 id="faq-title">ข้อมูลการสั่งและการรับสินค้า</h2>
          </div>
          <div className="seo-faq-list">
            {faqItems.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>{item.question}</summary>
                <p>{item.answer.map((part, partIndex) => typeof part === "string"
                  ? part
                  : <Link key={partIndex} href={part.href}>{part.text}</Link>)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="seo-info-panel" aria-labelledby="contact-title">
          <div>
            <p className="eyebrow">สอบถามร้าน</p>
            <h2 id="contact-title">เจ๊น้อย เขียงหมูตะคร้อ บัวใหญ่ นครราชสีมา</h2>
          </div>
          <p>
            หากต้องการสอบถามรอบจัดส่งหรือรายละเอียดสินค้า โทร {SHOP.phonePrimary} หรือ {SHOP.phoneSecondary}
            ได้โดยตรง แล้วกลับไปดูสินค้าและรอบสั่งซื้อที่หน้าแรก
          </p>
        </section>

        <footer className="seo-page-footer">
          <strong>{SHOP.legalName}</strong>
          <span>{SHOP.street} {SHOP.subdistrict} {SHOP.district} {SHOP.province} {SHOP.postalCode}</span>
          <span>สั่งแหนมหมู ไส้กรอกอีสาน และแคปหมูออนไลน์</span>
          <div>
            <Link href="/">กลับหน้าแรก</Link>
            <Link href="/products">เมนูสินค้า</Link>
            <Link href="/track">ติดตามออเดอร์</Link>
          </div>
        </footer>
      </div>
      <SeoPageNav activeTab="products" />
    </main>
  );
}
