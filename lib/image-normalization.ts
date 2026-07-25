export type ImageTransformBinding = {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
};

export type NormalizedImage = Readonly<{
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/webp";
  extension: "jpg" | "webp";
}>;

type ImageNormalizationOptions = Readonly<{
  purpose: "payment-slip" | "product";
  maxOutputBytes: number;
}>;

export class ImageNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageNormalizationError";
  }
}

function imageStream(source: Uint8Array): ReadableStream<Uint8Array> {
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return new Blob([copy.buffer]).stream();
}

export async function normalizeUploadedImage(
  source: Uint8Array,
  images: ImageTransformBinding | undefined,
  options: ImageNormalizationOptions,
): Promise<NormalizedImage> {
  if (!images) throw new ImageNormalizationError("ระบบตรวจสอบรูปภาพยังไม่พร้อมใช้งาน");

  const isSlip = options.purpose === "payment-slip";
  const contentType = isSlip ? "image/jpeg" as const : "image/webp" as const;
  const extension = isSlip ? "jpg" as const : "webp" as const;
  const quality = isSlip ? 95 : 88;
  const maxDimension = isSlip ? 4096 : 2400;

  try {
    const transformed = await images
      .input(imageStream(source))
      .transform({ fit: "scale-down", width: maxDimension, height: maxDimension })
      .output({ format: contentType, quality });
    const response = transformed.response();
    if (!response.ok) throw new ImageNormalizationError("ไฟล์รูปภาพไม่สามารถถอดรหัสได้");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > options.maxOutputBytes) {
      throw new ImageNormalizationError("รูปหลังตรวจสอบมีขนาดใหญ่เกินกำหนด");
    }
    return { bytes, contentType, extension };
  } catch (error) {
    if (error instanceof ImageNormalizationError) throw error;
    throw new ImageNormalizationError("ไฟล์รูปภาพเสียหายหรือมีรูปแบบที่ไม่รองรับ");
  }
}
