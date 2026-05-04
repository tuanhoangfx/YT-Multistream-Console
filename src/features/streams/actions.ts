import type { StreamJob } from "../../types";
import { now } from "../../utils/time";

export function uniqueLocalPaths(paths: string[]) {
  const seen = new Set<string>();
  return paths
    .map((filePath) => String(filePath || "").trim())
    .filter(Boolean)
    .filter((filePath) => {
      const key = filePath.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getJobLocalPaths(job?: Partial<StreamJob>) {
  if (!job) return [];
  return uniqueLocalPaths([...(Array.isArray(job.localPaths) ? job.localPaths : []), job.localPath || ""]);
}

export function validateStartJob(job: StreamJob, driveUrls: string[]) {
  const hasPrimary = job.primaryRtmpUrl.trim() || (job.rtmpBase.trim() && job.streamKey.trim());
  if (!hasPrimary) return `Missing primary output for ${job.channelName}`;
  if (job.sourceType === "local" && getJobLocalPaths(job).length === 0) return `Missing local file for ${job.channelName}`;
  if (job.sourceType === "drive" && driveUrls.length === 0) return `Missing Google Drive URL for ${job.channelName}`;
  return "";
}

export function buildScheduledUpdate(scheduledAt: string) {
  return {
    status: "scheduled" as const,
    lastMessage: `Scheduled for ${new Date(scheduledAt).toLocaleString()}`,
    updatedAt: now()
  };
}

export function buildCancelledScheduleUpdate() {
  return {
    status: "idle" as const,
    scheduledAt: "",
    lastMessage: "Schedule cancelled",
    updatedAt: now()
  };
}

export function buildStoppedUpdate(message: string) {
  return {
    status: "idle" as const,
    scheduledAt: "",
    lastMessage: message,
    updatedAt: now()
  };
}
