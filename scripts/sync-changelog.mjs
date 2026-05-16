import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releasePath = path.join(rootDir, "RELEASE.md");
const changelogPath = path.join(rootDir, "CHANGELOG.md");
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;

const release = readFileSync(releasePath, "utf8");
const sectionMatch = release.match(
  /## [^\n]+\n\n- Version: `([^`]+)`[\s\S]*?(?=\n## |\n# |\s*$)/,
);

if (!sectionMatch) {
  throw new Error("Could not find latest RELEASE.md section with Version metadata.");
}

const latestSection = sectionMatch[0].trim();
const body = `# Changelog\n\n${latestSection}\n`;
writeFileSync(changelogPath, body, "utf8");
console.log(`Synced CHANGELOG.md from RELEASE.md for v${version}.`);
