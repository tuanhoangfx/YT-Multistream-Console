import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const packagePath = path.join(rootDir, "package.json");

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const version = String(packageJson.version || "");
const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) {
  throw new Error(`Unsupported version format: "${version}". Expected x.y.z`);
}

const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]) + 1;
const nextVersion = `${major}.${minor}.${patch}`;

packageJson.version = nextVersion;
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
console.log(`Bumped version ${version} -> ${nextVersion}`);
