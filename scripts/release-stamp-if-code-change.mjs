import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const stagedFiles = execSync("git diff --cached --name-only", { cwd: rootDir, encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const codePathPattern =
  /^(src\/|electron\/|scripts\/.*\.(cjs|mjs|js|ts)$|package\.json$|tsconfig.*\.json$|vite\.config\..*$|vitest\.config\..*$|eslint\.config\..*$)/;

const hasCodeChange = stagedFiles.some((file) => codePathPattern.test(file.replace(/\\/g, "/")));

if (!hasCodeChange) {
  console.log("No staged code changes detected; skipping release stamp.");
  process.exit(0);
}

console.log("Staged code changes detected; running release stamp.");
execSync("pnpm release:stamp", { cwd: rootDir, stdio: "inherit" });
