import { env } from "cloudflare:workers";

type RuntimeBindings = { DB?: D1Database };

function database(): D1Database {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) throw new Error("Cloudflare D1 binding `DB` is unavailable");
  return db;
}

function thaiTime(value: string): number {
  return Date.parse(`${value}:00+07:00`);
}

export async function recordRoundInterestTap(createdAt: string): Promise<void> {
  await database().prepare("INSERT INTO round_interest (created_at) VALUES (?)").bind(createdAt).run();
}

/**
 * Taps since the last round closed — the count naturally resets itself once a
 * new round is scheduled, with no cleanup job needed. Before any round has
 * ever existed, everything counts.
 */
export async function countRoundInterestSinceLastRoundClosed(): Promise<number> {
  const db = database();
  const lastClosedRow = await db.prepare("SELECT MAX(closes_at) as closes_at FROM delivery_rounds").first<{ closes_at: string | null }>();
  const cutoffIso = lastClosedRow?.closes_at ? new Date(thaiTime(lastClosedRow.closes_at)).toISOString() : "1970-01-01T00:00:00.000Z";
  const result = await db.prepare("SELECT COUNT(*) as count FROM round_interest WHERE created_at > ?").bind(cutoffIso).first<{ count: number }>();
  return result?.count ?? 0;
}
