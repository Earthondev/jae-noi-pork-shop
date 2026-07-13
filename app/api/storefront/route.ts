import { NextResponse } from "next/server";
import { getStorefrontData } from "../../../lib/google-sheets";

export async function GET() {
  try {
    return NextResponse.json(await getStorefrontData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "โหลดข้อมูลร้านไม่สำเร็จ" }, { status: 502 });
  }
}
