import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getAdminUser } from "../../../admin-auth";
import { isSameOriginMutation } from "../../../../lib/admin-auth";
import { normalizeProductId } from "../../../../lib/admin-cms";
import { publicErrorBody } from "../../../../lib/public-errors";
import { reportServerError } from "../../../../lib/server-monitoring";
import { detectSupportedImageType } from "../../../../lib/order-request-validation";

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
  const assetType = form?.get("assetType") === "brand" ? "brand" : "product";
  const assetSlot = form?.get("assetSlot") === "logo" ? "logo" : "cover";
  if (!(file instanceof File)) return response({ error: "กรุณาเลือกรูป" }, 400);
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return response({ error: "รูปต้องมีขนาดไม่เกิน 5 MB" }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const imageType = detectSupportedImageType(bytes);
  if (!imageType) return response({ error: "รองรับเฉพาะรูป JPG, PNG หรือ WebP ที่ถูกต้อง" }, 400);

  try {
    const key = assetType === "brand"
      ? `brand/${assetSlot}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${imageType.extension}`
      : `products/${id.toLowerCase()}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${imageType.extension}`;
    await bindings.PRODUCT_MEDIA.put(key, bytes, {
      httpMetadata: { contentType: imageType.contentType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { uploadedBy: user.username, uploadedAt: new Date().toISOString() },
    });
    const origin = (bindings.PRODUCT_MEDIA_ORIGIN || "https://pub-152b30e9e62f4e82aa0893fd90576e96.r2.dev").replace(/\/+$/, "");
    return response({ imageUrl: `${origin}/${key}`, previewUrl: `/media/${key}` });
  } catch (error) {
    reportServerError({ event: "admin_product_image_failed", operation: "admin.product_image.upload", error, path: "/api/admin/product-image", method: "POST" });
    return response(publicErrorBody("ADMIN_UNAVAILABLE"), 502);
  }
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}
