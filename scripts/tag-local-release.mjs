import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const packagePath = path.join(rootDir, "package.json");

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const version = packageJson.version;
const tagName = `v${version}`;

if (!version) {
  throw new Error("Missing version in package.json");
}

let exists;
try {
  execSync(`git rev-parse -q --verify refs/tags/${tagName}`, { cwd: rootDir, stdio: "ignore" });
  exists = true;
} catch {
  exists = false;
}

if (exists) {
  console.log(`Tag ${tagName} already exists. Skipping.`);
  process.exit(0);
}

execSync(`git tag -a ${tagName} -m "Release ${tagName}"`, { cwd: rootDir, stdio: "inherit" });
console.log(`Created local release tag ${tagName}`);
