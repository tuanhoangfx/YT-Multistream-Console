import type { StreamJob } from "../../types";

export function findDueScheduledJob(jobs: StreamJob[], nowMs = Date.now()) {
  return jobs.find((job) => job.status === "scheduled" && job.scheduledAt && new Date(job.scheduledAt).getTime() <= nowMs);
}
