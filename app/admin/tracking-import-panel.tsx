"use client";

import { useMemo, useRef, useState } from "react";
import type { CarrierCode } from "../../lib/carriers";
import type {
  TrackingImportCommitResult,
  TrackingImportPreview,
  TrackingImportPreviewRow,
} from "../../lib/tracking-import";
import { CustomerFacingError, PUBLIC_ERROR_MESSAGES, safeClientApiMessage } from "../../lib/public-errors";
import { AdminIcon } from "./icons";

type ImportedTrackingUpdate = TrackingImportCommitResult["imported"][number];

export function TrackingImportPanel({ onImported }: { onImported: (updates: ImportedTrackingUpdate[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [carrierCode, setCarrierCode] = useState<CarrierCode>("flash");
  const [preview, setPreview] = useState<TrackingImportPreview | null>(null);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const summaryRef = useRef<HTMLHeadingElement>(null);

  const selectedCount = Object.values(selections).filter(Boolean).length;
  const counts = useMemo(() => preview ? preview.rows.reduce((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {} as Partial<Record<TrackingImportPreviewRow["status"], number>>) : {}, [preview]);

  function chooseFile(next: File | null) {
    setFile(next);
    setPreview(null);
    setSelections({});
    setError("");
    setMessage("");
    setConfirming(false);
  }

  async function submit(action: "preview" | "commit") {
    if (!file) { setError("กรุณาเลือกไฟล์จากบริษัทขนส่ง"); return; }
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("action", action);
      form.set("carrierCode", carrierCode);
      form.set("file", file);
      if (action === "commit") {
        form.set("selections", JSON.stringify(Object.entries(selections).flatMap(([sourceRow, orderId]) => orderId ? [{ sourceRow: Number(sourceRow), orderId }] : [])));
      }
      const response = await fetch("/api/admin/tracking-imports", { method: "POST", body: form });
      // Reloading hands the request back to Cloudflare Access, which
      // re-authenticates and returns here; there is no login page of our own.
      if (response.status === 401) { window.location.reload(); return; }
      const result = await response.json().catch(() => null) as (TrackingImportPreview & TrackingImportCommitResult & { error?: string }) | null;
      if (!response.ok || !result) throw new CustomerFacingError(safeClientApiMessage(response.status, result, "ADMIN_UNAVAILABLE"));
      if (action === "preview") {
        setPreview(result);
        setSelections(Object.fromEntries(result.rows.flatMap((row) => row.status === "matched" && row.suggestedOrderId ? [[row.sourceRow, row.suggestedOrderId]] : [])));
        setMessage(result.alreadyCommitted ? "ไฟล์นี้เคยนำเข้าแล้ว ระบบจะไม่บันทึกซ้ำ" : "ตรวจไฟล์แล้ว กรุณาทบทวนรายการก่อนยืนยัน");
        window.setTimeout(() => summaryRef.current?.focus(), 0);
      } else {
        onImported(result.imported);
        setMessage(result.duplicate ? "ไฟล์นี้เคยนำเข้าแล้ว ไม่มีการบันทึกซ้ำ" : `นำเข้าเลขพัสดุสำเร็จ ${result.imported.length} รายการ`);
        setConfirming(false);
        setPreview(null);
        setSelections({});
      }
    } catch (submitError) {
      setError(submitError instanceof CustomerFacingError ? submitError.message : PUBLIC_ERROR_MESSAGES.ADMIN_UNAVAILABLE);
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="tracking-import-panel" aria-labelledby="tracking-import-title">
      <div className="tracking-import-heading">
        <div><p className="eyebrow">อัปเดตหลายออเดอร์พร้อมกัน</p><h3 id="tracking-import-title">นำเข้าเลขพัสดุ</h3><p>เลือกไฟล์ Pickup List ระบบจะจับคู่และให้ตรวจสอบก่อนบันทึกจริง</p></div>
        <span className="tracking-import-carrier">Flash Express</span>
      </div>
      <div className="tracking-import-controls">
        <label><span>บริษัทขนส่ง</span><select value={carrierCode} disabled={busy !== null} onChange={(event) => { setCarrierCode(event.target.value as CarrierCode); chooseFile(file); }}><option value="flash">Flash Express</option></select></label>
        <label className={`tracking-file-drop${file ? " has-file" : ""}`}>
          <input type="file" accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" disabled={busy !== null} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          <AdminIcon name={file ? "check" : "download"} />
          <span><strong>{file ? file.name : "เลือกไฟล์ .xls, .xlsx หรือ .csv"}</strong><small>{file ? `${(file.size / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} KB` : "ขนาดไม่เกิน 2 MB · ไฟล์จะไม่ถูกเก็บไว้"}</small></span>
        </label>
        <button className="tracking-preview-button" type="button" disabled={!file || busy !== null} onClick={() => void submit("preview")}>{busy === "preview" ? "กำลังตรวจไฟล์…" : "ตรวจไฟล์และพรีวิว"}</button>
      </div>

      <div className="tracking-import-feedback" aria-live="polite">{message && <p className="success"><AdminIcon name="check" />{message}</p>}{error && <p className="error" role="alert">{error}</p>}</div>

      {preview && (
        <div className="tracking-preview-results">
          <div className="tracking-preview-summary">
            <h4 ref={summaryRef} tabIndex={-1}>ผลตรวจ {preview.rows.length} พัสดุ</h4>
            <div><span className="matched">พร้อมนำเข้า {counts.matched ?? 0}</span><span className="ambiguous">ต้องเลือก {counts.ambiguous ?? 0}</span><span className="unmatched">ยังจับคู่ไม่ได้ {(counts.unmatched ?? 0) + (counts.ineligible ?? 0) + (counts.conflict ?? 0)}</span>{preview.ignoredRows > 0 && <span>ข้าม {preview.ignoredRows} แถว</span>}</div>
          </div>
          <div className="tracking-preview-list">
            {preview.rows.map((row) => (
              <article className={`tracking-preview-row status-${row.status}`} key={`${row.sourceRow}-${row.trackingNumber}`}>
                <div className="tracking-preview-source"><span>แถว {row.sourceRow}</span><strong>{row.trackingNumber}</strong><small>{row.consignee || "ไม่ระบุชื่อผู้รับ"}</small></div>
                <div className="tracking-preview-match"><span className="tracking-match-state">{statusLabel(row.status)}</span><p>{row.reason}</p>{row.candidates.length > 0 && (
                  <label><span>ออเดอร์ที่จะอัปเดต</span><select value={selections[row.sourceRow] ?? ""} disabled={busy !== null || !["matched", "ambiguous"].includes(row.status)} onChange={(event) => setSelections((current) => ({ ...current, [row.sourceRow]: event.target.value }))}><option value="">ไม่นำเข้ารายการนี้</option>{row.candidates.filter((candidate) => !candidate.currentTrackingNumber).map((candidate) => <option value={candidate.orderId} key={candidate.orderId}>{candidate.orderId} · {candidate.customerName} · {candidate.maskedPhone}</option>)}</select></label>
                )}</div>
              </article>
            ))}
          </div>
          {confirming ? (
            <div className="tracking-import-confirm" role="group" aria-label="ยืนยันการนำเข้า"><p>ยืนยันบันทึกเลขพัสดุและเปลี่ยน {selectedCount} ออเดอร์เป็น “จัดส่งแล้ว”?</p><button type="button" disabled={busy !== null} onClick={() => setConfirming(false)}>กลับไปตรวจ</button><button className="primary" type="button" disabled={busy !== null || selectedCount === 0} onClick={() => void submit("commit")}>{busy === "commit" ? "กำลังบันทึก…" : "ยืนยันนำเข้า"}</button></div>
          ) : <button className="tracking-commit-button" type="button" disabled={selectedCount === 0 || busy !== null || preview.alreadyCommitted} onClick={() => setConfirming(true)}>นำเข้า {selectedCount} รายการ</button>}
        </div>
      )}
    </section>
  );
}

function statusLabel(status: TrackingImportPreviewRow["status"]): string {
  return ({
    matched: "พร้อมนำเข้า",
    ambiguous: "ต้องเลือกออเดอร์",
    unmatched: "ไม่พบออเดอร์",
    ineligible: "ยังนำเข้าไม่ได้",
    already_imported: "มีเลขนี้แล้ว",
    conflict: "เลขพัสดุขัดแย้ง",
  } as const)[status];
}
