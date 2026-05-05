import type { StreamJob } from "../../types";

export type DriveMetadataStatus = "pending" | "scanning" | "ready" | "partial" | "error";
export type DriveMetadataProbeMode = "quick" | "deep";

export type DriveLibraryItem = {
  id: string;
  url: string;
  name: string;
  group: string;
  duration: string;
  resolution: string;
  size: string;
  addedAt: string;
  metadataStatus: DriveMetadataStatus;
  metadataMessage?: string;
  metadataChecked?: boolean;
  metadataProbeMode?: DriveMetadataProbeMode;
};

/** File-style Drive URLs only (/file/d/… or open/uc-style ?id=). Excludes folder views and non-Drive origins. */
export function isValidDriveLibraryFileUrl(raw: string) {
  const url = String(raw || "").trim();
  if (!/^https:\/\/drive\.google\.com\//i.test(url)) return false;
  if (/\/folders\//i.test(url) || /\/embeddedfolderview/i.test(url)) return false;
  if (/\/file\/d\/[a-zA-Z0-9_-]+/.test(url)) return true;
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return Boolean(idMatch?.[1]);
}

export function parseDriveLinks(value: string) {
  const pieces = value.split(/[\n,;\s]+/).map((item) => item.trim());
  const valid = pieces.filter(isValidDriveLibraryFileUrl);
  return Array.from(new Set(valid));
}

export function driveFileKey(value: string) {
  const url = String(value || "").trim();
  const fileId = url.match(/\/file\/d\/([^/?#]+)/i)?.[1] || url.match(/[?&]id=([^&#]+)/i)?.[1] || "";
  return fileId || url;
}

export function uniqueDriveUrls(urls: string[]) {
  const seen = new Set<string>();
  return urls
    .map((url) => String(url || "").trim())
    .filter(isValidDriveLibraryFileUrl)
    .filter((url) => {
      const key = driveFileKey(url);
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Drops invalid URLs, then keeps first occurrence per `driveFileKey` (newest-first lists stay stable). */
export function cleanupDriveLibrary(items: DriveLibraryItem[]): DriveLibraryItem[] {
  const seen = new Set<string>();
  const next: DriveLibraryItem[] = [];
  for (const item of items) {
    const u = String(item.url || "").trim();
    if (!isValidDriveLibraryFileUrl(u)) continue;
    const key = driveFileKey(u);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(u === item.url ? item : { ...item, url: u });
  }
  return next;
}

export function getJobDriveUrls(job?: Partial<StreamJob>) {
  if (!job) return [];
  return uniqueDriveUrls([...(Array.isArray(job.driveUrls) ? job.driveUrls : []), job.driveUrl || ""]);
}

export function hasDriveValue(value: string) {
  const normalized = String(value || "").trim();
  return normalized !== "" && normalized !== "-" && normalized.toLowerCase() !== "auto";
}

export function deriveMetadataStatus(item: Partial<DriveLibraryItem>): DriveMetadataStatus {
  const hasDuration = hasDriveValue(item.duration || "");
  const hasResolution = hasDriveValue(item.resolution || "");
  const explicitStatus = item.metadataStatus;
  if (explicitStatus === "scanning" && (hasDuration || hasResolution)) {
    return hasDuration && hasResolution ? "ready" : "partial";
  }
  if (explicitStatus === "pending" || explicitStatus === "scanning") return "pending";
  if (explicitStatus === "ready" && hasDuration && hasResolution) return "ready";
  if ((explicitStatus === "ready" || explicitStatus === "partial") && (hasDuration || hasResolution)) {
    return hasDuration && hasResolution ? "ready" : "partial";
  }
  if (explicitStatus === "error") return "error";
  if (hasDuration && hasResolution) return "ready";
  if (hasDuration || hasResolution) return "partial";
  return item.metadataChecked ? "error" : "pending";
}
