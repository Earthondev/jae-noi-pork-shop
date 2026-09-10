import type { ShippingPromotion } from "../../../lib/shipping";

export function CatalogueShipping({ shippingFee, freeShippingMinimum }: ShippingPromotion) {
  return <p>
    {shippingFee === null ? "ค่าจัดส่งยังไม่พร้อม กรุณาตรวจสอบที่หน้าร้าน" : `ค่าจัดส่งไปรษณีย์ ${shippingFee} บาท`}
    {shippingFee !== null && freeShippingMinimum !== null && freeShippingMinimum > 0
      ? ` · สั่งครบ ${freeShippingMinimum} บาท ส่งฟรี` : ""}
  </p>;
}
