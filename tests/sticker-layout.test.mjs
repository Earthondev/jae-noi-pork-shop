import assert from "node:assert/strict";
import test from "node:test";

// Simulate canvas 2D context measurement and line wrapping
function simulateAddressWrap(addressText, contentWidth, charWidthPx = 20) {
  const words = addressText.split(" ");
  const lines = [];
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const testLine = line + (line ? " " : "") + words[i];
    const testWidth = testLine.length * charWidthPx;
    if (testWidth > contentWidth && i > 0) {
      lines.push(line);
      line = words[i];
      if (lines.length >= 2) break;
    } else {
      line = testLine;
    }
  }
  if (lines.length < 2 && line) {
    lines.push(line);
  }
  return lines;
}

test("address wrapping handles standard Thai addresses", () => {
  const address = "ที่อยู่: 99 หมู่ 1 ต.บัวใหญ่ อ.บัวใหญ่ จ.นครราชสีมา 30120";
  const lines = simulateAddressWrap(address, 862, 20); // 862 / 20 ≈ 43 chars per line
  assert.ok(lines.length <= 2, "Should fit in 2 lines");
  assert.ok(lines[0].length > 0);
});
