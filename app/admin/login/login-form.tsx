"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminLoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(result?.error ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch {
      setMessage("เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={submit}>
      <label>
        <span>ชื่อผู้ใช้</span>
        <input
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect="off"
          disabled={submitting}
          maxLength={64}
          name="username"
          onChange={(event) => setUsername(event.target.value)}
          required
          spellCheck={false}
          type="text"
          value={username}
        />
      </label>
      <label>
        <span>รหัสผ่าน</span>
        <span className="admin-password-field">
          <input
            autoComplete="current-password"
            disabled={submitting}
            maxLength={256}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            aria-pressed={showPassword}
            disabled={submitting}
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? "ซ่อน" : "แสดง"}
          </button>
        </span>
      </label>
      <p className="admin-login-message" aria-live="polite" role="status">
        {message}
      </p>
      <button className="admin-login-submit" disabled={submitting} type="submit">
        {submitting ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
      </button>
      <small>ระบบจะออกจากระบบอัตโนมัติภายใน 8 ชั่วโมง</small>
    </form>
  );
}
