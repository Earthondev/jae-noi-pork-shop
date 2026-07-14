const GOOGLE_MAP_HOSTS = new Set([
  "google.com",
  "maps.google.com",
  "www.google.com",
  "maps.app.goo.gl",
]);

export function safePickupMapUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !GOOGLE_MAP_HOSTS.has(url.hostname.toLowerCase())
    ) {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    if (hostname !== "maps.app.goo.gl" && !url.pathname.startsWith("/maps")) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
