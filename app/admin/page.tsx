import { requireAdminUser } from "../admin-auth";
import { getAdminCmsData, getAdminOrders } from "../../lib/google-sheets";
import { AdminDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdminUser("/admin");
  const [orders, cms] = await Promise.all([getAdminOrders(), getAdminCmsData()]);
  return (
    <AdminDashboard
      initialOrders={orders}
      initialCms={cms}
      userName={user.displayName}
    />
  );
}
