import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Noto_Sans_Thai, Noto_Serif_Thai } from "next/font/google";
import "./globals.css";

const bodyFont = Noto_Sans_Thai({ variable: "--font-body", subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });
const displayFont = Noto_Serif_Thai({ variable: "--font-display", subsets: ["thai", "latin"], weight: ["600", "700", "800"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "เจ๊น้อย เขียงหมูตะคร้อ | สั่งสินค้าออนไลน์";
  const description = "สั่งแหนมหมู ไส้กรอกอีสาน และแคปหมูจากร้านเจ๊น้อย เขียงหมูตะคร้อ";
  return {
    metadataBase,
    title,
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: { title, description, type: "website", locale: "th_TH", images: [{ url: "/og.png", width: 1536, height: 909, alt: "เจ๊น้อย เขียงหมูตะคร้อ อร่อยถึงเครื่อง สั่งง่ายถึงบ้าน" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export const viewport: Viewport = { themeColor: "#b51519", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body></html>;
}
