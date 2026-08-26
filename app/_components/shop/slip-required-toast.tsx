"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

const AUTO_DISMISS_MS = 4500;

/**
 * Rendered via a portal straight to document.body — not as a plain descendant
 * of the cart drawer. This checkout flow has already broken position: fixed
 * once from an ancestor's animation silently becoming its containing block;
 * a portal makes that class of bug impossible here regardless of whatever
 * CSS the drawer accumulates around it later.
 */
export function SlipRequiredToast({ visible, resetKey, onDismiss }: { visible: boolean; resetKey: number; onDismiss: () => void }) {
  // resetKey changes on every missed-submit tap, even ones while the toast is
  // already showing, so a second attempt restarts the auto-dismiss timer
  // instead of landing on one that's about to expire.
  useEffect(() => {
    if (!visible) return;
    const timeout = window.setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [visible, resetKey, onDismiss]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={`slip-required-toast${visible ? " visible" : ""}`} aria-hidden={!visible}>
      <div className="slip-required-toast-card" role="alert" aria-live="assertive" onClick={onDismiss}>
        <span className="slip-required-toast-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5" />
            <circle cx="12" cy="16" r="0.5" fill="currentColor" />
          </svg>
        </span>
        <div>
          <strong>ยังไม่ได้สั่งซื้อ</strong>
          <p>กรุณาแนบรูปสลิปโอนเงินก่อนกดยืนยัน</p>
        </div>
        <button type="button" className="slip-required-toast-close" aria-label="ปิด" onClick={(event) => { event.stopPropagation(); onDismiss(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
