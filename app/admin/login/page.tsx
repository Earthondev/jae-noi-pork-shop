import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "../../admin-auth";
import { safeAdminReturnPath } from "../../../lib/admin-auth";
import { AdminLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบหลังบ้าน | เจ๊น้อย เขียงหมูตะคร้อ",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeAdminReturnPath((await searchParams).returnTo);
  if (await getAdminUser()) redirect(returnTo);

  return (
    <main className="admin-login-shell">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <div className="admin-login-mark" aria-hidden="true">เจ๊</div>
        <p className="eyebrow">สำหรับผู้ดูแลร้านเท่านั้น</p>
        <h1 id="admin-login-title">เข้าสู่ระบบหลังบ้าน</h1>
        <p className="admin-login-intro">
          ดูออเดอร์ ตรวจสลิป และอัปเดตสถานะจัดส่ง
        </p>
        <AdminLoginForm returnTo={returnTo} />
        <Link className="admin-login-back" href="/">← กลับหน้าร้าน</Link>
      </section>
    </main>
  );
}
