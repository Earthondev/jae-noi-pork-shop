import { Shop } from "./shop";
import { getPublicStorefront } from "../db/public-storefront";

// The catalogue is edited from the admin panel and rounds open and close on
// their own schedule, so the homepage is rendered per request rather than built
// once. `/api/storefront` still carries the 30s edge cache the client polls.
export const dynamic = "force-dynamic";

export default async function Home() {
  // A database hiccup must not take the storefront down: `null` falls back to
  // exactly the old behaviour, where the browser fetches /api/storefront itself.
  const storefront = await getPublicStorefront().catch(() => null);

  return <Shop initialStorefront={storefront} />;
}
