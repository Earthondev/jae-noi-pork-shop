export type PaymentStatus = "waiting_for_payment" | "waiting_for_slip_review" | "paid" | "invalid_slip" | "refunded";
export type OrderStatus = "received" | "preparing" | "ready_for_pickup" | "shipped" | "completed" | "cancelled";

export type AdminOrder = {
  id: string;
  round_id: string;
  customer_name: string;
  phone: string;
  address: string;
  note: string;
  admin_note: string;
  subtotal: number;
  shipping_fee: number | null;
  total: number | null;
  slip_key: string | null;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  created_at: string;
  items: string;
  fulfilment: "pickup" | "postal";
  tracking_number: string | null;
  carrier_code: "flash" | null;
};
