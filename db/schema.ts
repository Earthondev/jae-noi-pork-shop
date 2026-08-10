import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  // "all" opens every purchasable product; "selected" opens only the products
  // listed for this round in `roundProducts`.
  productScope: text("product_scope").notNull().default("all"),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("delivery_rounds_window_idx").on(table.status, table.opensAt, table.closesAt),
]);

export const roundProducts = sqliteTable("round_products", {
  roundId: text("round_id").notNull().references(() => deliveryRounds.id),
  productId: text("product_id").notNull().references(() => products.id),
}, (table) => [
  primaryKey({ columns: [table.roundId, table.productId] }),
  index("round_products_product_id_idx").on(table.productId),
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
  // Customer-facing re-uploads spent on this order; see lib/slip-retry.ts.
  slipRetriesUsed: integer("slip_retries_used").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("waiting_for_payment"),
  orderStatus: text("order_status").notNull().default("received"),
  trackingNumber: text("tracking_number"),
  carrierCode: text("carrier_code"),
  shippedAt: text("shipped_at"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("orders_phone_created_at_idx").on(table.phoneNormalized, table.createdAt),
  index("orders_created_at_idx").on(table.createdAt),
  index("orders_round_id_idx").on(table.roundId),
  uniqueIndex("orders_carrier_tracking_idx").on(table.carrierCode, table.trackingNumber),
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

export const trackingImports = sqliteTable("tracking_imports", {
  id: text("id").primaryKey(),
  carrierCode: text("carrier_code").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  originalFilename: text("original_filename").notNull(),
  sourceRowCount: integer("source_row_count").notNull(),
  importedRowCount: integer("imported_row_count").notNull(),
  importedBy: text("imported_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("tracking_imports_created_at_idx").on(table.createdAt),
]);

// Anonymous "interested in the next round" taps — see migrations/0008.
export const roundInterest = sqliteTable("round_interest", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("round_interest_created_at_idx").on(table.createdAt),
]);

export const trackingImportRows = sqliteTable("tracking_import_rows", {
  importId: text("import_id").notNull().references(() => trackingImports.id, { onDelete: "cascade" }),
  sourceRow: integer("source_row").notNull(),
  orderId: text("order_id").notNull().references(() => orders.id),
  carrierCode: text("carrier_code").notNull(),
  trackingNumber: text("tracking_number").notNull(),
}, (table) => [
  primaryKey({ columns: [table.importId, table.sourceRow] }),
  uniqueIndex("tracking_import_rows_carrier_tracking_idx").on(table.carrierCode, table.trackingNumber),
  index("tracking_import_rows_order_id_idx").on(table.orderId),
]);
