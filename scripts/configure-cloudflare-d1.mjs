import { readFile, writeFile } from "node:fs/promises";

const configPath = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(configPath, "utf8"));
const databaseName = required("CLOUDFLARE_D1_DATABASE_NAME");
const databaseId = required("CLOUDFLARE_D1_DATABASE_ID");
const workerName = required("CLOUDFLARE_WORKER_NAME");

config.name = workerName;
config.d1_databases = [{
  binding: "DB",
  database_name: databaseName,
  database_id: databaseId,
  migrations_dir: "../../migrations",
}];

await writeFile(configPath, `${JSON.stringify(config)}\n`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
