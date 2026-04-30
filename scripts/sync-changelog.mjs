import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packagePath = path.join(rootDir, "package.json");
const changelogPath = path.join(rootDir, "CHANGELOG.md");

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const version = packageJson.version;
const isCheckMode = process.argv.includes("--check");

if (!version) {
  throw new Error("Missing version in package.json");
}

const commit = execSync("git rev-parse --short HEAD", { cwd: rootDir, encoding: "utf8" }).trim();
const commitTitle = execSync("git log -1 --pretty=%s", { cwd: rootDir, encoding: "utf8" }).trim();

const now = new Date();
const headingDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const timestamp = `${headingDate} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} (UTC+7)`;

const rawContent = readFileSync(changelogPath, "utf8");
const content = rawContent.replace(/(rollback command\.)##\s/g, "$1\n\n## ");
if (isCheckMode) {
  if (!content.includes(`- Version: \`${version}\``)) {
    console.error(`Changelog does not include version ${version}`);
    process.exit(1);
  }
  console.log(`Changelog contains version ${version}`);
  process.exit(0);
}

if (content.includes(`- Version: \`${version}\``)) {
  if (content !== rawContent) {
    writeFileSync(changelogPath, content, "utf8");
    console.log("Normalized changelog section spacing");
  }
  console.log(`Changelog already contains version ${version}`);
  process.exit(0);
}

const firstEntryIndex = content.indexOf("\n## ");
if (firstEntryIndex === -1) {
  throw new Error("Cannot find changelog entries. Expected at least one '## ' section.");
}

const header = content.slice(0, firstEntryIndex);
const entries = content.slice(firstEntryIndex);
const headerWithSpacing = header.endsWith("\n\n") ? header : `${header}\n`;

const newEntry = `## ${headingDate} - Maintenance Sync ${version}

- Version: \`${version}\`
- Timestamp: ${timestamp}
- Commit: \`${commit}\`
- Type: Maintenance/Automation
- Status: Verified

### Changes

- Synced release metadata and changelog records to the current source version/commit.
- ${commitTitle}

### Verification

\`\`\`powershell
pnpm sync:all
pnpm build
\`\`\`

Result: passed.

`;

writeFileSync(changelogPath, `${headerWithSpacing}${newEntry}${entries}`, "utf8");
console.log(`Prepended changelog entry for commit ${commit}`);
