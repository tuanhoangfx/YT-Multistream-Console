const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

const ffmpegPath = ffmpegInstaller.path;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-multistream-smoke-"));
const samplePath = path.join(tempDir, "sample.mp4");
const driveUrl = "https://drive.google.com/uc?export=download&id=1jMQ6HIUvWHVPb_WLQQXQNZ4J2dbW3vze";
const skipDriveCheck = process.env.SKIP_DRIVE_CHECK === "1";

function runStep(name, args) {
  process.stdout.write(`\n[step] ${name}\n`);
  const result = spawnSync(ffmpegPath, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`[fail] ${name}\n${(result.stderr || "").slice(-1200)}`);
  }
  process.stdout.write(`[ok] ${name}\n`);
}

try {
  runStep("ffmpeg binary available", ["-version"]);

  runStep("create local sample video", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=1280x720:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:sample_rate=44100",
    "-t",
    "3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    samplePath
  ]);

  runStep("simulate multi-output primary and backup", [
    "-v",
    "error",
    "-re",
    "-stream_loop",
    "-1",
    "-t",
    "4",
    "-i",
    samplePath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-f",
    "tee",
    "[f=null:onfail=ignore]NUL|[f=null:onfail=ignore]NUL"
  ]);

  if (skipDriveCheck) {
    process.stdout.write("[skip] decode Google Drive source (SKIP_DRIVE_CHECK=1)\n");
  } else {
    runStep("decode Google Drive source", ["-v", "error", "-t", "5", "-i", driveUrl, "-f", "null", "-"]);
  }

  process.stdout.write("\n[done] smoke test passed.\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup.
  }
}
