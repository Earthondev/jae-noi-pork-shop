import assert from "node:assert/strict";
import test from "node:test";
import {
  createStickersPdf,
  buildStickerPdfFilename,
  cleanRoundForFilename,
  STICKER_PX_PER_MM,
} from "../lib/sticker-pdf.ts";

test("creates a valid multi-page PDF for shipping stickers", () => {
  // Mock JPEG byte stream (minimal dummy JPEG payload)
  const dummyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

  // 384px = 48mm printable width @ 203dpi (PeriPage A6-class thermal
  // printers). Height is not fixed since these tear off a continuous roll
  // at a perforation rather than a die-cut label, so each sticker's page
  // size is derived from its own canvas rather than a hardcoded constant.
  const width = 384;
  const height = 300;
  const images = [
    { width, height, jpegData: dummyJpeg },
    { width, height, jpegData: dummyJpeg },
  ];

  const pdfBytes = createStickersPdf(images);
  const pdfString = new TextDecoder().decode(pdfBytes);

  const ptPerPx = (72 / 25.4) / STICKER_PX_PER_MM;
  const expectedWidthPt = width * ptPerPx;
  const expectedHeightPt = height * ptPerPx;

  assert.ok(pdfBytes.length > 0, "PDF bytes should not be empty");
  assert.ok(pdfString.startsWith("%PDF-1.4"), "Must start with %PDF-1.4 header");
  assert.ok(pdfString.includes("/Type /Catalog"), "Must have Catalog object");
  assert.ok(pdfString.includes("/Count 2"), "Must have 2 pages");
  assert.ok(
    pdfString.includes(`/MediaBox [0 0 ${expectedWidthPt} ${expectedHeightPt}]`),
    "Must set page size derived from the image's own pixel dimensions (48mm printable width)"
  );
  assert.ok(pdfString.includes("xref"), "Must contain xref table");
  assert.ok(pdfString.includes("%%EOF"), "Must end with %%EOF");
});

test("handles empty image list gracefully", () => {
  const pdfBytes = createStickersPdf([]);
  assert.equal(pdfBytes.length, 0);
});

test("builds descriptive sticker filenames with round identification", () => {

  assert.equal(cleanRoundForFilename("RD-20260716"), "RD-20260716");
  assert.equal(cleanRoundForFilename("ไม่ระบุรอบ"), "");
  assert.equal(cleanRoundForFilename(null), "");

  // Single order with round
  assert.equal(
    buildStickerPdfFilename([{ id: "JN-20260716-1234567890", round_id: "RD-20260716" }]),
    "shipping-label-RD-20260716-JN-20260716-1234567890.pdf"
  );

  // Single order without round
  assert.equal(
    buildStickerPdfFilename([{ id: "JN-20260716-1234567890", round_id: null }]),
    "shipping-label-JN-20260716-1234567890.pdf"
  );

  // Multiple orders in the same round
  assert.equal(
    buildStickerPdfFilename([
      { id: "JN-1", round_id: "RD-20260716" },
      { id: "JN-2", round_id: "RD-20260716" },
      { id: "JN-3", round_id: "RD-20260716" },
    ]),
    "shipping-labels-RD-20260716-3-orders.pdf"
  );

  // Multiple orders across mixed rounds
  assert.equal(
    buildStickerPdfFilename([
      { id: "JN-1", round_id: "RD-20260716" },
      { id: "JN-2", round_id: "RD-20260720" },
    ]),
    "shipping-labels-2-orders.pdf"
  );

  // Custom filename override
  assert.equal(
    buildStickerPdfFilename([{ id: "JN-1" }], "custom.pdf"),
    "custom.pdf"
  );
});

