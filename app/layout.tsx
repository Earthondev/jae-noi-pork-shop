import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Noto_Sans_Thai, Noto_Serif_Thai } from "next/font/google";
import "./globals.css";
import { KEYWORDS, SITE_DESCRIPTION, SITE_TITLE, SITE_URL, shopJsonLd } from "../lib/seo";

const bodyFont = Noto_Sans_Thai({ variable: "--font-body", subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });
const displayFont = Noto_Serif_Thai({ variable: "--font-display", subsets: ["thai", "latin"], weight: ["600", "700", "800"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = SITE_TITLE;
  const description = SITE_DESCRIPTION;
  return {
    metadataBase,
    title,
    description,
    keywords: [...KEYWORDS],
    // www and the apex both serve the site, so every page has to name the one
    // URL search engines should keep.
    alternates: { canonical: SITE_URL },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    verification: { google: "bwVFiTr2gLB_rPMFyeR2FdqEHzgFiXaryOnjpSxLAl0" },
    icons: {
      icon: [
        { url: "/favicon-shop-v2.ico", sizes: "48x48", type: "image/x-icon" },
        { url: "/favicon-shop-v2-32.png", sizes: "32x32", type: "image/png" },
      ],
      shortcut: "/favicon-shop-v2.ico",
      apple: [{ url: "/apple-touch-icon-v2.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: { title, description, type: "website", locale: "th_TH", images: [{ url: "/og.png", width: 1536, height: 909, alt: "เจ๊น้อย เขียงหมูตะคร้อ อร่อยถึงเครื่อง สั่งง่ายถึงบ้าน" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export const viewport: Viewport = { themeColor: "#b51519", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://pub-152b30e9e62f4e82aa0893fd90576e96.r2.dev" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://pub-152b30e9e62f4e82aa0893fd90576e96.r2.dev" />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        {children}
        {/* Server-rendered so assistants that do not run JavaScript still get
            the shop's name, address, phone and what it sells. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: shopJsonLd() }} />
      </body>
    </html>
  );
}
