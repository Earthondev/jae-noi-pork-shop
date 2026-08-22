import { env } from "cloudflare:workers";
import { lastClosedRoundCutoff } from "../lib/round-interest";

type RuntimeBindings = { DB?: D1Database };

function database(): D1Database {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) throw new Error("Cloudflare D1 binding `DB` is unavailable");
  return db;
}

export async function recordRoundInterestTap(createdAt: string): Promise<void> {
  await database().prepare("INSERT INTO round_interest (created_at) VALUES (?)").bind(createdAt).run();
}

/**
 * Taps since the last round that has *already* closed. See
 * `lib/round-interest.ts` for why a future round must not move the cutoff.
 */
export async function countRoundInterestSinceLastRoundClosed(now = new Date()): Promise<number> {
  const db = database();
  const rounds = await db.prepare("SELECT closes_at FROM delivery_rounds").all<{ closes_at: string }>();
  const cutoffIso = lastClosedRoundCutoff(rounds.results.map((row) => row.closes_at), now);
  const result = await db.prepare("SELECT COUNT(*) as count FROM round_interest WHERE created_at > ?").bind(cutoffIso).first<{ count: number }>();
  return result?.count ?? 0;
}
