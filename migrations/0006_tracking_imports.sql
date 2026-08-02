ALTER TABLE orders ADD COLUMN carrier_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_carrier_tracking_idx
  ON orders(carrier_code, tracking_number)
  WHERE carrier_code IS NOT NULL AND tracking_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS tracking_imports (
  id TEXT PRIMARY KEY NOT NULL,
  carrier_code TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  source_row_count INTEGER NOT NULL CHECK (source_row_count >= 0),
  imported_row_count INTEGER NOT NULL CHECK (imported_row_count >= 0),
  imported_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tracking_imports_created_at_idx
  ON tracking_imports(created_at DESC);

CREATE TABLE IF NOT EXISTS tracking_import_rows (
  import_id TEXT NOT NULL REFERENCES tracking_imports(id) ON DELETE CASCADE,
  source_row INTEGER NOT NULL CHECK (source_row > 0),
  order_id TEXT NOT NULL REFERENCES orders(id),
  carrier_code TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  PRIMARY KEY (import_id, source_row),
  UNIQUE (carrier_code, tracking_number)
);

CREATE INDEX IF NOT EXISTS tracking_import_rows_order_id_idx
  ON tracking_import_rows(order_id);

-- Preview results are advisory. This guard runs inside the final D1 batch so
-- a status or tracking change between preview and commit aborts the whole
-- import rather than leaving a misleading audit record.
CREATE TRIGGER tracking_import_rows_order_guard
BEFORE INSERT ON tracking_import_rows
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM orders
  WHERE id = NEW.order_id
    AND fulfilment = 'postal'
    AND payment_status = 'paid'
    AND order_status = 'shipped'
    AND carrier_code = NEW.carrier_code
    AND tracking_number = NEW.tracking_number
)
BEGIN
  SELECT RAISE(ABORT, 'tracking import order state changed');
END;
