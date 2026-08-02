import assert from "node:assert/strict";
import test from "node:test";
import { customDomainPatterns } from "../vite.config.ts";

test("an apex domain is published together with its www form", () => {
  // Without www in this list, `wrangler deploy` detaches it — which is exactly
  // how www.jaenoishop.com disappeared after being added in the dashboard.
  assert.deepEqual(customDomainPatterns("jaenoishop.com"), ["jaenoishop.com", "www.jaenoishop.com"]);
  assert.deepEqual(customDomainPatterns("example.co"), ["example.co", "www.example.co"]);
});

test("a www hostname still publishes its apex", () => {
  assert.deepEqual(customDomainPatterns("www.jaenoishop.com"), ["www.jaenoishop.com", "jaenoishop.com"]);
});

test("a real subdomain is published on its own", () => {
  // "www.shop.example.com" is not a hostname anyone intends to serve.
  assert.deepEqual(customDomainPatterns("shop.example.com"), ["shop.example.com"]);
  assert.deepEqual(customDomainPatterns("staging.jaenoishop.com"), ["staging.jaenoishop.com"]);
});

test("stray whitespace, case and a trailing dot do not create a broken route", () => {
  assert.deepEqual(customDomainPatterns("  JaeNoiShop.COM  "), ["jaenoishop.com", "www.jaenoishop.com"]);
  assert.deepEqual(customDomainPatterns("jaenoishop.com."), ["jaenoishop.com", "www.jaenoishop.com"]);
  assert.deepEqual(customDomainPatterns("   "), []);
  assert.deepEqual(customDomainPatterns(""), []);
});
