-- Per-round product scope: a round either opens the whole shop ('all', the
-- behaviour every existing round keeps) or only the products listed in
-- round_products ('selected').
ALTER TABLE delivery_rounds ADD COLUMN product_scope TEXT NOT NULL DEFAULT 'all';

CREATE TABLE IF NOT EXISTS round_products (
  round_id TEXT NOT NULL REFERENCES delivery_rounds(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (round_id, product_id)
);

CREATE INDEX IF NOT EXISTS round_products_product_id_idx ON round_products(product_id);
