import { requireAdminUser } from "../admin-auth";
import { getAdminOrders } from "../../db/order-repository";
import { getAdminCmsData } from "../../db/cms-repository";
import { AdminDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

type AdminTab = "orders" | "rounds" | "products" | "storefront";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const requestedTab = (await searchParams).tab;
  const initialTab = adminTab(typeof requestedTab === "string" ? requestedTab : undefined);
  const user = await requireAdminUser(`/admin?tab=${initialTab}`);
  const [orders, cms] = await Promise.all([getAdminOrders(), getAdminCmsData()]);
  const serverNow = new Date();
  return (
    <AdminDashboard
      initialOrders={orders}
      initialCms={cms}
      userName={user.displayName}
      serverNow={serverNow.toISOString()}
      serverClockLabel={formatBangkokHeader(serverNow)}
      initialTab={initialTab}
    />
  );
}

function adminTab(value: string | undefined): AdminTab {
  return value === "rounds" || value === "products" || value === "storefront" ? value : "orders";
}

function formatBangkokHeader(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
