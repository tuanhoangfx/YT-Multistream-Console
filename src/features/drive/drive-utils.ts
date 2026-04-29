import type { StreamJob } from "../../types";

export type DriveMetadataStatus = "pending" | "scanning" | "ready" | "partial" | "error";

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
};

export function parseDriveLinks(value: string) {
  return Array.from(new Set(value.split(/[\n,;\s]+/).map((item) => item.trim()).filter((item) => /^https:\/\/drive\.google\.com\//i.test(item))));
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
    .filter((url) => /^https:\/\/drive\.google\.com\//i.test(url))
    .filter((url) => {
      const key = driveFileKey(url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  const hasName = Boolean(item.name && item.name !== "Drive video" && !/^Drive video \d+$/i.test(item.name));
  const hasDuration = hasDriveValue(item.duration || "");
  const hasResolution = hasDriveValue(item.resolution || "");
  const hasSize = hasDriveValue(item.size || "");
  const explicitStatus = item.metadataStatus;
  if (explicitStatus === "scanning" && (hasName || hasDuration || hasResolution || hasSize)) {
    return hasDuration && hasResolution ? "ready" : "partial";
  }
  if (explicitStatus === "pending" || explicitStatus === "scanning") return "pending";
  if ((explicitStatus === "ready" || explicitStatus === "partial") && (hasName || hasDuration || hasResolution || hasSize)) return explicitStatus;
  if (explicitStatus === "error" && (hasName || hasDuration || hasResolution || hasSize)) return "partial";
  if (explicitStatus === "error") return "pending";
  if (hasDuration && hasResolution) return "ready";
  if (hasName || hasDuration || hasResolution || hasSize) return "partial";
  return item.metadataChecked ? "error" : "pending";
}
