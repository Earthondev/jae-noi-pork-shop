CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  price INTEGER,
  status TEXT NOT NULL CHECK (status IN ('เปิดขาย', 'ปิดชั่วคราว', 'รอข้อมูล', 'ซ่อนสินค้า')),
  image_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'อื่น ๆ',
  sort_order INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS products_sort_order_idx ON products(sort_order);
CREATE INDEX IF NOT EXISTS products_status_sort_idx ON products(status, sort_order);

CREATE TABLE IF NOT EXISTS delivery_rounds (
  id TEXT PRIMARY KEY NOT NULL,
  delivery_date TEXT NOT NULL UNIQUE,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('เตรียมเปิด', 'เปิดรับ', 'ปิดรับ', 'จัดส่งแล้ว', 'ยกเลิก')),
  label TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS delivery_rounds_window_idx ON delivery_rounds(status, opens_at, closes_at);

CREATE TABLE IF NOT EXISTS storefront_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'พร้อมใช้',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL UNIQUE,
  product_count INTEGER NOT NULL,
  round_count INTEGER NOT NULL,
  setting_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);
