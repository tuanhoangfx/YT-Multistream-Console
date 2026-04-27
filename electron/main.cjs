const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

const jobs = new Map();
let mainWindow = null;

function normalizeDriveUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  const fileId = extractDriveFileId(value);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return value;
}

function extractDriveFileId(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  const fileIdMatch = value.match(/\/file\/d\/([^/?#]+)/i);
  const openIdMatch = value.match(/[?&]id=([^&#]+)/i);
  return fileIdMatch?.[1] || openIdMatch?.[1] || "";
}

function driveFileKey(rawUrl) {
  return extractDriveFileId(rawUrl) || String(rawUrl || "").trim();
}

function uniqueDriveUrls(urls) {
  const seen = new Set();
  return urls
    .map((url) => String(url || "").trim())
    .filter((url) => /^https:\/\/drive\.google\.com\//i.test(url))
    .filter((url) => {
      const key = driveFileKey(url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function extractDriveFolderId(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  const folderMatch = value.match(/\/folders\/([^/?#]+)/i);
  const queryMatch = value.match(/[?&]id=([^&]+)/i);
  return folderMatch?.[1] || queryMatch?.[1] || "";
}

function extractVideoLinksFromDriveHtml(html) {
  const text = String(html || "");
  const ids = new Set();
  const directLinkPattern = /https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{20,})/gi;
  let match = directLinkPattern.exec(text);
  while (match) {
    ids.add(match[1]);
    match = directLinkPattern.exec(text);
  }

  const videoPattern = /video\/[A-Za-z0-9.+-]+/gi;
  match = videoPattern.exec(text);
  while (match) {
    const windowStart = Math.max(0, match.index - 900);
    const windowEnd = Math.min(text.length, match.index + 900);
    const chunk = text.slice(windowStart, windowEnd);
    const idMatches = chunk.match(/[A-Za-z0-9_-]{25,}/g) || [];
    idMatches.forEach((candidate) => {
      if (!/^(?:video|drive|google|folder|application|octet|stream)$/i.test(candidate)) {
        ids.add(candidate);
      }
    });
    match = videoPattern.exec(text);
  }

  return Array.from(ids).map((id) => `https://drive.google.com/file/d/${id}/view?usp=drive_link`);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseHeaderFileName(disposition) {
  const value = String(disposition || "");
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeHeaderFileName(decodeURIComponent(encoded));
  const quoted = value.match(/filename="([^"]+)"/i)?.[1];
  if (quoted) return decodeHeaderFileName(quoted);
  return decodeHeaderFileName(value.match(/filename=([^;]+)/i)?.[1]?.trim() || "");
}

function decodeHeaderFileName(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/[ÃÄÅáºá»ð]/.test(text)) {
    try {
      return Buffer.from(text, "latin1").toString("utf8");
    } catch {
      return text;
    }
  }
  return text;
}

function formatBytes(rawValue) {
  const bytes = Number(rawValue || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function parseCookieHeader(setCookieValue) {
  return String(setCookieValue || "")
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function closeResponseBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Ignore body cancellation support differences.
  }
}

function extractConfirmDownloadUrl(html, fallbackId) {
  const text = String(html || "");
  const patterns = [
    /href="([^"]*\/uc\?[^"]*confirm=[^"]*)"/i,
    /"(https:\/\/drive\.google\.com\/uc\?[^"]*confirm=[^"]*)"/i,
    /"(\/uc\?[^"]*confirm=[^"]*)"/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const href = decodeHtmlEntities(match[1]);
      return href.startsWith("http") ? href : `https://drive.google.com${href}`;
    }
  }
  const confirm = text.match(/confirm=([0-9A-Za-z_-]+)/i)?.[1];
  if (confirm && fallbackId) {
    return `https://drive.google.com/uc?export=download&confirm=${confirm}&id=${fallbackId}`;
  }
  return "";
}

async function resolveDriveDownload(rawUrl) {
  const fileId = extractDriveFileId(rawUrl);
  const initialUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : String(rawUrl || "").trim();
  const headers = {
    "User-Agent": "Mozilla/5.0 YT-Multistream-Console"
  };
  const response = await fetch(initialUrl, { headers, redirect: "follow" });
  if (!response.ok) throw new Error(`Unable to read Drive file (${response.status}).`);

  const disposition = response.headers.get("content-disposition") || "";
  const contentType = response.headers.get("content-type") || "";
  const fileName = parseHeaderFileName(disposition);
  const size = formatBytes(response.headers.get("content-length") || "");
  const cookie = parseCookieHeader(response.headers.get("set-cookie") || "");

  if (disposition || !/text\/html/i.test(contentType)) {
    await closeResponseBody(response);
    return { url: response.url || initialUrl, initialUrl, fileName, size, cookie };
  }

  const html = await response.text();
  const confirmUrl = extractConfirmDownloadUrl(html, fileId);
  if (!confirmUrl) {
    return { url: initialUrl, initialUrl, fileName, size, cookie };
  }

  const confirmed = await fetch(confirmUrl, { headers: cookie ? { ...headers, Cookie: cookie } : headers, redirect: "follow" });
  if (!confirmed.ok) throw new Error(`Unable to confirm Drive download (${confirmed.status}).`);
  const confirmedDisposition = confirmed.headers.get("content-disposition") || "";
  const confirmedName = parseHeaderFileName(confirmedDisposition);
  const confirmedSize = formatBytes(confirmed.headers.get("content-length") || "");
  const confirmedCookie = parseCookieHeader(confirmed.headers.get("set-cookie") || "") || cookie;
  await closeResponseBody(confirmed);
  return {
    url: confirmed.url || confirmUrl,
    initialUrl,
    fileName: confirmedName || fileName,
    size: confirmedSize || size,
    cookie: confirmedCookie
  };
}

async function getDriveFileName(rawUrl) {
  try {
    const response = await fetch(rawUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 YT-Multistream-Console"
      }
    });
    if (!response.ok) return "";
    const disposition = response.headers.get("content-disposition") || "";
    const dispositionName = parseHeaderFileName(disposition);
    if (dispositionName) {
      await closeResponseBody(response);
      return dispositionName;
    }
    const html = await response.text();
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const title = ogTitle || html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
    return decodeHtmlEntities(title.replace(/\s*-\s*Google Drive$/i, "").trim());
  } catch {
    return "";
  }
}

function formatDuration(rawValue) {
  const value = String(rawValue || "");
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (!match) return "";
  return `${match[1]}:${match[2]}:${match[3]}`;
}

async function probeMediaMetadata(rawUrl) {
  let resolved;
  try {
    resolved = await resolveDriveDownload(rawUrl);
  } catch {
    resolved = { url: normalizeDriveUrl(rawUrl), initialUrl: normalizeDriveUrl(rawUrl), fileName: "", size: "", cookie: "" };
  }
  const candidates = Array.from(new Set([resolved.url, resolved.initialUrl, normalizeDriveUrl(rawUrl)].filter(Boolean)));
  let lastProbe = { duration: "", resolution: "", stderrTail: "" };
  for (const input of candidates) {
    const result = await runFfmpegMetadataProbe(input, resolved.cookie);
    lastProbe = result;
    if (result.duration || result.resolution) {
      return {
        name: resolved.fileName || "",
        duration: result.duration,
        resolution: result.resolution,
        size: resolved.size || "",
        debug: result.stderrTail
      };
    }
  }
  return {
    name: resolved.fileName || "",
    duration: "",
    resolution: "",
    size: resolved.size || "",
    debug: lastProbe.stderrTail
  };
}

function runFfmpegMetadataProbe(input, cookie) {
  return new Promise((resolve) => {
    const requestHeaders = [`User-Agent: Mozilla/5.0 YT-Multistream-Console`];
    if (cookie) requestHeaders.push(`Cookie: ${cookie}`);
    const child = spawn(ffmpegBinary, ["-hide_banner", "-rw_timeout", "20000000", "-headers", `${requestHeaders.join("\r\n")}\r\n`, "-i", input], { windowsHide: true });
    let stderr = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const duration = formatDuration(stderr.match(/Duration:\s*([0-9:.]+)/i)?.[1] || "");
      const resolutionMatch = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/is) || stderr.match(/(\d{2,5})x(\d{2,5})/);
      resolve({
        duration,
        resolution: resolutionMatch ? `${resolutionMatch[1]}x${resolutionMatch[2]}` : "",
        stderrTail: stderr.slice(-900)
      });
    };
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore probe timeout race.
      }
      finish();
    }, 30000);
    child.stderr.on("data", (buffer) => {
      stderr += String(buffer || "");
    });
    child.on("error", finish);
    child.on("close", finish);
  });
}

function broadcast(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("stream:job-event", event);
}

function buildRtmpUrl(rtmpBase, streamKey) {
  const base = String(rtmpBase || "").trim().replace(/\/+$/, "");
  const key = String(streamKey || "").trim().replace(/^\/+/, "");
  if (!base || !key) return "";
  return `${base}/${key}`;
}

function rtmpLooksLikeBaseWithoutKey(url) {
  const value = String(url || "").trim();
  return /\/live2\/?(?:\?[^#\s]*)?$/i.test(value);
}

function appendStreamKeyToRtmpUrl(url, streamKey) {
  const value = String(url || "").trim();
  const key = String(streamKey || "").trim();
  if (!value || !key) return value;
  const [head, query] = value.split("?");
  const normalizedHead = head.replace(/\/+$/, "");
  const withKey = `${normalizedHead}/${key}`;
  return query ? `${withKey}?${query}` : withKey;
}

function maskSensitive(value) {
  const text = String(value || "");
  return text
    .replace(/(rtmp:\/\/[^\s"'|]+\/live2\/)([A-Za-z0-9_-]+)/gi, "$1****")
    .replace(/([?&]key=)([^&\s]+)/gi, "$1****");
}

function escapeConcatPath(value) {
  return String(value || "").replace(/'/g, "'\\''");
}

async function createDrivePlaylistInput(urls, playMode) {
  const orderedUrls = playMode === "random" ? shuffleItems(urls) : urls;
  const normalizedUrls = orderedUrls.map((url) => normalizeDriveUrl(url));
  const listBody = ["ffconcat version 1.0", ...normalizedUrls.map((url) => `file '${escapeConcatPath(url)}'`)].join(os.EOL);
  const listPath = path.join(os.tmpdir(), `yt-multistream-drive-${Date.now()}-${Math.random().toString(36).slice(2)}.ffconcat`);
  await fs.writeFile(listPath, listBody, "utf8");
  return {
    input: {
      kind: "concat",
      path: listPath
    },
    cleanupPaths: [listPath],
    count: normalizedUrls.length
  };
}

function cleanupJobArtifacts(record) {
  const paths = Array.isArray(record?.cleanupPaths) ? record.cleanupPaths : [];
  paths.forEach((filePath) => {
    fs.unlink(filePath).catch(() => {
      // Ignore temporary playlist cleanup races.
    });
  });
}

function buildOutputTargets(payload) {
  const streamKey = String(payload.streamKey || "").trim();
  const base = String(payload.rtmpBase || "").trim();
  let primaryRtmpUrl = String(payload.primaryRtmpUrl || "").trim();
  let backupRtmpUrl = String(payload.backupRtmpUrl || "").trim();
  const primaryFromBase = buildRtmpUrl(base, streamKey);
  if (rtmpLooksLikeBaseWithoutKey(primaryRtmpUrl) && streamKey) {
    primaryRtmpUrl = appendStreamKeyToRtmpUrl(primaryRtmpUrl, streamKey);
  }
  if (rtmpLooksLikeBaseWithoutKey(backupRtmpUrl) && streamKey) {
    backupRtmpUrl = appendStreamKeyToRtmpUrl(backupRtmpUrl, streamKey);
  }
  const primary = primaryRtmpUrl || primaryFromBase;
  if (!primary) {
    throw new Error("Missing primary RTMP URL. Provide full URL or base + stream key.");
  }
  if (rtmpLooksLikeBaseWithoutKey(primary)) {
    throw new Error("Primary RTMP URL is missing stream key.");
  }
  if (backupRtmpUrl && rtmpLooksLikeBaseWithoutKey(backupRtmpUrl)) {
    throw new Error("Backup RTMP URL is missing stream key.");
  }
  return backupRtmpUrl ? [primary, backupRtmpUrl] : [primary];
}

function stopJobInternal(jobId, reason = "Stopped by operator") {
  const record = jobs.get(jobId);
  if (!record) return false;
  try {
    record.process.kill("SIGTERM");
  } catch {
    // Ignore process kill race.
  }
  jobs.delete(jobId);
  cleanupJobArtifacts(record);
  broadcast({ jobId, level: "info", message: reason, status: "idle" });
  return true;
}

function createFfmpegArgs(input, outputs) {
  const args = [
    "-re",
    "-stream_loop",
    "-1"
  ];
  if (typeof input === "object" && input?.kind === "concat") {
    args.push(
      "-f",
      "concat",
      "-safe",
      "0",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto",
      "-i",
      input.path
    );
  } else {
    args.push(
      "-i",
      input
    );
  }
  args.push(
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
    "44100"
  );
  if (outputs.length === 1) {
    args.push("-f", "flv", outputs[0]);
    return args;
  }

  const teeValue = outputs.map((url) => `[f=flv:onfail=ignore]${url}`).join("|");
  args.push("-map", "0:v:0", "-map", "0:a?", "-f", "tee", teeValue);
  return args;
}

function resolveFfmpegBinary() {
  const fallback = "ffmpeg";
  if (!ffmpegInstaller?.path) return fallback;
  if (ffmpegInstaller.path.includes("app.asar")) {
    return ffmpegInstaller.path.replace("app.asar", "app.asar.unpacked");
  }
  return ffmpegInstaller.path;
}

const ffmpegBinary = resolveFfmpegBinary();

function bindStreamingApi() {
  ipcMain.handle("stream:pick-local-video", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Video", extensions: ["mp4", "mkv", "mov", "webm", "avi"] }]
    });
    if (result.canceled || result.filePaths.length === 0) return "";
    return result.filePaths[0];
  });

  ipcMain.handle("stream:check-ffmpeg", async () => {
    return new Promise((resolve) => {
      const child = spawn(ffmpegBinary, ["-version"], { windowsHide: true });
      let settled = false;
      child.once("error", () => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, message: "ffmpeg not available. Install dependency or configure binary path." });
      });
      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        resolve({ ok: true, message: `ffmpeg ready (${path.basename(ffmpegBinary)})` });
        child.kill("SIGTERM");
      });
    });
  });

  ipcMain.handle("stream:start", async (_event, payload = {}) => {
    const jobId = String(payload.jobId || "");
    const channelName = String(payload.channelName || "Unknown channel");
    const sourceType = payload.sourceType === "drive" ? "drive" : "local";
    const localPath = String(payload.localPath || "").trim();
    const driveUrl = String(payload.driveUrl || "").trim();
    const driveUrls = uniqueDriveUrls([...(Array.isArray(payload.driveUrls) ? payload.driveUrls : []), driveUrl]);
    const drivePlayMode = payload.drivePlayMode === "random" ? "random" : "sequential";
    const outputs = buildOutputTargets(payload);

    if (!jobId) throw new Error("Missing job id.");
    if (sourceType === "local" && !localPath) throw new Error("Missing local video path.");
    if (sourceType === "drive" && driveUrls.length === 0) throw new Error("Missing Google Drive URL.");

    if (jobs.has(jobId)) {
      stopJobInternal(jobId, "Restarting stream with new config");
    }

    const playlist = sourceType === "drive" && driveUrls.length > 1 ? await createDrivePlaylistInput(driveUrls, drivePlayMode) : null;
    const input = playlist?.input || (sourceType === "drive" ? normalizeDriveUrl(driveUrls[0]) : localPath);
    const args = createFfmpegArgs(input, outputs);
    const child = spawn(ffmpegBinary, args, { windowsHide: true });

    child.on("error", (error) => {
      const record = jobs.get(jobId);
      jobs.delete(jobId);
      cleanupJobArtifacts(record || playlist);
      broadcast({ jobId, level: "error", message: `ffmpeg failed to start: ${maskSensitive(error.message)}`, status: "failed" });
    });

    child.stderr.on("data", (buffer) => {
      const line = String(buffer || "").trim();
      if (!line) return;
      broadcast({ jobId, level: "info", message: maskSensitive(line).slice(0, 420), status: "running" });
    });

    child.on("close", (code) => {
      const record = jobs.get(jobId);
      const wasManaged = Boolean(record);
      jobs.delete(jobId);
      cleanupJobArtifacts(record);
      if (wasManaged) {
        const level = code === 0 ? "success" : "error";
        const status = code === 0 ? "idle" : "failed";
        broadcast({ jobId, level, message: `Stream stopped (code ${code ?? "unknown"}).`, status });
      }
    });

    jobs.set(jobId, { process: child, startedAt: Date.now(), channelName, cleanupPaths: playlist?.cleanupPaths || [] });
      const outputLabel = outputs.length > 1 ? `${outputs.length} outputs` : "primary output";
      const inputLabel = sourceType === "drive" && driveUrls.length > 1 ? `${driveUrls.length} Drive videos, ${drivePlayMode === "random" ? "random" : "sequential"} mode` : "single source";
      broadcast({ jobId, level: "success", message: `Streaming started for ${channelName} (${outputLabel}, ${inputLabel})`, status: "running" });
    return { ok: true };
  });

  ipcMain.handle("stream:stop", async (_event, payload = {}) => {
    const jobId = String(payload.jobId || "");
    if (!jobId) throw new Error("Missing job id.");
    const stopped = stopJobInternal(jobId);
    return { ok: true, stopped };
  });

  ipcMain.handle("stream:stop-all", async () => {
    const ids = Array.from(jobs.keys());
    ids.forEach((jobId) => stopJobInternal(jobId, "Stopped all streams"));
    return { ok: true, count: ids.length };
  });

  ipcMain.handle("drive:scan-folder", async (_event, payload = {}) => {
    const folderUrl = String(payload.folderUrl || "").trim();
    const folderId = extractDriveFolderId(folderUrl);
    if (!folderId) throw new Error("Invalid Google Drive folder URL.");
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 YT-Multistream-Console"
      }
    });
    if (!response.ok) throw new Error(`Unable to read Drive folder (${response.status}).`);
    const html = await response.text();
    const links = extractVideoLinksFromDriveHtml(html);
    return { ok: true, links, message: links.length ? `Found ${links.length} video link(s).` : "No public video links found in this folder." };
  });

  ipcMain.handle("drive:probe-link", async (_event, payload = {}) => {
    const url = String(payload.url || "").trim();
    if (!url) throw new Error("Missing Drive URL.");
    const [name, media] = await Promise.all([getDriveFileName(url), probeMediaMetadata(url)]);
    const duration = media.duration || "-";
    const resolution = media.resolution || "-";
    const size = media.size || "-";
    const hasMetadata = duration !== "-" || resolution !== "-";
    const hasPartialMetadata = hasMetadata || size !== "-" || Boolean(media.name);
    return {
      ok: true,
      name: media.name || name || "Drive video",
      duration,
      resolution,
      size,
      message: hasMetadata
        ? "Metadata generated."
        : hasPartialMetadata
          ? `Partial metadata only. ffmpeg output: ${(media.debug || "").replace(/\s+/g, " ").slice(0, 220) || "no media stream details"}`
          : `Could not read media metadata. ffmpeg output: ${(media.debug || "").replace(/\s+/g, " ").slice(0, 220) || "empty"}`
    };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    title: "YT Multistream Console",
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  bindStreamingApi();
  createWindow();
});

app.on("window-all-closed", () => {
  Array.from(jobs.keys()).forEach((jobId) => stopJobInternal(jobId, "App closed"));
  if (process.platform !== "darwin") app.quit();
});
