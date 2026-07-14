import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getAdminUser } from "../../../admin-auth";
import { isSameOriginMutation } from "../../../../lib/admin-auth";
import { normalizeProductId } from "../../../../lib/admin-cms";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ProductMediaBindings = {
  PRODUCT_MEDIA?: R2Bucket;
  PRODUCT_MEDIA_ORIGIN?: string;
};

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return response({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, 401);
  if (!isSameOriginMutation(request)) return response({ error: "คำขอไม่ถูกต้อง" }, 403);

  const bindings = env as unknown as ProductMediaBindings;
  if (!bindings.PRODUCT_MEDIA) return response({ error: "ยังไม่ได้เปิดพื้นที่เก็บรูปสินค้า" }, 503);
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  const id = normalizeProductId(String(form?.get("productId") ?? "PRODUCT")) || "PRODUCT";
  if (!(file instanceof File)) return response({ error: "กรุณาเลือกรูปสินค้า" }, 400);
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return response({ error: "รูปสินค้าต้องมีขนาดไม่เกิน 5 MB" }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const imageType = detectImageType(bytes);
  if (!imageType) return response({ error: "รองรับเฉพาะรูป JPG, PNG หรือ WebP ที่ถูกต้อง" }, 400);

  const key = `products/${id.toLowerCase()}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${imageType.extension}`;
  await bindings.PRODUCT_MEDIA.put(key, bytes, {
    httpMetadata: { contentType: imageType.contentType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { uploadedBy: user.username, uploadedAt: new Date().toISOString() },
  });
  const origin = (bindings.PRODUCT_MEDIA_ORIGIN || "https://pub-152b30e9e62f4e82aa0893fd90576e96.r2.dev").replace(/\/+$/, "");
  return response({ imageUrl: `${origin}/${key}`, previewUrl: `/media/${key}` });
}

function detectImageType(bytes: Uint8Array): { extension: "jpg" | "png" | "webp"; contentType: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) {
    return { extension: "png", contentType: "image/png" };
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}
