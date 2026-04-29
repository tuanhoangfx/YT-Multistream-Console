import type { ChangelogEntry, StreamJob } from "./types";

export function startStreamJob(job: StreamJob) {
  return window.streaming.startJob({
    jobId: job.id,
    channelName: job.channelName,
    sourceType: job.sourceType,
    localPath: job.localPath,
    driveUrl: job.driveUrl,
    driveUrls: job.driveUrls,
    drivePlayMode: job.drivePlayMode,
    driveLastIndex: job.driveLastIndex,
    rtmpBase: job.rtmpBase,
    primaryRtmpUrl: job.primaryRtmpUrl,
    backupRtmpUrl: job.backupRtmpUrl,
    streamKey: job.streamKey
  });
}

export function stopStreamJob(jobId: string) {
  return window.streaming.stopJob({ jobId });
}

export function stopAllStreams() {
  return window.streaming.stopAllJobs();
}

export function checkFfmpegStatus() {
  return window.streaming.checkFfmpeg();
}

export function readChangelog(): Promise<{ ok: boolean; entries: ChangelogEntry[]; message?: string }> {
  return window.streaming.readChangelog();
}

export function pickLocalVideo() {
  return window.streaming.pickLocalVideo();
}

export function scanDriveFolder(folderUrl: string) {
  return window.streaming.scanDriveFolder({ folderUrl });
}

export function probeDriveLink(url: string) {
  return window.streaming.probeDriveLink({ url });
}
