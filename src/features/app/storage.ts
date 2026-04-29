import type { StreamJob } from "../../types";
import { deriveMetadataStatus, getJobDriveUrls, type DriveLibraryItem, type DriveMetadataStatus } from "../drive/drive-utils";
import { now } from "../../utils/time";

const THEME_KEY = "yt-multistream-theme";
const JOBS_KEY = "yt-multistream-jobs";
const DRIVE_LIBRARY_KEY = "yt-multistream-drive-library";

const DEFAULT_DRIVE_LINKS = [
  "https://drive.google.com/file/d/19rBPbzba2CMVrr55vfgecI7OEb4v7GF_/view?usp=drive_link",
  "https://drive.google.com/file/d/1ei4fSYgL0x-Z_PZ6DwDbnMwIOoaRlHDH/view?usp=drive_link"
];

function defaultJobs(): StreamJob[] {
  return [
    {
      id: crypto.randomUUID(),
      channelName: "Channel A",
      sourceType: "local",
      localPath: "",
      driveUrl: "",
      driveUrls: [],
      drivePlayMode: "sequential",
      driveLastIndex: 0,
      rtmpBase: "rtmp://a.rtmp.youtube.com/live2",
      primaryRtmpUrl: "",
      backupRtmpUrl: "rtmp://b.rtmp.youtube.com/live2?backup=1",
      streamKey: "",
      status: "idle",
      scheduledAt: "",
      lastMessage: "Ready",
      updatedAt: now()
    }
  ];
}

export function readTheme() {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function readJobs(): StreamJob[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(JOBS_KEY) || "[]") as StreamJob[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultJobs();
    return parsed.map((item, index) => ({
      id: item.id || crypto.randomUUID(),
      channelName: item.channelName || `Channel ${index + 1}`,
      sourceType: item.sourceType === "drive" ? "drive" : "local",
      localPath: item.localPath || "",
      driveUrl: item.driveUrl || "",
      driveUrls: getJobDriveUrls(item),
      drivePlayMode: item.drivePlayMode === "random" ? "random" : "sequential",
      driveLastIndex: Number.isFinite(item.driveLastIndex) ? item.driveLastIndex : 0,
      rtmpBase: item.rtmpBase || "rtmp://a.rtmp.youtube.com/live2",
      primaryRtmpUrl: item.primaryRtmpUrl || "",
      backupRtmpUrl: item.backupRtmpUrl || "rtmp://b.rtmp.youtube.com/live2?backup=1",
      streamKey: item.streamKey || "",
      status: item.status === "scheduled" || item.status === "running" || item.status === "failed" || item.status === "idle" ? item.status : "idle",
      scheduledAt: item.scheduledAt || "",
      lastMessage: item.lastMessage || "Ready",
      updatedAt: item.updatedAt || now()
    }));
  } catch {
    return defaultJobs();
  }
}

export function readDriveLibrary(): DriveLibraryItem[] {
  const defaultLibrary = () =>
    DEFAULT_DRIVE_LINKS.map((url, index) => ({
      id: `default-drive-${index + 1}`,
      url,
      name: `Drive video ${index + 1}`,
      group: "Default",
      duration: "-",
      resolution: "-",
      size: "-",
      addedAt: new Date().toLocaleDateString("en-GB"),
      metadataStatus: "pending" as DriveMetadataStatus,
      metadataMessage: "Waiting for metadata scan.",
      metadataChecked: false
    }));

  try {
    const parsed = JSON.parse(localStorage.getItem(DRIVE_LIBRARY_KEY) || "[]") as Array<string | Partial<DriveLibraryItem>>;
    if (!Array.isArray(parsed)) return defaultLibrary();
    const items = parsed
      .map((item) => {
        if (typeof item === "string") {
          const url = item.trim();
          if (!url) return null;
          return {
            id: crypto.randomUUID(),
            url,
            name: "Drive video",
            group: "Ungrouped",
            duration: "-",
            resolution: "-",
            size: "-",
            addedAt: new Date().toLocaleDateString("en-GB"),
            metadataStatus: "pending",
            metadataMessage: "Waiting for metadata scan.",
            metadataChecked: false
          };
        }
        const url = String(item.url || "").trim();
        if (!url) return null;
        const normalizedItem = {
          ...item,
          duration: String(item.duration || "-"),
          resolution: String(item.resolution || "-"),
          size: String(item.size || "-")
        };
        return {
          id: String(item.id || crypto.randomUUID()),
          url,
          name: String(item.name || "Drive video"),
          group: String(item.group || "Ungrouped"),
          duration: normalizedItem.duration,
          resolution: normalizedItem.resolution,
          size: normalizedItem.size,
          addedAt: String(item.addedAt || new Date().toLocaleDateString("en-GB")),
          metadataStatus: deriveMetadataStatus(normalizedItem),
          metadataMessage: String(item.metadataMessage || ""),
          metadataChecked: Boolean(item.metadataChecked)
        };
      })
      .filter(Boolean) as DriveLibraryItem[];
    const existingByUrl = new Map(items.map((item) => [item.url, item]));
    const seededItems = defaultLibrary().map((item) => existingByUrl.get(item.url) || item);
    const seededUrls = new Set(seededItems.map((item) => item.url));
    return [...seededItems, ...items.filter((item) => !seededUrls.has(item.url))];
  } catch {
    return defaultLibrary();
  }
}

export function persistTheme(theme: "dark" | "light") {
  localStorage.setItem(THEME_KEY, theme);
}

export function persistJobs(jobs: StreamJob[]) {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

export function persistDriveLibrary(items: DriveLibraryItem[]) {
  localStorage.setItem(DRIVE_LIBRARY_KEY, JSON.stringify(items));
}
