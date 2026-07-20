import assert from "node:assert/strict";
import test from "node:test";
import { computePillWidth, fitFontSize } from "../lib/qr-image.ts";

// Mimics real canvas metrics closely enough to exercise the shrink loop:
// width scales with both text length and the font size currently set.
function createFakeContext() {
  return {
    font: "",
    measureText(text) {
      const size = Number(/(\d+)px/.exec(this.font)?.[1] ?? 16);
      return { width: text.length * size * 0.6 };
    },
  };
}

test("fitFontSize keeps the start size when the text already fits", () => {
  const context = createFakeContext();
  const size = fitFontSize(context, "สั้น", 500, 800, 58, 32);
  assert.equal(size, 58);
  assert.equal(context.font, '800 58px "Noto Sans Thai", sans-serif');
});

test("fitFontSize shrinks in 2px steps until the text fits within maxWidth", () => {
  const context = createFakeContext();
  const text = "ก".repeat(15); // width = 15 * size * 0.6; fits maxWidth 400 once size <= 44
  const size = fitFontSize(context, text, 400, 800, 58, 32);
  assert.ok(size < 58, "should have shrunk from the start size");
  assert.ok(size >= 32, "should not shrink past minSize");
  assert.ok(context.measureText(text).width <= 400, "shrunk text must now fit maxWidth");
});

test("fitFontSize never shrinks below minSize even if the text still overflows", () => {
  const context = createFakeContext();
  const veryLongText = "ก".repeat(200);
  const size = fitFontSize(context, veryLongText, 50, 800, 58, 32);
  assert.equal(size, 32);
});

test("computePillWidth sizes the pill to the measured text plus padding", () => {
  const width = computePillWidth(300, { paddingX: 56, minWidth: 320, maxWidth: 880 });
  assert.equal(width, 300 + 56 * 2);
});

test("computePillWidth never returns a pill narrower than minWidth", () => {
  const width = computePillWidth(10, { paddingX: 56, minWidth: 320, maxWidth: 880 });
  assert.equal(width, 320);
});

test("computePillWidth clamps to maxWidth for unrealistically long text", () => {
  const width = computePillWidth(5000, { paddingX: 56, minWidth: 320, maxWidth: 880 });
  assert.equal(width, 880);
});

test("computePillWidth always fits the measured text within card bounds up to maxWidth", () => {
  // The regression this guards against: a pill narrower than its own text,
  // which let same-color text spill onto the background behind it and
  // become invisible instead of visibly clipping.
  for (const textWidth of [20, 150, 400, 700, 900, 2000]) {
    const width = computePillWidth(textWidth, { paddingX: 56, minWidth: 320, maxWidth: 880 });
    if (textWidth + 112 <= 880) {
      assert.ok(width >= textWidth + 112, `pill (${width}) must fully contain text (${textWidth}) plus padding`);
    } else {
      assert.equal(width, 880, "oversized text falls back to the clamped max, relying on fitFontSize to shrink it first");
    }
  }
});
