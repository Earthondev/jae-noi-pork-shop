ALTER TABLE `orders` ADD `round_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_date` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `phone_normalized` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfilment` text NOT NULL DEFAULT 'postal';
--> statement-breakpoint
ALTER TABLE `orders` ADD `address_line` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `subdistrict` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `district` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `province` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `postal_code` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `admin_note` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_status` text NOT NULL DEFAULT 'waiting_for_payment';
--> statement-breakpoint
ALTER TABLE `orders` ADD `order_status` text NOT NULL DEFAULT 'received';
--> statement-breakpoint
ALTER TABLE `orders` ADD `tracking_number` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `idempotency_key` text;
--> statement-breakpoint
UPDATE `orders`
SET `phone_normalized` = replace(replace(replace(replace(`phone`, '-', ''), ' ', ''), '(', ''), ')', ''),
    `payment_status` = CASE
      WHEN `status` = 'paid' THEN 'paid'
      WHEN `status` = 'invalid_slip' THEN 'invalid_slip'
      WHEN `slip_key` IS NOT NULL THEN 'waiting_for_slip_review'
      ELSE 'waiting_for_payment'
    END,
    `idempotency_key` = 'legacy-' || `id`;
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_idx` ON `orders` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `orders_phone_created_at_idx` ON `orders` (`phone_normalized`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at` DESC);
--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);
