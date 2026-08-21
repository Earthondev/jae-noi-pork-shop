/**
 * Multi-page PDF Generator for Shipping Stickers (77mm x 30mm)
 * Pure TypeScript, zero external dependencies.
 * Produces compliant PDF-1.4 binary blobs from Canvas elements.
 */

export interface StickerImageSource {
  width: number;
  height: number;
  jpegData: Uint8Array;
}

/**
 * Converts a data URL (image/jpeg or image/png) to Uint8Array
 */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a PDF-1.4 file with each sticker as a 77mm x 30mm page.
 */
export function createStickersPdf(images: StickerImageSource[]): Uint8Array {
  if (images.length === 0) {
    return new Uint8Array(0);
  }

  // 77mm x 30mm in PostScript points (72 points/inch, 25.4 mm/inch)
  // 77 * 72 / 25.4 = 218.2677... pt
  // 30 * 72 / 25.4 = 85.0393... pt
  const pageWidth = 218.27;
  const pageHeight = 85.04;

  const objects: Uint8Array[] = [];
  const offsets: number[] = [];

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  let currentOffset = headerBytes.length;

  function registerObject(objNum: number, content: string | Uint8Array) {
    offsets[objNum - 1] = currentOffset;
    const startBytes = encoder.encode(`${objNum} 0 obj\n`);
    const endBytes = encoder.encode(`\nendobj\n`);

    let bodyBytes: Uint8Array;
    if (typeof content === "string") {
      bodyBytes = encoder.encode(content);
    } else {
      bodyBytes = content;
    }

    const chunk = new Uint8Array(startBytes.length + bodyBytes.length + endBytes.length);
    chunk.set(startBytes, 0);
    chunk.set(bodyBytes, startBytes.length);
    chunk.set(endBytes, startBytes.length + bodyBytes.length);

    objects.push(chunk);
    currentOffset += chunk.length;
  }

  const totalPages = images.length;
  const catalogObjId = 1;
  const pagesObjId = 2;
  const pageObjIds: number[] = [];

  // For each page i:
  // Page object: 3 + i * 3
  // Content stream: 3 + i * 3 + 1
  // Image XObject: 3 + i * 3 + 2
  for (let i = 0; i < totalPages; i++) {
    pageObjIds.push(3 + i * 3);
  }

  // 1. Catalog
  registerObject(catalogObjId, `<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);

  // 2. Pages Root
  const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(" ");
  registerObject(pagesObjId, `<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages} >>`);

  for (let i = 0; i < totalPages; i++) {
    const pageObjId = 3 + i * 3;
    const contentObjId = pageObjId + 1;
    const imageObjId = pageObjId + 2;
    const img = images[i];

    // Page object
    registerObject(
      pageObjId,
      `<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjId} 0 R /Resources << /XObject << /Im1 ${imageObjId} 0 R >> /ProcSet [/PDF /ImageC] >> >>`
    );

    // Content stream (scales the image to fit the 77x30mm page exactly)
    const streamContent = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im1 Do Q`;
    const streamBytes = encoder.encode(streamContent);
    registerObject(
      contentObjId,
      `<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream`
    );

    // Image XObject (JPEG stream embedded via /DCTDecode filter)
    const imgHeader = `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpegData.length} >>\nstream\n`;
    const imgFooter = `\nendstream`;
    const imgHeaderBytes = encoder.encode(imgHeader);
    const imgFooterBytes = encoder.encode(imgFooter);

    const fullImgBody = new Uint8Array(imgHeaderBytes.length + img.jpegData.length + imgFooterBytes.length);
    fullImgBody.set(imgHeaderBytes, 0);
    fullImgBody.set(img.jpegData, imgHeaderBytes.length);
    fullImgBody.set(imgFooterBytes, imgHeaderBytes.length + img.jpegData.length);

    registerObject(imageObjId, fullImgBody);
  }

  // Cross-reference table (xref)
  const xrefOffset = currentOffset;
  const numObjects = objects.length + 1; // +1 for entry 0
  let xrefStr = `xref\n0 ${numObjects}\n0000000000 65535 f \n`;
  for (let i = 0; i < objects.length; i++) {
    const off = offsets[i] ?? 0;
    xrefStr += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  xrefStr += `trailer\n<< /Size ${numObjects} /Root ${catalogObjId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const xrefBytes = encoder.encode(xrefStr);

  // Concatenate full PDF
  let totalLength = headerBytes.length + xrefBytes.length;
  for (const obj of objects) {
    totalLength += obj.length;
  }

  const finalPdf = new Uint8Array(totalLength);
  let pos = 0;
  finalPdf.set(headerBytes, pos);
  pos += headerBytes.length;

  for (const obj of objects) {
    finalPdf.set(obj, pos);
    pos += obj.length;
  }
  finalPdf.set(xrefBytes, pos);

  return finalPdf;
}

/**
 * Cleans round identifier for safe filesystem / download filenames
 */
export function cleanRoundForFilename(roundId: string | null | undefined): string {
  if (!roundId || roundId === "ไม่ระบุรอบ") return "";
  return roundId.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Builds a descriptive PDF filename indicating the delivery round and order count
 */
export function buildStickerPdfFilename(
  orders: Array<{ id: string; round_id?: string | null }>,
  customFilename?: string
): string {
  if (customFilename) return customFilename;
  if (orders.length === 0) return "shipping-labels.pdf";
  if (orders.length === 1) {
    const order = orders[0];
    const roundPart = cleanRoundForFilename(order.round_id);
    return `shipping-label-${roundPart ? `${roundPart}-` : ""}${order.id}.pdf`;
  }
  const rounds = Array.from(
    new Set(orders.map((o) => cleanRoundForFilename(o.round_id)).filter(Boolean))
  );
  if (rounds.length === 1) {
    return `shipping-labels-${rounds[0]}-${orders.length}-orders.pdf`;
  }
  return `shipping-labels-${orders.length}-orders.pdf`;
}

/**
 * Helper to download an array of canvases as a single PDF file
 */
export function downloadCanvasesAsPdf(canvases: HTMLCanvasElement[], filename: string): void {
  const images: StickerImageSource[] = canvases.map((canvas) => {
    // High-quality JPEG for compact size & crisp text rendering
    const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
    return {
      width: canvas.width,
      height: canvas.height,
      jpegData: dataUrlToUint8Array(dataUrl),
    };
  });

  const pdfBytes = createStickersPdf(images);
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  const file = new File([blob], filename, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    void navigator.share({
      files: [file],
      title: filename,
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      fallbackDownloadPdf(blob, filename);
    });
    return;
  }

  fallbackDownloadPdf(blob, filename);
}

function fallbackDownloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

