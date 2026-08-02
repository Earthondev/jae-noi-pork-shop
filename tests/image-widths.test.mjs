import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import { APP_IMAGE_WIDTHS } from "../lib/image-widths.ts";

async function tsxFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await tsxFiles(path));
    else if (entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}

test("every width the app renders is one the optimizer will serve", async () => {
  // `/_vinext/image` answers 400 for a width outside its allow-list, so a width
  // used in a component but missing here is a broken image in production, not a
  // slower one. The shop logo vanished from every page's header this way.
  const allowed = new Set([...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES, ...APP_IMAGE_WIDTHS]);
  const used = new Set();
  for (const file of await tsxFiles(new URL("../app", import.meta.url).pathname)) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/width=\{(\d+)\}/g)) used.add(Number(match[1]));
  }

  assert.ok(used.size > 0, "ไม่พบ width ในคอมโพเนนต์เลย — regex คงพัง");
  const missing = [...used].filter((width) => !allowed.has(width)).sort((a, b) => a - b);
  assert.deepEqual(missing, [], `ความกว้างเหล่านี้จะได้ 400: ${missing.join(", ")}`);
});

test("the extra widths are additions, not duplicates of the defaults", () => {
  const defaults = new Set([...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES]);
  for (const width of APP_IMAGE_WIDTHS) {
    assert.ok(!defaults.has(width), `${width} มีอยู่ใน default แล้ว ไม่ต้องใส่ซ้ำ`);
    assert.ok(Number.isInteger(width) && width > 0, `${width} ไม่ใช่ความกว้างที่ถูกต้อง`);
  }
  assert.equal(new Set(APP_IMAGE_WIDTHS).size, APP_IMAGE_WIDTHS.length, "มีค่าซ้ำ");
});
