import type { StreamJob } from "../../types";
import { now } from "../../utils/time";

export function validateStartJob(job: StreamJob, driveUrls: string[]) {
  const hasPrimary = job.primaryRtmpUrl.trim() || (job.rtmpBase.trim() && job.streamKey.trim());
  if (!hasPrimary) return `Missing primary output for ${job.channelName}`;
  if (job.sourceType === "local" && !job.localPath.trim()) return `Missing local file for ${job.channelName}`;
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
