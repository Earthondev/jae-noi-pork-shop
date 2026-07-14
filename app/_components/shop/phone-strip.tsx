export function PhoneStrip({ phonePrimary, phoneSecondary }: { phonePrimary: string; phoneSecondary: string }) {
  const primaryHref = phonePrimary.replace(/[^\d+]/g, "");
  const secondaryHref = phoneSecondary.replace(/[^\d+]/g, "");
  return (
    <section className="phone-strip" aria-labelledby="phone-strip-title">
      <div className="phone-strip-copy">
        <span className="phone-strip-icon" aria-hidden="true">☎</span>
        <div>
          <h2 id="phone-strip-title">โทรสั่งซื้อ / สอบถาม</h2>
          <p>แตะเบอร์เพื่อเปิดแอปโทรศัพท์</p>
        </div>
      </div>
      <div className="phone-strip-links">
        <a href={`tel:${primaryHref}`} aria-label={`โทรหาร้านเจ๊น้อยที่เบอร์ ${phonePrimary}`}><span>โทร</span><strong>{phonePrimary}</strong></a>
        <a href={`tel:${secondaryHref}`} aria-label={`โทรหาร้านเจ๊น้อยที่เบอร์ ${phoneSecondary}`}><span>โทร</span><strong>{phoneSecondary}</strong></a>
      </div>
    </section>
  );
}
