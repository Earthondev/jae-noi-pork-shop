-- Seed products
INSERT OR REPLACE INTO products (id, name, unit, detail, price, status, image_url, category, sort_order, version, updated_at) VALUES
('SAUSAGE10', 'ไส้กรอกอีสาน', '1 แพ็ค', 'ไส้กรอกอีสานแพ็กละ 10 ชิ้น', 100, 'เปิดขาย', '/media/products/isan-sausage-pack10-v1.jpg', 'ไส้กรอกอีสาน', 1, 1, '2026-07-16T00:00:00.000Z'),
('NAEM250', 'แหนมหมู', '250 กรัม', 'แหนมหมู 250 กรัม', 50, 'เปิดขาย', '/media/products/naem-pork-250g-v1.jpg', 'แหนมหมู', 2, 1, '2026-07-16T00:00:00.000Z'),
('PORKRIND1', 'แคปหมู', '1 กล่อง', 'แคปหมู 1 กล่อง', 150, 'เปิดขาย', '/media/products/pork-rinds-box-v1.jpg', 'แคปหมู', 3, 1, '2026-07-16T00:00:00.000Z');

-- Seed delivery_rounds
-- Let's make an active round open from 2026-07-13 to 2026-07-20, delivery on 2026-07-21
INSERT OR REPLACE INTO delivery_rounds (id, delivery_date, opens_at, closes_at, status, label, note, version, updated_at) VALUES
('RD-20260721', '2026-07-21', '2026-07-13T00:00', '2026-07-20T23:59', 'เปิดรับ', 'รอบจัดส่ง 21 ก.ค. 2026', 'ตัวอย่าง: ปิดตะกร้าวันที่ 20 จัดส่งวันที่ 21 ก.ค.', 1, '2026-07-16T00:00:00.000Z');

-- Seed storefront settings
INSERT OR REPLACE INTO storefront_settings (key, value, status, version, updated_at) VALUES
('store_name', 'เจ๊น้อย เขียงหมูตะคร้อ', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('postal_shipping_fee', '50', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('pickup_address', 'ร้านเจ๊น้อย เขียงหมูตะคร้อ ถนนนิเวศรัตน์ ต.บัวใหญ่ อ.บัวใหญ่ จ.นครราชสีมา 30120', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('pickup_map_url', 'https://maps.app.goo.gl/uVChd79bzjbXYwtXA?g_st=il', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('promptpay_id', '0931687892', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('promptpay_name', 'ณัฐวิภา ลิ้มชูวงศ์', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('hero_title', 'อร่อยถึงเครื่อง', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('hero_highlight', 'สั่งง่ายถึงบ้าน', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('hero_description', 'แหนมหมู ไส้กรอกอีสาน และแคปหมูสูตรร้านเจ๊น้อย เลือกของอร่อย ใส่ตะกร้า แล้วสั่งได้เลย', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('announcement_text', 'ทำสดทุกวัน ◆ สูตรดั้งเดิมตะคร้อ ◆ แพ็กพร้อมส่ง ◆ อร่อยถึงเครื่อง', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('story_title', 'ของดีจากเขียงหมูตะคร้อ', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('story_description', 'รสชาติคุ้นเคยจากร้านท้องถิ่น ส่งต่อด้วยวัตถุดิบที่คัดแล้วและความตั้งใจในทุกแพ็ก จากมือเจ๊น้อยถึงมือลูกค้า', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('phone_primary', '087-2416773', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('phone_secondary', '087-8755479', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('store_logo_url', '/images/products/jae-noi-shop-logo.jpg', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z'),
('store_cover_url', '/images/products/jae-noi-holding-two-naem-pork-bags.jpg', 'พร้อมใช้', 1, '2026-07-16T00:00:00.000Z');
