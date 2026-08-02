-- One self-service re-upload for a customer whose slip was rejected.
-- Existing orders start at 0, so anyone currently stuck on "สลิปไม่ถูกต้อง"
-- gets the retry too rather than being locked out by the migration.
ALTER TABLE orders ADD COLUMN slip_retries_used INTEGER NOT NULL DEFAULT 0;
