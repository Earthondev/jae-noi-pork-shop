"use client";

import { useEffect, useRef } from "react";
import { AdminIcon } from "./icons";

type ConfirmDialogProps = Readonly<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function ConfirmDialog({ open, title, description, confirmLabel, tone = "primary", busy = false, onCancel, onConfirm }: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [busy, onCancel, open]);

  if (!open) return null;
  return <div className="admin-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div ref={panelRef} className="admin-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-dialog-title" aria-describedby="admin-dialog-description">
      <button className="admin-dialog-close" type="button" onClick={onCancel} disabled={busy} aria-label="ปิด"><AdminIcon name="close" /></button>
      <span className={`admin-dialog-mark ${tone}`} aria-hidden="true"><AdminIcon name={tone === "danger" ? "hide" : "check"} /></span>
      <h2 id="admin-dialog-title">{title}</h2>
      <p id="admin-dialog-description">{description}</p>
      <div className="admin-dialog-actions">
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy}>กลับไปตรวจสอบ</button>
        <button className={tone === "danger" ? "danger" : "primary"} type="button" onClick={onConfirm} disabled={busy}>{busy ? "กำลังบันทึก…" : confirmLabel}</button>
      </div>
    </div>
  </div>;
}
