-- Anonymous "interested in the next round" taps, shown on the storefront while
-- no round is open. Deliberately holds nothing but a timestamp — no phone, no
-- name, no IP — abuse control (one tap per visitor) lives in the R2-backed
-- rate limiter (lib/rate-limit.ts), not in this table.
CREATE TABLE IF NOT EXISTS round_interest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS round_interest_created_at_idx ON round_interest (created_at);
