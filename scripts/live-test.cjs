const { spawnSync } = require("node:child_process");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

const streamKey = process.argv[2];
if (!streamKey) {
  console.error("Missing stream key argument.");
  process.exit(1);
}

const sourceUrl = "https://drive.google.com/uc?export=download&id=1jMQ6HIUvWHVPb_WLQQXQNZ4J2dbW3vze";
const primary = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
const backup = `rtmp://b.rtmp.youtube.com/live2/${streamKey}?backup=1`;
const outputs = `[f=flv:onfail=ignore]${primary}|[f=flv:onfail=ignore]${backup}`;

const args = [
  "-re",
  "-stream_loop",
  "-1",
  "-t",
  "25",
  "-i",
  sourceUrl,
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-maxrate",
  "4500k",
  "-bufsize",
  "9000k",
  "-pix_fmt",
  "yuv420p",
  "-g",
  "60",
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-ar",
  "44100",
  "-map",
  "0:v:0",
  "-map",
  "0:a?",
  "-f",
  "tee",
  outputs
];

const result = spawnSync(ffmpegPath, args, { encoding: "utf8" });
const stderr = result.stderr || "";

console.log(`exit ${result.status}`);
console.log(stderr.slice(-2500));
