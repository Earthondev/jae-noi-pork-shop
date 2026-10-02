import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// `npm run test` builds first, so this reads the Worker config that ships.
test("serves the Search Console verification file at its exact path", async () => {
  const config = JSON.parse(await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
  // The default html_handling 307-redirects `/google….html` to an
  // extension-less URL; verification by HTML file must answer 200 directly.
  assert.equal(config.assets?.html_handling, "none");
  const verification = await readFile(new URL("../dist/client/google264d1eb100577ac2.html", import.meta.url), "utf8");
  assert.match(verification, /google-site-verification: google264d1eb100577ac2\.html/);
});
