export type SourceType = "local" | "drive";
export type JobStatus = "idle" | "running" | "scheduled" | "failed";

export type StreamJob = {
  id: string;
  channelName: string;
  sourceType: SourceType;
  localPath: string;
  driveUrl: string;
  driveUrls: string[];
  drivePlayMode: "sequential" | "random";
  driveLastIndex: number;
  rtmpBase: string;
  primaryRtmpUrl: string;
  backupRtmpUrl: string;
  streamKey: string;
  status: JobStatus;
  publishMode?: "immediate" | "scheduled";
  scheduledAt?: string;
  lastMessage: string;
  updatedAt: string;
};

export type StreamEvent = {
  jobId: string;
  level: "info" | "success" | "error";
  message: string;
  status?: JobStatus;
};

export type ReleaseLogEntry = {
  version: string;
  timestamp: string;
  title: string;
  items: string[];
};

declare global {
  interface Window {
    streaming: {
      pickLocalVideo: () => Promise<string>;
      startJob: (payload: Record<string, unknown>) => Promise<{ ok: boolean }>;
      stopJob: (payload: Record<string, unknown>) => Promise<{ ok: boolean; stopped: boolean }>;
      stopAllJobs: () => Promise<{ ok: boolean; count: number }>;
      checkFfmpeg: () => Promise<{ ok: boolean; message: string }>;
      readReleaseLog: () => Promise<{ ok: boolean; entries: ReleaseLogEntry[]; message?: string }>;
      scanDriveFolder: (payload: Record<string, unknown>) => Promise<{ ok: boolean; links: string[]; message: string }>;
      probeDriveLink: (payload: Record<string, unknown>) => Promise<{ ok: boolean; name: string; duration: string; resolution: string; size: string; message: string }>;
      onJobEvent: (handler: (event: StreamEvent) => void) => () => void;
    };
  }
}
