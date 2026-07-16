const GOOGLE_MAP_HOSTS = new Set([
  "google.com",
  "maps.google.com",
  "www.google.com",
  "maps.app.goo.gl",
  "google.co.th",
  "maps.google.co.th",
  "www.google.co.th",
]);

export function safePickupMapUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    // Extract URL using regex if there's surrounding text (common when sharing from Google Maps app)
    const urlMatch = raw.match(/https?:\/\/[^\s]+/);
    const targetUrl = urlMatch ? urlMatch[0] : raw;

    const url = new URL(targetUrl);
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
    const isShortLink = hostname === "maps.app.goo.gl";
    const isMapsSubdomain = hostname.startsWith("maps.");
    if (!isShortLink && !isMapsSubdomain && !url.pathname.startsWith("/maps")) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
