import { env } from "cloudflare:workers";
import { carrierLabel, isCarrierCode } from "../lib/carriers";
import type {
  ParsedTrackingRow,
  ParsedTrackingWorkbook,
  TrackingImportCommitResult,
  TrackingImportPreview,
  TrackingImportSelection,
  TrackingMatchOrder,
} from "../lib/tracking-import";
import { evaluateTrackingMatch } from "../lib/tracking-import";

type RuntimeBindings = { DB?: D1Database };

type MatchOrderRow = TrackingMatchOrder;

type ImportedRow = { order_id: string; tracking_number: string; carrier_code: string };

export class TrackingImportCommitError extends Error {}

function database(): D1Database {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) throw new Error("Cloudflare D1 binding `DB` is unavailable");
  return db;
}

export async function previewTrackingImport(parsed: ParsedTrackingWorkbook): Promise<TrackingImportPreview> {
  const db = database();
  const existing = await db.prepare("SELECT id FROM tracking_imports WHERE file_hash = ? LIMIT 1")
    .bind(parsed.fileHash).first<{ id: string }>();
  const statements = parsed.rows.map((row) => matchingStatement(db, row));
  const results = statements.length > 0 ? await db.batch(statements) : [];
  const rows = parsed.rows.map((source, index) => evaluateTrackingMatch(source, (results[index]?.results ?? []) as unknown as MatchOrderRow[], parsed.carrierCode));
  return {
    carrierCode: parsed.carrierCode,
    carrierLabel: carrierLabel(parsed.carrierCode),
    originalFilename: parsed.originalFilename,
    fileHash: parsed.fileHash,
    ignoredRows: parsed.ignoredRows,
    alreadyCommitted: Boolean(existing),
    rows,
  };
}

export async function commitTrackingImport(
  parsed: ParsedTrackingWorkbook,
  selections: TrackingImportSelection[],
  importedBy: string,
): Promise<TrackingImportCommitResult> {
  const db = database();
  const duplicate = await importedResult(db, parsed.fileHash);
  if (duplicate) return { ...duplicate, duplicate: true };

  const preview = await previewTrackingImport(parsed);
  const selectionByRow = new Map<number, string>();
  const selectedOrderIds = new Set<string>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.sourceRow) || selection.sourceRow < 1 || !/^JN-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/.test(selection.orderId)) {
      throw new TrackingImportCommitError("รายการที่เลือกไม่ถูกต้อง กรุณาพรีวิวไฟล์ใหม่");
    }
    if (selectionByRow.has(selection.sourceRow)) throw new TrackingImportCommitError("มีการเลือกแถวซ้ำ กรุณาพรีวิวไฟล์ใหม่");
    if (selectedOrderIds.has(selection.orderId)) throw new TrackingImportCommitError("ออเดอร์เดียวกันถูกเลือกมากกว่า 1 พัสดุ กรุณาตรวจรายการอีกครั้ง");
    selectionByRow.set(selection.sourceRow, selection.orderId);
    selectedOrderIds.add(selection.orderId);
  }
  if (selectionByRow.size === 0 || selectionByRow.size > parsed.rows.length) {
    throw new TrackingImportCommitError("กรุณาเลือกรายการที่ต้องการนำเข้าอย่างน้อย 1 รายการ");
  }

  const chosen = preview.rows.flatMap((row) => {
    const orderId = selectionByRow.get(row.sourceRow);
    if (!orderId) return [];
    const allowed = (row.status === "matched" || row.status === "ambiguous") && row.candidates.some((candidate) => candidate.orderId === orderId && !candidate.currentTrackingNumber);
    if (!allowed) throw new TrackingImportCommitError(`ออเดอร์สำหรับแถว ${row.sourceRow} เปลี่ยนแปลงแล้ว กรุณาพรีวิวไฟล์ใหม่`);
    return [{ sourceRow: row.sourceRow, orderId, trackingNumber: row.trackingNumber }];
  });
  if (chosen.length !== selectionByRow.size) throw new TrackingImportCommitError("บางรายการไม่อยู่ในไฟล์แล้ว กรุณาพรีวิวไฟล์ใหม่");

  const importId = `TI-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const statements = [
    db.prepare(`INSERT INTO tracking_imports (
      id, carrier_code, file_hash, original_filename, source_row_count, imported_row_count, imported_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(importId, parsed.carrierCode, parsed.fileHash, parsed.originalFilename, parsed.rows.length, chosen.length, importedBy.slice(0, 160), createdAt),
    ...chosen.map((row) => db.prepare(`UPDATE orders SET
      tracking_number = ?, carrier_code = ?, order_status = 'shipped',
      shipped_at = COALESCE(shipped_at, ?), updated_at = ?
      WHERE id = ? AND fulfilment = 'postal' AND payment_status = 'paid'
        AND order_status NOT IN ('cancelled', 'completed')
        AND (tracking_number IS NULL OR tracking_number = '')`)
      .bind(row.trackingNumber, parsed.carrierCode, createdAt, createdAt, row.orderId)),
    ...chosen.map((row) => db.prepare(`INSERT INTO tracking_import_rows (
      import_id, source_row, order_id, carrier_code, tracking_number
    ) VALUES (?, ?, ?, ?, ?)`)
      .bind(importId, row.sourceRow, row.orderId, parsed.carrierCode, row.trackingNumber)),
  ];
  await db.batch(statements);
  return {
    importId,
    duplicate: false,
    imported: chosen.map((row) => ({ orderId: row.orderId, trackingNumber: row.trackingNumber, carrierCode: parsed.carrierCode })),
  };
}

function matchingStatement(db: D1Database, row: ParsedTrackingRow): D1PreparedStatement {
  const select = `SELECT id, customer_name, phone, fulfilment, payment_status, order_status,
    tracking_number, carrier_code, delivery_date, created_at FROM orders`;
  if (/^JN-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/.test(row.orderReference)) {
    return db.prepare(`${select} WHERE id = ? LIMIT 1`).bind(row.orderReference);
  }
  return db.prepare(`${select} WHERE phone_normalized = ? ORDER BY created_at DESC LIMIT 10`).bind(row.phoneNormalized || "no-match");
}

async function importedResult(db: D1Database, fileHash: string): Promise<Omit<TrackingImportCommitResult, "duplicate"> | null> {
  const existing = await db.prepare("SELECT id FROM tracking_imports WHERE file_hash = ? LIMIT 1")
    .bind(fileHash).first<{ id: string }>();
  if (!existing) return null;
  const rows = await db.prepare(`SELECT order_id, tracking_number, carrier_code
    FROM tracking_import_rows WHERE import_id = ? ORDER BY source_row`).bind(existing.id).all<ImportedRow>();
  return {
    importId: existing.id,
    imported: rows.results.flatMap((row) => isCarrierCode(row.carrier_code)
      ? [{ orderId: row.order_id, trackingNumber: row.tracking_number, carrierCode: row.carrier_code }]
      : []),
  };
}
