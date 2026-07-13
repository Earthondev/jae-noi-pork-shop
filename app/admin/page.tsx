import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureOrderSchema, getBindings, type AdminOrder } from "../../db/orders";
import { AdminDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  const { DB } = getBindings();
  await ensureOrderSchema(DB);
  const result = await DB.prepare(`SELECT orders.*, COALESCE(GROUP_CONCAT(order_items.name || ' × ' || order_items.quantity, ', '), '') AS items
    FROM orders LEFT JOIN order_items ON order_items.order_id = orders.id
    GROUP BY orders.id ORDER BY orders.created_at DESC LIMIT 200`).all<AdminOrder>();
  return <AdminDashboard initialOrders={result.results} userName={user.displayName} />;
}
