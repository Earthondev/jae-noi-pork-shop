#!/usr/bin/env node
// Read-only CLI for pulling data out of the shop's D1 database (orders,
// products, delivery rounds) without hand-writing `wrangler d1 execute`
// commands each time. Talks to Cloudflare the same way the rest of this repo
// does — shelling out to `wrangler d1 execute --remote` — since that's the
// only D1 access path scripts/ uses (see DATABASE_SCHEMA.md).
//
// Usage:
//   npm run admin:cli -- summary
//   npm run admin:cli -- order-status
//   npm run admin:cli -- orders [--limit 20] [--status received]
//   npm run admin:cli -- products
//   npm run admin:cli -- rounds [--limit 10]
//   npm run admin:cli -- query "SELECT * FROM products WHERE status = 'เปิดขาย'"
//   (add --staging to any command to read jae-noi-pork-shop-staging instead)

import { spawnSync } from "node:child_process";

const PRODUCTION = { name: "jae-noi-pork-shop", id: "7bfa8fbb-f603-441c-bbb0-b4474cdfd2fa" };
const STAGING = { name: "jae-noi-pork-shop-staging", id: "0b46c51f-c8b4-40b5-9ff5-efa681d7c1ee" };

const args = process.argv.slice(2);
const staging = args.includes("--staging");
const database = staging ? STAGING : PRODUCTION;
const positional = args.filter((arg) => !arg.startsWith("--"));
const [command, ...rest] = positional;

const QUERIES = {
  summary: () => `
    SELECT
      (SELECT count(*) FROM orders) AS total_orders,
      (SELECT count(*) FROM orders WHERE payment_status = 'paid') AS paid_orders,
      (SELECT coalesce(sum(total), 0) FROM orders WHERE payment_status = 'paid') AS paid_revenue_baht,
      (SELECT min(created_at) FROM orders) AS first_order_at,
      (SELECT max(created_at) FROM orders) AS last_order_at
  `,
  "order-status": () => `
    SELECT order_status, count(*) AS n
    FROM orders GROUP BY order_status ORDER BY n DESC
  `,
  orders: () => {
    const status = getFlag(args, "--status");
    const limit = toLimit(getFlag(args, "--limit", "20"));
    const where = status ? `WHERE order_status = '${escapeSqlLiteral(status)}'` : "";
    return `
      SELECT id, customer_name, phone, fulfilment, total, payment_status, order_status, created_at
      FROM orders ${where}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
  },
  products: () => `
    SELECT id, name, price, status, category, sort_order
    FROM products ORDER BY sort_order
  `,
  rounds: () => `
    SELECT id, delivery_date, status, opens_at, closes_at, product_scope
    FROM delivery_rounds ORDER BY delivery_date DESC LIMIT ${toLimit(getFlag(args, "--limit", "10"))}
  `,
};

if (command === "query") {
  const sql = rest.filter((arg) => !arg.startsWith("--")).join(" ").trim();
  if (!sql) fail('ต้องใส่ SQL หลัง query เช่น: npm run admin:cli -- query "SELECT * FROM products"');
  if (!/^(select|pragma|explain)\b/i.test(sql)) {
    fail("query รับเฉพาะ SELECT / PRAGMA / EXPLAIN เท่านั้น — CLI นี้อ่านข้อมูลอย่างเดียว ห้ามเขียนหรือลบผ่านทางนี้");
  }
  run(sql);
} else if (command && command in QUERIES) {
  run(QUERIES[command]());
} else {
  printUsage();
  process.exitCode = command ? 1 : 0;
}

function run(sql, attempt = 1) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "d1", "execute", database.name, "--remote", "--json", "--command", sql],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    // The Cloudflare API has been observed to fail once with a transient
    // auth error (code 10000) and succeed on immediate retry.
    if (attempt === 1 && /Authentication error/i.test(result.stderr ?? "")) {
      run(sql, attempt + 1);
      return;
    }
    process.stderr.write(result.stderr || result.stdout || "wrangler d1 execute ล้มเหลว\n");
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    process.stderr.write(`อ่านผลลัพธ์จาก wrangler ไม่ได้:\n${result.stdout}\n`);
    process.exitCode = 1;
    return;
  }

  const rows = parsed[0]?.results ?? [];
  console.log(`→ ${database.name}${staging ? " (staging)" : " (production)"}\n`);
  if (rows.length === 0) {
    console.log("(ไม่มีข้อมูล)");
    return;
  }
  console.table(rows);
}

function getFlag(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1 || index === argv.length - 1) return fallback;
  return argv[index + 1];
}

function toLimit(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0 || n > 500) fail(`--limit ต้องเป็นเลขจำนวนเต็ม 1-500 (ได้ "${value}")`);
  return n;
}

function escapeSqlLiteral(value) {
  return value.replaceAll("'", "''");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printUsage() {
  console.log(`ดึงข้อมูลหลังบ้าน jae-noi-pork-shop จาก Cloudflare D1 (อ่านอย่างเดียว)

คำสั่งที่มี:
  summary                     สรุปยอดออเดอร์ทั้งหมด/ที่จ่ายแล้ว/วันแรก-ล่าสุด
  order-status                จำนวนออเดอร์แยกตามสถานะ
  orders [--limit N] [--status STATUS]   ออเดอร์ล่าสุด (ค่าเริ่มต้น 20 รายการ)
  products                    รายการสินค้าและสถานะ
  rounds [--limit N]          รอบจัดส่งล่าสุด (ค่าเริ่มต้น 10 รายการ)
  query "SELECT ..."          รัน SELECT/PRAGMA/EXPLAIN เอง

ตัวเลือก:
  --staging                   อ่านจาก jae-noi-pork-shop-staging แทน production

ตัวอย่าง:
  npm run admin:cli -- summary
  npm run admin:cli -- orders --limit 5 --status shipped
  npm run admin:cli -- query "SELECT * FROM products WHERE status = 'เปิดขาย'"`);
}
