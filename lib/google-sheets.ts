const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID ?? "10kwcEYyyOA3tIKTpmdwH21KIdpidLaiU04RC6ON6tJE";

export type StorefrontProduct = {
  id: string;
  name: string;
  unit: string;
  detail: string;
  price: number | null;
  status: "เปิดขาย" | "รอข้อมูล";
  image: string;
};

export type StorefrontRound = {
  id: string;
  deliveryDate: string;
  closesAt: string;
  label: string;
  note: string;
};

function parseCsv(csv: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell !== "")) result.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); result.push(row); }
  return result;
}

async function readPublicSheet(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`อ่านแท็บ ${tab} ไม่สำเร็จ`);
  return parseCsv(await response.text());
}

export async function getStorefrontData() {
  const [productRows, roundRows, settingRows] = await Promise.all([
    readPublicSheet("สินค้า"),
    readPublicSheet("รอบจัดส่ง"),
    readPublicSheet("ตั้งค่าร้าน"),
  ]);

  const products: StorefrontProduct[] = productRows.slice(1)
    .filter((row) => row[0] && row[5] !== "หยุดขาย")
    .map((row) => ({
      id: row[0], name: row[1], unit: row[2], detail: row[3],
      price: row[4] ? Number(row[4].replace(/[^0-9.-]/g, "")) : null,
      status: row[5] === "เปิดขาย" ? "เปิดขาย" : "รอข้อมูล",
      image: `/images/products/${row[6]}`,
    }));

  const rounds: StorefrontRound[] = roundRows.slice(1)
    .filter((row) => row[0] && row[4] === "เปิดรับ" && row[9] === "แสดงใน dropdown")
    .map((row) => ({ id: row[0], deliveryDate: row[1], closesAt: row[3], label: row[5], note: row[6] }));

  const settings = Object.fromEntries(settingRows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1] ?? ""]));
  const shippingFee = settings.postal_shipping_fee ? Number(settings.postal_shipping_fee.replace(/[^0-9.-]/g, "")) : null;

  return {
    products,
    rounds,
    shippingFee: Number.isFinite(shippingFee) ? shippingFee : null,
    pickupAddress: settings.pickup_address || null,
    secureWriteReady: Boolean(process.env.GOOGLE_SHEETS_WRITE_TOKEN),
  };
}
