import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default(""),
  detail: text("detail").notNull().default(""),
  price: integer("price"),
  status: text("status").notNull(),
  imageUrl: text("image_url").notNull().default(""),
  category: text("category").notNull().default("อื่น ๆ"),
  sortOrder: integer("sort_order").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("products_sort_order_idx").on(table.sortOrder),
  index("products_status_sort_idx").on(table.status, table.sortOrder),
]);

export const deliveryRounds = sqliteTable("delivery_rounds", {
  id: text("id").primaryKey(),
  deliveryDate: text("delivery_date").notNull().unique(),
  opensAt: text("opens_at").notNull(),
  closesAt: text("closes_at").notNull(),
  status: text("status").notNull(),
  label: text("label").notNull().default(""),
  note: text("note").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("delivery_rounds_window_idx").on(table.status, table.opensAt, table.closesAt),
]);

export const storefrontSettings = sqliteTable("storefront_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  purpose: text("purpose").notNull().default(""),
  status: text("status").notNull().default("พร้อมใช้"),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull(),
  deliveryDate: text("delivery_date").notNull().default(""),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  phoneNormalized: text("phone_normalized").notNull(),
  fulfilment: text("fulfilment").notNull(),
  address: text("address").notNull(),
  addressLine: text("address_line").notNull().default(""),
  subdistrict: text("subdistrict").notNull().default(""),
  district: text("district").notNull().default(""),
  province: text("province").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  note: text("note").notNull().default(""),
  adminNote: text("admin_note").notNull().default(""),
  subtotal: integer("subtotal").notNull(),
  shippingFee: integer("shipping_fee").notNull().default(0),
  total: integer("total").notNull(),
  slipKey: text("slip_key"),
  paymentStatus: text("payment_status").notNull().default("waiting_for_payment"),
  orderStatus: text("order_status").notNull().default("received"),
  trackingNumber: text("tracking_number"),
  shippedAt: text("shipped_at"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("orders_phone_created_at_idx").on(table.phoneNormalized, table.createdAt),
  index("orders_created_at_idx").on(table.createdAt),
]);

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id").notNull().references(() => orders.id),
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
}, (table) => [
  index("order_items_order_id_idx").on(table.orderId),
]);
