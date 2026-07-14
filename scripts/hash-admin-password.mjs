import { createAdminPasswordHash } from "../lib/admin-auth.ts";

const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("Set ADMIN_PASSWORD only for this command. The plain password is never written to a file.");
  process.exitCode = 1;
} else {
  process.stdout.write(await createAdminPasswordHash(password));
}
