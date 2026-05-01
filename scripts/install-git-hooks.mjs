import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const gitDir = path.join(rootDir, ".git");
const hooksSrcDir = path.join(rootDir, ".githooks");
const hooksDestDir = path.join(gitDir, "hooks");

if (!existsSync(gitDir)) {
  console.log("Skipping hook installation: .git directory not found.");
  process.exit(0);
}

if (!existsSync(hooksSrcDir)) {
  console.log("Skipping hook installation: .githooks directory not found.");
  process.exit(0);
}

mkdirSync(hooksDestDir, { recursive: true });

for (const hookName of ["pre-commit", "post-commit", "pre-push"]) {
  const src = path.join(hooksSrcDir, hookName);
  const dest = path.join(hooksDestDir, hookName);
  if (!existsSync(src)) continue;
  copyFileSync(src, dest);
  const content = readFileSync(dest, "utf8");
  writeFileSync(dest, content.replace(/\r\n/g, "\n"), { mode: 0o755 });
  console.log(`Installed git hook: ${hookName}`);
}
