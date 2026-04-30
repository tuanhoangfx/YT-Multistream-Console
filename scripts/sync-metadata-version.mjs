import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packagePath = path.join(rootDir, "package.json");
const manifestPath = path.join(rootDir, "tool.manifest.json");
const statusPath = path.join(rootDir, "TOOL_STATUS.md");

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const version = packageJson.version;
const syncedAt = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");

if (!version) {
  throw new Error("Missing version in package.json");
}

const manifestJson = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!manifestJson.release) manifestJson.release = {};
manifestJson.release.version = version;
writeFileSync(manifestPath, `${JSON.stringify(manifestJson, null, 2)}\n`, "utf8");

const statusContent = readFileSync(statusPath, "utf8");
const nextStatusContent = statusContent
  .replace(/^- SyncedAt:\s.*$/m, `- SyncedAt: ${syncedAt}`)
  .replace(/^- Version:\s.*$/m, `- Version: ${version}`);
writeFileSync(statusPath, nextStatusContent, "utf8");

console.log(`Synced metadata version to ${version}`);
