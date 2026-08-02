import assert from "node:assert/strict";
import test from "node:test";
import { categoryNamesFromProducts, orderCategoryNames, parseCategoryOrder, serializeCategoryOrder } from "../lib/category-order.ts";

test("keeps a saved category order and appends new categories", () => {
  const categories = categoryNamesFromProducts([
    { category: "แหนม" },
    { category: "หมูสด" },
    { category: "แคปหมู" },
    { category: "แหนม" },
  ]);

  assert.deepEqual(
    orderCategoryNames(categories, parseCategoryOrder('["แคปหมู","แหนม"]')),
    ["แคปหมู", "แหนม", "หมูสด"],
  );
});

test("ignores malformed, duplicate, and retired category names", () => {
  assert.deepEqual(parseCategoryOrder("not-json"), []);
  assert.deepEqual(
    orderCategoryNames(["หมูสด", "แหนม"], ["แหนม", "แหนม", "ลบแล้ว"]),
    ["แหนม", "หมูสด"],
  );
  assert.equal(serializeCategoryOrder(["หมูสด", "แหนม"]), '["หมูสด","แหนม"]');
});
