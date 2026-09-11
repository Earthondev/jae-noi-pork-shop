import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_CMS_MUTATION_ERROR_CODES, isRetryableAdminCmsConflict } from "../lib/admin-cms-mutation.ts";

test("only optimistic concurrency conflicts tell the admin to retry", () => {
  assert.equal(isRetryableAdminCmsConflict(409, { code: ADMIN_CMS_MUTATION_ERROR_CODES.conflict }), true);
  assert.equal(isRetryableAdminCmsConflict(409, { code: ADMIN_CMS_MUTATION_ERROR_CODES.duplicate }), false);
  assert.equal(isRetryableAdminCmsConflict(409, { error: "legacy response without a code" }), false);
  assert.equal(isRetryableAdminCmsConflict(400, { code: ADMIN_CMS_MUTATION_ERROR_CODES.conflict }), false);
});
