"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { PUBLIC_ERROR_MESSAGES } from "../../lib/public-errors";

type Props = Readonly<{
  digest?: string;
  global?: boolean;
  reset?: () => void;
}>;

export function SystemUnavailable({ digest, global = false, reset }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const payload = JSON.stringify({
      kind: global ? "global-error" : "route-error",
      digest: typeof digest === "string" ? digest.slice(0, 100) : undefined,
      path: window.location.pathname.slice(0, 200),
    });
    void fetch("/api/monitor/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [digest, global]);

  return (
    <main className="system-error-page">
      <section className="system-error-card" role="alert" aria-labelledby="system-error-title">
        <div className="system-error-mark" aria-hidden="true">!</div>
        <p className="eyebrow">ร้านยังเปิดให้บริการ</p>
        <h1 id="system-error-title" ref={headingRef} tabIndex={-1}>ขออภัย ระบบสะดุดชั่วคราว</h1>
        <p>{PUBLIC_ERROR_MESSAGES.SYSTEM_UNAVAILABLE} ข้อมูลที่กรอกไว้ในเครื่องจะไม่ถูกลบ</p>
        <div className="system-error-actions">
          {reset ? <button type="button" onClick={reset}>ลองอีกครั้ง</button> : <Link href="/">กลับหน้าร้าน</Link>}
          <a className="secondary" href="tel:0872416773">โทรหาร้าน 087-241-6773</a>
        </div>
      </section>
    </main>
  );
}
