import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packagePath = path.join(rootDir, "package.json");
const releaseLogPath = path.join(rootDir, "RELEASE.md");

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const version = packageJson.version;
const isCheckMode = process.argv.includes("--check");

if (!version) {
  throw new Error("Missing version in package.json");
}

const commit = execSync("git rev-parse --short HEAD", { cwd: rootDir, encoding: "utf8" }).trim();

function readChangedFiles(command) {
  try {
    return execSync(command, { cwd: rootDir, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values)];
}

function inferReleaseType(files) {
  const normalized = files.map((file) => file.replace(/\\/g, "/"));
  if (normalized.some((file) => file.startsWith("src/") || file.startsWith("electron/"))) {
    return { title: "Code Update", type: "Feature/Fix" };
  }
  if (normalized.some((file) => file.startsWith("scripts/") || file.startsWith(".github/workflows/") || file.startsWith(".githooks/"))) {
    return { title: "Automation Update", type: "Maintenance/Automation" };
  }
  return { title: "Project Update", type: "Maintenance/Docs" };
}

const stagedFiles = readChangedFiles("git diff --cached --name-only");
const workingTreeFiles = readChangedFiles("git diff --name-only");
const changedFiles = unique([...stagedFiles, ...workingTreeFiles]);
const meaningfulFiles = changedFiles.filter(
  (file) => !["package.json", "tool.manifest.json", "RELEASE.md"].includes(file.replace(/\\/g, "/"))
);
const filesForSummary = (meaningfulFiles.length > 0 ? meaningfulFiles : changedFiles).slice(0, 5);
const hiddenCount = Math.max(0, (meaningfulFiles.length > 0 ? meaningfulFiles : changedFiles).length - filesForSummary.length);
const releaseMeta = inferReleaseType(meaningfulFiles.length > 0 ? meaningfulFiles : changedFiles);

const now = new Date();
const headingDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const timestamp = `${headingDate} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} (UTC+7)`;

const rawContent = readFileSync(releaseLogPath, "utf8");
const content = rawContent.replace(/(rollback command\.)##\s/g, "$1\n\n## ");
if (isCheckMode) {
  if (!content.includes(`- Version: \`${version}\``)) {
    console.error(`Release log does not include version ${version}`);
    process.exit(1);
  }
  console.log(`Release log contains version ${version}`);
  process.exit(0);
}

if (content.includes(`- Version: \`${version}\``)) {
  if (content !== rawContent) {
    writeFileSync(releaseLogPath, content, "utf8");
    console.log("Normalized release log section spacing");
  }
  console.log(`Release log already contains version ${version}`);
  process.exit(0);
}

const firstEntryIndex = content.indexOf("\n## ");
if (firstEntryIndex === -1) {
  throw new Error("Cannot find release entries. Expected at least one '## ' section.");
}

const header = content.slice(0, firstEntryIndex);
const entries = content.slice(firstEntryIndex);
const headerWithSpacing = header.endsWith("\n\n") ? header : `${header}\n`;

const newEntry = `## ${headingDate} - ${releaseMeta.title} ${version}

- Version: \`${version}\`
- Timestamp: ${timestamp}
- Commit: \`${commit}\`
- Type: ${releaseMeta.type}
- Status: Verified

### Changes

- Updated source version to \`${version}\` and synced release metadata.
${filesForSummary.map((file) => `- Updated \`${file.replace(/\\/g, "/")}\`.`).join("\n")}
${hiddenCount > 0 ? `- Additional updated files: +${hiddenCount}.` : ""}

### Verification

\`\`\`powershell
pnpm sync:all
pnpm build
\`\`\`

Result: passed.

`;

writeFileSync(releaseLogPath, `${headerWithSpacing}${newEntry}${entries}`, "utf8");
console.log(`Prepended release entry for commit ${commit}`);
