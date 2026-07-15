import { readFile } from "node:fs/promises";

export const DEVELOPMENT_SHEET_ID = "114-ldhzwxBg1wixg0W-DSiTzM_W1GX5WpiSF4L_ysWM";
export const PRODUCTION_SHEET_ID = "10kwcEYyyOA3tIKTpmdwH21KIdpidLaiU04RC6ON6tJE";
export const LOCAL_ENV_PATH = new URL("../.dev.vars", import.meta.url);
export const SERVICE_ACCOUNT_PATH = new URL(
  "file:///Users/earthondev/.config/jae-noi-pork-shop/google-service-account.json",
);

export function parseEnvFile(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      try {
        values[key] = JSON.parse(rawValue);
        continue;
      } catch {
        // Fall through and preserve the literal value for a useful doctor error.
      }
    }
    values[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return values;
}

export async function readEnvFile(path) {
  try {
    return parseEnvFile(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

export function serializeEnvFile(values) {
  return `${Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join("\n")}\n`;
}

export function requireNonEmpty(values, names) {
  const missing = names.filter((name) => !values[name]?.trim());
  if (missing.length > 0) throw new Error(`Missing local configuration: ${missing.join(", ")}`);
}
