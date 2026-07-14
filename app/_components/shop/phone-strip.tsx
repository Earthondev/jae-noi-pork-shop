export function PhoneStrip() {
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
        <a href="tel:0872416773" aria-label="โทรหาร้านเจ๊น้อยที่เบอร์ 087 241 6773"><span>โทร</span><strong>087-2416773</strong></a>
        <a href="tel:0878755479" aria-label="โทรหาร้านเจ๊น้อยที่เบอร์ 087 875 5479"><span>โทร</span><strong>087-8755479</strong></a>
      </div>
    </section>
  );
}
