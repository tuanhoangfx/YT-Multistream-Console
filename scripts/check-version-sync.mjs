import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
}

const packageJson = readJson("package.json");
const manifestJson = readJson("tool.manifest.json");
const releaseMarkdown = readFileSync(path.join(rootDir, "RELEASE.md"), "utf8");

const packageVersion = String(packageJson.version || "").trim();
const manifestVersion = String(manifestJson.release?.version || "").trim();
const firstReleaseVersionMatch = releaseMarkdown.match(/- Version:\s*`([^`]+)`/);
const releaseTopVersion = firstReleaseVersionMatch ? firstReleaseVersionMatch[1].trim() : "";

if (!packageVersion || !manifestVersion || !releaseTopVersion) {
  throw new Error("Cannot validate versions: missing package, manifest, or top release version.");
}

const allMatch = packageVersion === manifestVersion && manifestVersion === releaseTopVersion;
if (!allMatch) {
  console.error("Version mismatch detected:");
  console.error(`- package.json: ${packageVersion}`);
  console.error(`- tool.manifest.json: ${manifestVersion}`);
  console.error(`- RELEASE.md (top): ${releaseTopVersion}`);
  process.exit(1);
}

console.log(`Version sync OK: ${packageVersion}`);
