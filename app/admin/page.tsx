import { requireChatGPTUser } from "../chatgpt-auth";
import { getAdminOrders } from "../../lib/google-sheets";
import { AdminDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  const orders = await getAdminOrders();
  return <AdminDashboard initialOrders={orders} userName={user.displayName} />;
}
