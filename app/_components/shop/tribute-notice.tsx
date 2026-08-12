"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "jae-noi-tribute-notice-dismissed";

export function TributeNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!sessionStorage.getItem(DISMISSED_KEY)) {
        setOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function close() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="tribute-backdrop" role="dialog" aria-modal="true" aria-label="ประกาศ">
      <div className="tribute-panel">
        <button type="button" className="tribute-close" aria-label="ปิด" onClick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <Image
          src="/images/notices/royal-tribute.webp"
          alt="น้อมสำนึกในพระมหากรุณาธิคุณอันหาที่สุดมิได้ สมเด็จพระนางเจ้าสิริกิติ์ พระบรมราชินีนาถ พระบรมราชชนนีพันปีหลวง ข้าพระพุทธเจ้า ร้านเจ๊น้อย เขียงหมูตะคร้อ"
          width={1000}
          height={1000}
          priority
        />
      </div>
    </div>
  );
}
