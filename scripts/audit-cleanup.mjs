import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const checks = [];

function addCheck(ok, message) {
  checks.push({ ok, message });
}

addCheck(!existsSync(path.join(rootDir, "baocao.md")), "baocao.md should not exist");

let failed = 0;
for (const check of checks) {
  if (check.ok) {
    console.log(`PASS: ${check.message}`);
  } else {
    console.error(`FAIL: ${check.message}`);
    failed += 1;
  }
}

if (failed > 0) {
  process.exit(1);
}
