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
  // PromptPay details come along so a customer whose slip was rejected can
  // scan and pay again straight from the tracking page instead of hunting for
  // the QR back in the cart.
  const storefront = await getStorefrontData().catch(() => null);
  const content = storefront?.content ?? {
    ...DEFAULT_STOREFRONT_CONTENT,
    storeName: "เจ๊น้อย เขียงหมูตะคร้อ",
    phonePrimary: "087-2416773",
    phoneSecondary: "087-8755479",
  };
  return (
    <OrderTracker
      storeName={content.storeName}
      phonePrimary={content.phonePrimary}
      phoneSecondary={content.phoneSecondary}
      promptPayId={storefront?.promptPayId ?? null}
      promptPayName={storefront?.promptPayName ?? null}
      initialOrderId={initialOrderId}
    />
  );
}
