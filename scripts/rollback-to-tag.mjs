import { execSync } from "node:child_process";

const targetTag = (process.argv[2] || process.env.ROLLBACK_TAG || "").trim();
const isHardRollback = process.argv.includes("--hard") || process.env.ROLLBACK_HARD === "1";

if (!targetTag) {
  console.error("Missing tag. Usage: pnpm rollback:restore -- v0.1.2 [--hard]");
  process.exit(1);
}

function run(command) {
  return execSync(command, { encoding: "utf8", stdio: "pipe" }).trim();
}

try {
  run(`git rev-parse --verify ${targetTag}^{tag}`);
} catch {
  console.error(`Tag not found: ${targetTag}`);
  process.exit(1);
}

const currentBranch = run("git rev-parse --abbrev-ref HEAD");
const backupBranch = `backup/pre-rollback-${Date.now()}`;

run(`git branch ${backupBranch}`);

if (isHardRollback) {
  execSync(`git reset --hard ${targetTag}`, { stdio: "inherit" });
  console.log(`Hard rollback complete to ${targetTag}. Backup branch: ${backupBranch}`);
} else {
  execSync(`git checkout ${targetTag}`, { stdio: "inherit" });
  console.log(`Checked out ${targetTag} (detached HEAD). Backup branch: ${backupBranch}`);
  console.log(`Return to previous branch with: git checkout ${currentBranch}`);
}
