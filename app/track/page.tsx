import type { Metadata } from "next";
import { OrderTracker } from "./order-tracker";
import { getStorefrontData } from "../../lib/google-sheets";
import { DEFAULT_STOREFRONT_CONTENT } from "../../lib/admin-cms";

export const metadata: Metadata = {
  title: "ติดตามออเดอร์ | เจ๊น้อย เขียงหมูตะคร้อ",
  description: "ตรวจสอบสถานะชำระเงิน การเตรียมสินค้า และเลขพัสดุของออเดอร์ร้านเจ๊น้อย",
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  const parameters = await searchParams;
  const initialOrderId = typeof parameters.order === "string" ? parameters.order.toUpperCase().slice(0, 22) : "";
  const content = await getStorefrontData().then((storefront) => storefront.content).catch(() => ({
    ...DEFAULT_STOREFRONT_CONTENT,
    storeName: "เจ๊น้อย เขียงหมูตะคร้อ",
    phonePrimary: "087-2416773",
    phoneSecondary: "087-8755479",
  }));
  return <OrderTracker initialOrderId={initialOrderId} storeName={content.storeName} phonePrimary={content.phonePrimary} phoneSecondary={content.phoneSecondary} />;
}
