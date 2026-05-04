import type { ReleaseLogEntry, StreamJob } from "./types";

export function startStreamJob(job: StreamJob) {
  return window.streaming.startJob({
    jobId: job.id,
    channelName: job.channelName,
    sourceType: job.sourceType,
    localPath: job.localPath,
    localPaths: job.localPaths,
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

export function readReleaseLog(): Promise<{ ok: boolean; entries: ReleaseLogEntry[]; message?: string }> {
  return window.streaming.readReleaseLog();
}

export function checkForAppUpdates() {
  return window.streaming.checkForUpdates();
}

export function installAppUpdate() {
  return window.streaming.installUpdate();
}

export function pickLocalVideo() {
  return window.streaming.pickLocalVideo();
}

export function scanDriveFolder(folderUrl: string) {
  return window.streaming.scanDriveFolder({ folderUrl });
}

export function probeDriveLink(url: string, probeMode: "quick" | "deep" = "quick") {
  return window.streaming.probeDriveLink({ url, probeMode });
}
