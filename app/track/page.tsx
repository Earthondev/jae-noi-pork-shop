import type { Metadata } from "next";
import { OrderTracker } from "./order-tracker";

export const metadata: Metadata = {
  title: "ติดตามออเดอร์ | เจ๊น้อย เขียงหมูตะคร้อ",
  description: "ตรวจสอบสถานะชำระเงิน การเตรียมสินค้า และเลขพัสดุของออเดอร์ร้านเจ๊น้อย",
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  const parameters = await searchParams;
  const initialOrderId = typeof parameters.order === "string" ? parameters.order.toUpperCase().slice(0, 22) : "";
  return <OrderTracker initialOrderId={initialOrderId} />;
}
