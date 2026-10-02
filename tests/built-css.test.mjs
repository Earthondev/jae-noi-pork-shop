import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// `npm run test` builds first, so this checks the CSS that actually ships.
// When the source declared `backdrop-filter` followed by a hand-written
// `-webkit-backdrop-filter`, the minifier kept only the prefixed copy, which
// Chrome/Android ignore — every frosted bar rendered see-through in production.
// The build adds the prefix itself, so the source must declare only the
// standard property.
const GLASS_SELECTORS = [".site-header", ".bottom-nav", ".floating-cart", ".cart-feedback", ".drawer-backdrop", ".tribute-backdrop"];

async function builtCss() {
  const dir = new URL("../dist/client/assets/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".css"));
  return (await Promise.all(files.map((name) => readFile(new URL(name, dir), "utf8")))).join("\n");
}

test("ships the unprefixed backdrop-filter for every frosted storefront surface", async () => {
  const css = await builtCss();
  for (const selector of GLASS_SELECTORS) {
    const escaped = selector.replace(".", "\\.");
    const rules = css.match(new RegExp(`(?:^|[},])${escaped}\\{[^}]*\\}`, "g")) ?? [];
    assert.ok(
      rules.some((rule) => /[{;]backdrop-filter:blur\(/.test(rule)),
      `${selector} lost its unprefixed backdrop-filter in the build`,
    );
  }
});

test("the cart backdrop fades its dim, not the opacity its sheet inherits", async () => {
  const source = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const keyframes = source.match(/@keyframes backdrop-fade\s*\{[^@]*?\}\s*\}/)?.[0];
  assert.ok(keyframes, "backdrop-fade keyframes are missing");
  assert.doesNotMatch(keyframes, /opacity/);
});

test("source CSS leaves vendor-prefixing backdrop-filter to the build", async () => {
  const source = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /-webkit-backdrop-filter/);
});
