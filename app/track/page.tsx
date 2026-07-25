import type { Metadata } from "next";
import { OrderTracker } from "./order-tracker";
import { getStorefrontData } from "../../db/storefront-repository";
import { DEFAULT_STOREFRONT_CONTENT } from "../../lib/admin-cms";
import { isValidOrderId } from "../../lib/order-tracking";

export const metadata: Metadata = {
  title: "ติดตามออเดอร์ | เจ๊น้อย เขียงหมูตะคร้อ",
  description: "ตรวจสอบสถานะชำระเงิน การเตรียมสินค้า และเลขพัสดุของออเดอร์ร้านเจ๊น้อย",
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  const params = await searchParams;
  const requestedOrderId = Array.isArray(params.order) ? params.order[0] : params.order;
  const initialOrderId = requestedOrderId && isValidOrderId(requestedOrderId) ? requestedOrderId : "";
  const content = await getStorefrontData().then((storefront) => storefront.content).catch(() => ({
    ...DEFAULT_STOREFRONT_CONTENT,
    storeName: "เจ๊น้อย เขียงหมูตะคร้อ",
    phonePrimary: "087-2416773",
    phoneSecondary: "087-8755479",
  }));
  return <OrderTracker storeName={content.storeName} phonePrimary={content.phonePrimary} phoneSecondary={content.phoneSecondary} initialOrderId={initialOrderId} />;
}
