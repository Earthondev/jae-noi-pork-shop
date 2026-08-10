import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { countRoundInterestSinceLastRoundClosed, recordRoundInterestTap } from "../../../db/round-interest-repository";
import { checkRateLimit, clientIpKey } from "../../../lib/rate-limit";
import { publicErrorBody } from "../../../lib/public-errors";
import { reportServerError } from "../../../lib/server-monitoring";

type RoundInterestBindings = { UPLOADS?: R2Bucket };

// One tap counted per visitor per day — generous enough that a genuinely
// interested person isn't blocked, tight enough that mashing the button does
// nothing after the first tap.
const TAP_WINDOW_MS = 24 * 60 * 60 * 1000;
const TAP_MAX_PER_WINDOW = 1;

export async function GET() {
  try {
    const count = await countRoundInterestSinceLastRoundClosed();
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    reportServerError({ event: "round_interest_read_failed", operation: "round_interest.count", error, path: "/api/round-interest", method: "GET" });
    return NextResponse.json(publicErrorBody("STORE_UNAVAILABLE"), { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const bindings = env as unknown as RoundInterestBindings;
    const uploads = bindings.UPLOADS;
    if (!uploads) {
      reportServerError({ event: "round_interest_storage_unavailable", operation: "round_interest.tap", path: "/api/round-interest", method: "POST" });
      return NextResponse.json(publicErrorBody("STORE_UNAVAILABLE"), { status: 503 });
    }

    const allowed = await checkRateLimit(uploads, "round-interest", clientIpKey(request), {
      windowMs: TAP_WINDOW_MS,
      max: TAP_MAX_PER_WINDOW,
    });
    // A rejected tap still isn't an error to the visitor — they already
    // registered once, so this is just "thanks, already counted" from their view.
    if (allowed) await recordRoundInterestTap(new Date().toISOString());

    const count = await countRoundInterestSinceLastRoundClosed();
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    reportServerError({ event: "round_interest_tap_failed", operation: "round_interest.tap", error, path: "/api/round-interest", method: "POST" });
    return NextResponse.json(publicErrorBody("STORE_UNAVAILABLE"), { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
