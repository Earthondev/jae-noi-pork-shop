CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  round_id TEXT NOT NULL,
  delivery_date TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  fulfilment TEXT NOT NULL CHECK (fulfilment IN ('pickup', 'postal')),
  address TEXT NOT NULL,
  address_line TEXT NOT NULL DEFAULT '',
  subdistrict TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  total INTEGER NOT NULL CHECK (total >= 0),
  slip_key TEXT,
  payment_status TEXT NOT NULL DEFAULT 'waiting_for_payment'
    CHECK (payment_status IN ('waiting_for_payment', 'waiting_for_slip_review', 'paid', 'invalid_slip', 'refunded')),
  order_status TEXT NOT NULL DEFAULT 'received'
    CHECK (order_status IN ('received', 'preparing', 'ready_for_pickup', 'shipped', 'completed', 'cancelled')),
  tracking_number TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS orders_phone_created_at_idx ON orders(phone_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
