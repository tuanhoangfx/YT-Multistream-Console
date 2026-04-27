import {
  BookOpen,
  CalendarClock,
  Check,
  Clock3,
  CircleCheckBig,
  CheckCircle2,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Circle,
  Cloud,
  History,
  CircleAlert,
  Info,
  Copy,
  Files,
  FolderOpen,
  HardDrive,
  MessageCircle,
  Play,
  Settings,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Tv,
  Upload,
  X,
  XCircle,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { checkFfmpegStatus, pickLocalVideo, probeDriveLink, scanDriveFolder, startStreamJob, stopAllStreams, stopStreamJob } from "./api";
import type { StreamEvent, StreamJob } from "./types";

type Theme = "dark" | "light";
type View = "streams" | "library";
type DriveMetadataStatus = "pending" | "scanning" | "ready" | "partial" | "error";
type DriveLibraryItem = {
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
type DropdownOption = {
  value: string;
  label: string;
  tone?: "neutral" | "local" | "drive" | "idle" | "running" | "scheduled" | "failed";
};

const THEME_KEY = "yt-multistream-theme";
const JOBS_KEY = "yt-multistream-jobs";
const DRIVE_LIBRARY_KEY = "yt-multistream-drive-library";
const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_DRIVE_LINKS = [
  "https://drive.google.com/file/d/19rBPbzba2CMVrr55vfgecI7OEb4v7GF_/view?usp=drive_link",
  "https://drive.google.com/file/d/1ei4fSYgL0x-Z_PZ6DwDbnMwIOoaRlHDH/view?usp=drive_link"
];
const TOOL_GUIDE_SECTIONS = [
  {
    icon: Tv,
    title: "Channel Queue",
    items: [
      "Manage multiple YouTube channels in one queue with status, source, and message tracking.",
      "Start or stop each channel directly from the table, or run bulk Start all and Stop all actions.",
      "Use search and filters to focus on idle, running, scheduled, or failed channels quickly."
    ]
  },
  {
    icon: Play,
    title: "Stream Runtime",
    items: [
      "Each stream is started from Electron main process using ffmpeg with realtime log forwarding.",
      "Primary and backup RTMP outputs are supported in a single ffmpeg run through tee muxer mode.",
      "Runtime Console captures ffmpeg events to verify stream health and troubleshoot failures."
    ]
  },
  {
    icon: HardDrive,
    title: "Source Configuration",
    items: [
      "Configure stream source from local video file or public Google Drive link per channel.",
      "Use Drive Library to store, scan, and reuse Drive video links with auto metadata probing.",
      "Schedule future start times for selected channels and monitor state changes in queue."
    ]
  }
] as const;
const VERSION_LOG_ENTRIES = [
  {
    icon: RefreshCw,
    version: "2026-04-26",
    title: "Stability pass for direct streaming test",
    items: [
      "Bundled ffmpeg runtime so streams run without PATH-based ffmpeg setup.",
      "Added primary plus backup RTMP output support using single-process tee muxer.",
      "Added stream-key validation and masking in runtime logs for safer diagnostics.",
      "Improved migration for older channel configurations and added smoke test command."
    ]
  },
  {
    icon: CheckCircle2,
    version: "2026-04-26",
    title: "Initial multistream console baseline",
    items: [
      "Shipped Electron plus React desktop baseline for YT multistream operations.",
      "Added multi-channel queue with per-channel source and RTMP configuration.",
      "Implemented realtime log bridge and start/stop controls for selected or all channels."
    ]
  },
  {
    icon: BookOpen,
    version: "2026-04-28",
    title: "Guide and changelog design standardization",
    items: [
      "Aligned topbar Guide, Changelog, and Refresh controls with shared design standards.",
      "Standardized modal structure, icon treatment, and section card layout to match GPM pattern.",
      "Updated help content for YT-specific queue, runtime, and Drive source workflows."
    ]
  }
] as const;

function now() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function uniqueDriveUrls(urls: string[]) {
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

function getJobDriveUrls(job?: Partial<StreamJob>) {
  if (!job) return [];
  return uniqueDriveUrls([...(Array.isArray(job.driveUrls) ? job.driveUrls : []), job.driveUrl || ""]);
}

function driveFileKey(value: string) {
  const url = String(value || "").trim();
  const fileId = url.match(/\/file\/d\/([^/?#]+)/i)?.[1] || url.match(/[?&]id=([^&#]+)/i)?.[1] || "";
  return fileId || url;
}

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

function readTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

function readJobs(): StreamJob[] {
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

function hasDriveValue(value: string) {
  const normalized = String(value || "").trim();
  return normalized !== "" && normalized !== "-" && normalized.toLowerCase() !== "auto";
}

function deriveMetadataStatus(item: Partial<DriveLibraryItem>): DriveMetadataStatus {
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

function readDriveLibrary(): DriveLibraryItem[] {
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

type LogLine = { id: string; time: string; level: "info" | "success" | "error"; message: string };

function DropdownOptionMarker({ tone }: { tone?: DropdownOption["tone"] }) {
  if (!tone || tone === "neutral") return null;
  if (tone === "idle") return <CircleCheckBig size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "running") return <Play size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "scheduled") return <CalendarClock size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "failed") return <X size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "local") return <FolderOpen size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "drive") return <Cloud size={13} className={`dropdown-option-icon ${tone}`} />;
  return null;
}

function SmartFilterDropdown({
  value,
  options,
  label,
  searchLabel,
  onChange
}: {
  value: string;
  options: DropdownOption[];
  label: string;
  searchLabel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = options.find((option) => option.value === value);

  return (
    <div
      className={open ? "smart-dropdown open" : "smart-dropdown"}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setSearch("");
        }
      }}
    >
      <button type="button" className="smart-dropdown-trigger" onClick={() => setOpen((current) => !current)}>
        <span className={selected?.tone ? `dropdown-trigger-label ${selected.tone}` : "dropdown-trigger-label"}>
          <DropdownOptionMarker tone={selected?.tone} />
          {selected?.label || label}
        </span>
        <ChevronDown size={15} className="dropdown-chevron" />
      </button>
      {open && (
        <div className="smart-dropdown-menu">
          <label className="smart-dropdown-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchLabel} autoFocus />
          </label>
          <div className="smart-dropdown-options">
            {filteredOptions.map((option) => {
              return (
              <button
                type="button"
                className={value === option.value ? "smart-dropdown-option active" : "smart-dropdown-option"}
                key={option.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="dropdown-checkbox">{value === option.value ? <Check size={10} /> : null}</span>
                <span className={option.tone ? `dropdown-option-label ${option.tone}` : "dropdown-option-label"}>
                  <DropdownOptionMarker tone={option.tone} />
                  {option.label}
                </span>
              </button>
              );
            })}
            {filteredOptions.length === 0 && <span className="dropdown-empty">No matches</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceBadge({ sourceType }: { sourceType: StreamJob["sourceType"] }) {
  const isDrive = sourceType === "drive";
  return (
    <span className={isDrive ? "source-badge drive" : "source-badge local"}>
      {isDrive ? <Cloud size={12} /> : <FolderOpen size={12} />}
      {isDrive ? "Google Drive" : "Local"}
    </span>
  );
}

function StatusBadge({ status }: { status: StreamJob["status"] }) {
  const label = status === "idle" ? "Ready" : status === "scheduled" ? "Schedule" : status;

  return (
    <span className={`status-pill ${status}`}>
      {status === "idle" ? (
        <CircleCheckBig size={12} className="status-icon" />
      ) : status === "running" ? (
        <Play size={12} className="status-icon" />
      ) : status === "scheduled" ? (
        <CalendarClock size={12} className="status-icon" />
      ) : status === "failed" ? (
        <X size={12} className="status-icon" />
      ) : (
        <Circle size={10} className="status-icon" />
      )}
      {label}
    </span>
  );
}

export function App() {
  const [view, setView] = useState<View>("streams");
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [jobs, setJobs] = useState<StreamJob[]>(readJobs);
  const [selectedJobId, setSelectedJobId] = useState<string>(() => readJobs()[0]?.id || "");
  const [ffmpegStatus, setFfmpegStatus] = useState<"checking" | "ok" | "missing">("checking");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [driveLibrary, setDriveLibrary] = useState<DriveLibraryItem[]>(readDriveLibrary);
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [selectedDriveId, setSelectedDriveId] = useState("");
  const [driveDraft, setDriveDraft] = useState("");
  const [driveGroupDraft, setDriveGroupDraft] = useState("Default");
  const [driveFolderDraft, setDriveFolderDraft] = useState("");
  const [driveScanBusy, setDriveScanBusy] = useState(false);
  const [metadataLoadingIds, setMetadataLoadingIds] = useState<string[]>([]);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatusFilter, setQueueStatusFilter] = useState("all");
  const [queueSourceFilter, setQueueSourceFilter] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryGroupFilter, setLibraryGroupFilter] = useState("all");
  const [libraryResolutionFilter, setLibraryResolutionFilter] = useState("all");
  const [libraryDurationFilter, setLibraryDurationFilter] = useState("all");
  const [configDriveSearch, setConfigDriveSearch] = useState("");
  const [configDriveGroupFilter, setConfigDriveGroupFilter] = useState("all");
  const [queuePage, setQueuePage] = useState(1);
  const [queuePageSize, setQueuePageSize] = useState(20);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageSize, setLibraryPageSize] = useState(20);
  const [showToolGuide, setShowToolGuide] = useState(false);
  const [showVersionLog, setShowVersionLog] = useState(false);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0];
  const selectedJobDriveUrls = getJobDriveUrls(selectedJob);
  const selectedJobDriveKeys = new Set(selectedJobDriveUrls.map((url) => driveFileKey(url)));
  const runningCount = jobs.filter((job) => job.status === "running").length;
  const scheduledCount = jobs.filter((job) => job.status === "scheduled").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const readyCount = jobs.filter((job) => job.status === "idle").length;
  const queueRows = useMemo(() => {
    const term = queueSearch.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesTerm = !term || job.channelName.toLowerCase().includes(term) || job.lastMessage.toLowerCase().includes(term);
      const matchesStatus = queueStatusFilter === "all" || job.status === queueStatusFilter;
      const matchesSource = queueSourceFilter === "all" || job.sourceType === queueSourceFilter;
      return matchesTerm && matchesStatus && matchesSource;
    });
  }, [jobs, queueSearch, queueSourceFilter, queueStatusFilter]);
  const queueTotalPages = Math.max(1, Math.ceil(queueRows.length / queuePageSize));
  const queuePageStart = (queuePage - 1) * queuePageSize;
  const queuePageEnd = Math.min(queuePageStart + queuePageSize, queueRows.length);
  const queuePagedRows = queueRows.slice(queuePageStart, queuePageEnd);
  const libraryResolutionOptions = useMemo(
    () => Array.from(new Set(driveLibrary.map((item) => item.resolution).filter((value) => value && value !== "-"))),
    [driveLibrary]
  );
  const libraryGroupOptions = useMemo(
    () => Array.from(new Set(driveLibrary.map((item) => item.group).filter((value) => value && value !== "-"))),
    [driveLibrary]
  );
  const libraryRows = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    return driveLibrary.filter((item) => {
      const matchesTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.url.toLowerCase().includes(term) ||
        item.group.toLowerCase().includes(term) ||
        item.duration.toLowerCase().includes(term) ||
        item.resolution.toLowerCase().includes(term) ||
        item.size.toLowerCase().includes(term) ||
        item.metadataStatus.toLowerCase().includes(term) ||
        item.addedAt.toLowerCase().includes(term);
      const matchesGroup = libraryGroupFilter === "all" || item.group === libraryGroupFilter;
      const matchesResolution = libraryResolutionFilter === "all" || item.resolution === libraryResolutionFilter;
      const matchesDuration =
        libraryDurationFilter === "all" ||
        (libraryDurationFilter === "short" && /^0{0,1}0:/.test(item.duration)) ||
        (libraryDurationFilter === "medium" && /^0{0,1}[1-2]:/.test(item.duration)) ||
        (libraryDurationFilter === "long" && !/^0{0,1}[0-2]:/.test(item.duration));
      return matchesTerm && matchesGroup && matchesResolution && matchesDuration;
    });
  }, [driveLibrary, libraryDurationFilter, libraryGroupFilter, libraryResolutionFilter, librarySearch]);
  const libraryTotalPages = Math.max(1, Math.ceil(libraryRows.length / libraryPageSize));
  const libraryPageStart = (libraryPage - 1) * libraryPageSize;
  const libraryPageEnd = Math.min(libraryPageStart + libraryPageSize, libraryRows.length);
  const libraryPagedRows = libraryRows.slice(libraryPageStart, libraryPageEnd);
  const configDriveRows = useMemo(() => {
    const term = configDriveSearch.trim().toLowerCase();
    return driveLibrary.filter((item) => {
      const matchesTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.group.toLowerCase().includes(term) ||
        item.url.toLowerCase().includes(term) ||
        item.duration.toLowerCase().includes(term) ||
        item.resolution.toLowerCase().includes(term) ||
        item.size.toLowerCase().includes(term);
      const matchesGroup = configDriveGroupFilter === "all" || item.group === configDriveGroupFilter;
      return matchesTerm && matchesGroup;
    });
  }, [configDriveGroupFilter, configDriveSearch, driveLibrary]);
  const selectedDriveLibraryItem = selectedJob?.driveUrl.trim()
    ? driveLibrary.find((item) => driveFileKey(item.url) === driveFileKey(selectedJob.driveUrl))
    : undefined;
  const canAddSelectedDriveUrl = Boolean(
    selectedJob?.driveUrl.trim() &&
      /^https:\/\/drive\.google\.com\//i.test(selectedJob.driveUrl.trim()) &&
      !selectedDriveLibraryItem
  );
  const metadataReadyCount = driveLibrary.filter((item) => item.metadataStatus === "ready" || item.metadataStatus === "partial").length;

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  }, [jobs]);

  useEffect(() => {
    localStorage.setItem(DRIVE_LIBRARY_KEY, JSON.stringify(driveLibrary));
  }, [driveLibrary]);

  useEffect(() => {
    setDriveLibrary((items) =>
      items.map((item) =>
        item.metadataStatus === "error" && !hasDriveValue(item.duration) && !hasDriveValue(item.resolution) && !hasDriveValue(item.size)
          ? {
              ...item,
              metadataStatus: "pending",
              metadataChecked: false,
              metadataMessage: "Retrying metadata scan after scanner update."
            }
          : item
      )
    );
  }, []);

  useEffect(() => {
    if (!selectedJobId && jobs[0]) setSelectedJobId(jobs[0].id);
  }, [jobs, selectedJobId]);

  useEffect(() => {
    setQueuePage(1);
  }, [queueSearch, queueSourceFilter, queueStatusFilter]);

  useEffect(() => {
    if (queuePage > queueTotalPages) setQueuePage(queueTotalPages);
  }, [queuePage, queueTotalPages]);

  useEffect(() => {
    setLibraryPage(1);
  }, [librarySearch, libraryGroupFilter, libraryResolutionFilter, libraryDurationFilter]);

  useEffect(() => {
    if (libraryPage > libraryTotalPages) setLibraryPage(libraryTotalPages);
  }, [libraryPage, libraryTotalPages]);

  useEffect(() => {
    checkFfmpegStatus()
      .then((result) => {
        setFfmpegStatus(result.ok ? "ok" : "missing");
        addLog(result.ok ? "success" : "error", result.message);
      })
      .catch((checkError) => {
        setFfmpegStatus("missing");
        addLog("error", checkError instanceof Error ? checkError.message : "Unable to detect ffmpeg.");
      });
  }, []);

  useEffect(() => {
    const unsubscribe = window.streaming.onJobEvent((event: StreamEvent) => {
      setJobs((items) =>
        items.map((job) => (job.id === event.jobId ? { ...job, status: event.status || job.status, lastMessage: event.message, updatedAt: now() } : job))
      );
      addLog(event.level, `[${event.jobId.slice(0, 8)}] ${event.message}`);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (busy || ffmpegStatus !== "ok") return;
    const timer = window.setInterval(() => {
      const dueJob = jobs.find((job) => job.status === "scheduled" && job.scheduledAt && new Date(job.scheduledAt).getTime() <= Date.now());
      if (dueJob) {
        addLog("info", `Scheduled start triggered for ${dueJob.channelName}`);
        void startOne(dueJob);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy, ffmpegStatus, jobs]);

  useEffect(() => {
    if (typeof window.streaming?.probeDriveLink !== "function") {
      setError("Drive metadata scanner is not available. Restart the Electron app so preload/main process can load the latest code.");
      return;
    }
    const item = driveLibrary.find(
      (entry) =>
        !metadataLoadingIds.includes(entry.id) &&
        entry.metadataStatus === "pending"
    );
    if (!item) return;
    setMetadataLoadingIds((ids) => [...ids, item.id]);
    setDriveLibrary((items) => items.map((entry) => (entry.id === item.id ? { ...entry, metadataStatus: "scanning", metadataMessage: "Reading Google Drive metadata..." } : entry)));
    probeDriveLink(item.url)
      .then((metadata) => {
        const duration = metadata.duration || item.duration;
        const resolution = metadata.resolution || item.resolution;
        const size = metadata.size || item.size;
        const hasDuration = hasDriveValue(duration);
        const hasResolution = hasDriveValue(resolution);
        const hasSize = hasDriveValue(size);
        const hasName = Boolean(metadata.name && metadata.name !== "Drive video");
        const metadataStatus: DriveMetadataStatus = hasDuration && hasResolution ? "ready" : hasName || hasDuration || hasResolution || hasSize ? "partial" : "error";
        setDriveLibrary((items) =>
          items.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  name: metadata.name || entry.name,
                  duration: duration === "Auto" ? "-" : duration,
                  resolution: resolution === "Auto" ? "-" : resolution,
                  size: size === "Auto" ? "-" : size,
                  metadataStatus,
                  metadataMessage: metadata.message || (metadataStatus === "ready" ? "Metadata generated." : "Only partial metadata was available."),
                  metadataChecked: true
                }
              : entry
          )
        );
      })
      .catch(() => {
        setDriveLibrary((items) =>
          items.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  duration: entry.duration === "Auto" ? "-" : entry.duration,
                  resolution: entry.resolution === "Auto" ? "-" : entry.resolution,
                  size: entry.size === "Auto" ? "-" : entry.size,
                  metadataStatus: "error",
                  metadataMessage: "Could not read metadata. Check that the Drive file is public and direct-downloadable.",
                  metadataChecked: true
                }
              : entry
          )
        );
      })
      .finally(() => {
        setMetadataLoadingIds((ids) => ids.filter((id) => id !== item.id));
      });
  }, [driveLibrary, metadataLoadingIds]);

  function addLog(level: LogLine["level"], message: string) {
    setLogs((items) => [{ id: crypto.randomUUID(), time: now(), level, message }, ...items].slice(0, 300));
  }

  function updateSelectedJob(patch: Partial<StreamJob>) {
    if (!selectedJob) return;
    setJobs((items) => items.map((job) => (job.id === selectedJob.id ? { ...job, ...patch } : job)));
  }

  function updateSelectedDriveUrls(urls: string[]) {
    const nextUrls = uniqueDriveUrls(urls);
    updateSelectedJob({
      sourceType: "drive",
      driveUrls: nextUrls,
      driveUrl: nextUrls[0] || "",
      driveLastIndex: Math.min(selectedJob?.driveLastIndex || 0, Math.max(0, nextUrls.length - 1))
    });
  }

  function addJob() {
    const job: StreamJob = {
      id: crypto.randomUUID(),
      channelName: `Channel ${jobs.length + 1}`,
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
    };
    setJobs((items) => [job, ...items]);
    setSelectedJobId(job.id);
  }

  function copySelectedJob() {
    if (!selectedJob) return;
    const copyJob: StreamJob = {
      ...selectedJob,
      id: crypto.randomUUID(),
      channelName: `${selectedJob.channelName} Copy`,
      status: "idle",
      scheduledAt: "",
      lastMessage: "Copied from selected channel",
      updatedAt: now()
    };
    setJobs((items) => [copyJob, ...items]);
    setSelectedJobId(copyJob.id);
  }

  function deleteSelectedJob() {
    if (!selectedJob || jobs.length <= 1) return;
    const nextJobs = jobs.filter((job) => job.id !== selectedJob.id);
    setJobs(nextJobs);
    setSelectedJobId(nextJobs[0]?.id || "");
  }

  async function pickSourceFile() {
    const filePath = await pickLocalVideo();
    if (filePath) updateSelectedJob({ localPath: filePath, sourceType: "local" });
  }

  async function startOne(job: StreamJob) {
    setBusy(true);
    setError("");
    try {
      const hasPrimary = job.primaryRtmpUrl.trim() || (job.rtmpBase.trim() && job.streamKey.trim());
      const driveUrls = getJobDriveUrls(job);
      if (!hasPrimary) throw new Error(`Missing primary output for ${job.channelName}`);
      if (job.sourceType === "local" && !job.localPath.trim()) throw new Error(`Missing local file for ${job.channelName}`);
      if (job.sourceType === "drive" && driveUrls.length === 0) throw new Error(`Missing Google Drive URL for ${job.channelName}`);
      await startStreamJob(job);
      setJobs((items) => items.map((item) => (item.id === job.id ? { ...item, scheduledAt: "" } : item)));
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : "Unable to start stream.";
      setError(message);
      addLog("error", message);
      setJobs((items) => items.map((item) => (item.id === job.id ? { ...item, status: "failed", lastMessage: message, updatedAt: now() } : item)));
    } finally {
      setBusy(false);
    }
  }

  async function stopOne(jobId: string) {
    try {
      await stopStreamJob(jobId);
      setJobs((items) => items.map((item) => (item.id === jobId ? { ...item, status: "idle", scheduledAt: "", lastMessage: "Stopped", updatedAt: now() } : item)));
    } catch (stopError) {
      addLog("error", stopError instanceof Error ? stopError.message : "Unable to stop stream.");
    }
  }

  async function startAll() {
    await Promise.all(jobs.map((job) => startOne(job)));
  }

  async function stopAll() {
    await stopAllStreams();
    setJobs((items) => items.map((item) => ({ ...item, status: "idle", scheduledAt: "", lastMessage: "Stopped all", updatedAt: now() })));
    addLog("info", "All streams stopped");
  }

  async function refreshAll() {
    try {
      const status = await checkFfmpegStatus();
      setFfmpegStatus(status.ok ? "ok" : "missing");
      addLog(status.ok ? "success" : "error", status.message);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : "Unable to refresh diagnostics.";
      setFfmpegStatus("missing");
      setError(message);
      addLog("error", message);
    }
  }

  function scheduleSelectedJob() {
    if (!selectedJob?.scheduledAt) {
      setError("Pick a schedule time first.");
      return;
    }
    const scheduledTime = new Date(selectedJob.scheduledAt).getTime();
    if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
      setError("Schedule time must be in the future.");
      return;
    }
    setError("");
    updateSelectedJob({
      status: "scheduled",
      lastMessage: `Scheduled for ${new Date(selectedJob.scheduledAt).toLocaleString()}`,
      updatedAt: now()
    });
    addLog("info", `${selectedJob.channelName} scheduled for ${new Date(selectedJob.scheduledAt).toLocaleString()}`);
  }

  function cancelSelectedSchedule() {
    if (!selectedJob) return;
    updateSelectedJob({
      status: "idle",
      scheduledAt: "",
      lastMessage: "Schedule cancelled",
      updatedAt: now()
    });
    addLog("info", `${selectedJob.channelName} schedule cancelled`);
  }


  function parseDriveLinks(value: string) {
    return Array.from(new Set(value.split(/[\n,;\s]+/).map((item) => item.trim()).filter((item) => /^https:\/\/drive\.google\.com\//i.test(item))));
  }

  function addDriveLinks(urls = parseDriveLinks(driveDraft)) {
    if (urls.length === 0) return;
    setDriveLibrary((items) => {
      const existingUrls = new Set(items.map((item) => driveFileKey(item.url)));
      const group = driveGroupDraft.trim() || "Ungrouped";
      const seenUrls = new Set(existingUrls);
      const nextItems = urls
        .filter((url) => {
          const key = driveFileKey(url);
          if (seenUrls.has(key)) return false;
          seenUrls.add(key);
          return true;
        })
        .map((url) => ({
          id: crypto.randomUUID(),
          url,
          name: "Drive video",
          group,
          duration: "Auto",
          resolution: "Auto",
          size: "Auto",
          addedAt: new Date().toLocaleDateString("en-GB"),
          metadataStatus: "pending" as DriveMetadataStatus,
          metadataMessage: "Waiting for metadata scan.",
          metadataChecked: false
        }));
      return [...nextItems, ...items].slice(0, 200);
    });
    setDriveDraft("");
    setDriveGroupDraft("Default");
    setDriveFolderDraft("");
    setDriveModalOpen(false);
  }

  function addCurrentDriveUrlToLibrary() {
    const url = selectedJob?.driveUrl.trim() || "";
    if (!url || !/^https:\/\/drive\.google\.com\//i.test(url)) {
      setError("Enter a valid Google Drive URL first.");
      return;
    }
    if (driveLibrary.some((item) => driveFileKey(item.url) === driveFileKey(url))) return;
    const group = configDriveGroupFilter !== "all" ? configDriveGroupFilter : driveGroupDraft.trim() || "Default";
    setDriveLibrary((items) => [
      {
        id: crypto.randomUUID(),
        url,
        name: "Drive video",
        group,
        duration: "Auto",
        resolution: "Auto",
        size: "Auto",
        addedAt: new Date().toLocaleDateString("en-GB"),
        metadataStatus: "pending" as DriveMetadataStatus,
        metadataMessage: "Waiting for metadata scan.",
        metadataChecked: false
      },
      ...items
    ]);
    setSelectedDriveId("");
    updateSelectedDriveUrls([...selectedJobDriveUrls, url]);
    setError("");
  }

  function applyDriveLibraryItem(item: DriveLibraryItem) {
    const key = driveFileKey(item.url);
    const nextUrls = selectedJobDriveKeys.has(key) ? selectedJobDriveUrls.filter((url) => driveFileKey(url) !== key) : [...selectedJobDriveUrls, item.url];
    updateSelectedDriveUrls(nextUrls);
    setSelectedDriveId(item.id);
    setConfigDriveSearch(item.name);
  }

  function removeSelectedDriveUrl(url: string) {
    updateSelectedDriveUrls(selectedJobDriveUrls.filter((item) => driveFileKey(item) !== driveFileKey(url)));
  }

  async function scanFolderAndAppendLinks() {
    const folderUrl = driveFolderDraft.trim();
    if (!folderUrl) return;
    setDriveScanBusy(true);
    setError("");
    try {
      const result = await scanDriveFolder(folderUrl);
      if (result.links.length === 0) {
        setError(result.message);
        return;
      }
      setDriveDraft((current) => [...parseDriveLinks(current), ...result.links].join("\n"));
      addLog("success", result.message);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unable to scan Drive folder.");
    } finally {
      setDriveScanBusy(false);
    }
  }

  function removeDriveLink(id: string) {
    setDriveLibrary((items) => items.filter((item) => item.id !== id));
    if (selectedDriveId === id) setSelectedDriveId("");
  }

  function removeSelectedDriveLink() {
    if (!selectedDriveId) return;
    removeDriveLink(selectedDriveId);
  }

  function refreshDriveMetadata(id: string) {
    setDriveLibrary((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              duration: hasDriveValue(item.duration) ? item.duration : "Auto",
              resolution: hasDriveValue(item.resolution) ? item.resolution : "Auto",
              size: hasDriveValue(item.size) ? item.size : "Auto",
              metadataStatus: "pending",
              metadataMessage: "Waiting for metadata scan.",
              metadataChecked: false
            }
          : item
      )
    );
  }

  function refreshAllDriveMetadata() {
    setDriveLibrary((items) =>
      items.map((item) => ({
        ...item,
        duration: hasDriveValue(item.duration) ? item.duration : "Auto",
        resolution: hasDriveValue(item.resolution) ? item.resolution : "Auto",
        size: hasDriveValue(item.size) ? item.size : "Auto",
        metadataStatus: "pending",
        metadataMessage: "Waiting for metadata scan.",
        metadataChecked: false
      }))
    );
  }

  function metadataStatusLabel(status: DriveMetadataStatus) {
    if (status === "scanning") return "Scanning";
    if (status === "ready") return "Ready";
    if (status === "partial") return "Partial";
    if (status === "error") return "No metadata";
    return "Pending";
  }

  const selectedSourceLabel = useMemo(() => {
    if (!selectedJob) return "-";
    if (selectedJob.sourceType === "local") return selectedJob.localPath || "No local file selected";
    const driveUrls = getJobDriveUrls(selectedJob);
    if (driveUrls.length > 1) return `${driveUrls.length} Google Drive links (${selectedJob.drivePlayMode === "random" ? "Random" : "Xoay vòng"})`;
    return driveUrls[0] || "No Google Drive URL";
  }, [selectedJob]);
  const ffmpegPillClass = ffmpegStatus === "ok" ? "connected" : ffmpegStatus === "missing" ? "offline" : "";
  const ffmpegPillLabel = ffmpegStatus === "ok" ? "ffmpeg ready" : ffmpegStatus === "missing" ? "ffmpeg missing" : "checking ffmpeg";
  const queueStatusOptions: DropdownOption[] = [
    { value: "all", label: "All status", tone: "neutral" },
    { value: "idle", label: "Ready", tone: "idle" },
    { value: "running", label: "Running", tone: "running" },
    { value: "scheduled", label: "Schedule", tone: "scheduled" },
    { value: "failed", label: "Failed", tone: "failed" }
  ];
  const queueSourceOptions: DropdownOption[] = [
    { value: "all", label: "All sources", tone: "neutral" },
    { value: "local", label: "Local file", tone: "local" },
    { value: "drive", label: "Google Drive", tone: "drive" }
  ];
  const sourceTypeOptions: DropdownOption[] = [
    { value: "local", label: "Local file", tone: "local" },
    { value: "drive", label: "Google Drive", tone: "drive" }
  ];
  const drivePlayModeOptions: DropdownOption[] = [
    { value: "sequential", label: "Xoay vòng", tone: "scheduled" },
    { value: "random", label: "Random", tone: "running" }
  ];
  const libraryResolutionDropdownOptions: DropdownOption[] = [
    { value: "all", label: "All resolutions" },
    ...libraryResolutionOptions.map((resolution) => ({ value: resolution, label: resolution }))
  ];
  const libraryGroupDropdownOptions: DropdownOption[] = [
    { value: "all", label: "All groups" },
    ...libraryGroupOptions.map((group) => ({ value: group, label: group }))
  ];
  const libraryDurationOptions: DropdownOption[] = [
    { value: "all", label: "All durations" },
    { value: "short", label: "Short (< 10m)" },
    { value: "medium", label: "Medium (10m - 29m)" },
    { value: "long", label: "Long (30m+)" }
  ];

  return (
    <div className={`shell theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand-mark">YT</div>
        <nav>
          <button className={view === "streams" ? "active" : ""} title="Streams" onClick={() => setView("streams")}>
            <Tv size={18} />
          </button>
          <button className={view === "library" ? "active" : ""} title="Drive Library" onClick={() => setView("library")}>
            <Sparkles size={18} />
          </button>
        </nav>
        <div className={`api-dot ${ffmpegStatus === "ok" ? "connected" : ffmpegStatus === "missing" ? "offline" : "checking"}`}>
          {ffmpegStatus === "ok" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{view === "streams" ? "YouTube Multistream Console" : "Drive Library"}</h1>
          </div>
          <div className="top-actions">
            <span className={`api-pill ${ffmpegPillClass}`}>{ffmpegPillLabel}</span>
            <button className="ghost slim-button" onClick={() => setShowToolGuide(true)} title="Tool functions and usage guide">
              <BookOpen size={16} />
              Guide
            </button>
            <button className="ghost slim-button" onClick={() => setShowVersionLog(true)} title="Version update log">
              <History size={16} />
              Changelog
            </button>
            <button className="ghost slim-button" onClick={() => void refreshAll()} disabled={busy} title="Refresh diagnostics and status">
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="ghost slim-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              Theme: {theme}
            </button>
          </div>
        </header>

        {error && (
          <div className="notice">
            <XCircle size={16} />
            {error}
          </div>
        )}

        {view === "streams" && (
          <section className="layout">
          <div className="left-pane card">
            <div className="pane-head">
              <h2>Channel Queue</h2>
              <div className="inline-row">
                <span>{jobs.length} channels</span>
                <button className="primary slim-button" onClick={addJob}>
                  <Plus size={14} />
                  New
                </button>
                <button className="ghost slim-button" onClick={copySelectedJob} disabled={!selectedJob}>
                  <Copy size={14} />
                  Copy
                </button>
                <button className="danger slim-button" onClick={deleteSelectedJob} disabled={!selectedJob || jobs.length <= 1}>
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
            <div className="metrics">
              <div className="metric-card">
                <span className="metric-icon metric-ready">
                  <CircleCheckBig size={12} />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Ready</span>
                  <strong className="metric-value">{readyCount}</strong>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-icon metric-running">
                  <Play size={12} />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Running</span>
                  <strong className="metric-value">{runningCount}</strong>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-icon metric-scheduled">
                  <CalendarClock size={12} />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Schedule</span>
                  <strong className="metric-value">{scheduledCount}</strong>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-icon metric-applied">
                  <X size={12} />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Failed</span>
                  <strong className="metric-value">{failedCount}</strong>
                </div>
              </div>
            </div>
            <div className="queue-filters">
              <label className="input with-icon">
                <Search size={15} />
                <input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search channels" />
              </label>
              <SmartFilterDropdown value={queueStatusFilter} options={queueStatusOptions} label="All status" searchLabel="Search status..." onChange={setQueueStatusFilter} />
              <SmartFilterDropdown value={queueSourceFilter} options={queueSourceOptions} label="All sources" searchLabel="Search sources..." onChange={setQueueSourceFilter} />
            </div>
            <div className="job-list">
              <div className="table-scroll">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>
                      <span className="col-head">
                        <Tv size={13} />
                        Channel
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <HardDrive size={13} />
                        Source
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <CircleCheckBig size={13} />
                        Status
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <MessageCircle size={13} />
                        Last message
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <Clock3 size={13} />
                        Updated
                      </span>
                    </th>
                    <th className="action-col">
                      <span className="col-head">
                        <Settings size={13} />
                        Actions
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queuePagedRows.map((job) => (
                    <tr
                      key={job.id}
                      className={selectedJobId === job.id ? "queue-row active" : "queue-row"}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <td>
                        <strong className="queue-channel-name">{job.channelName}</strong>
                      </td>
                      <td>
                        <SourceBadge sourceType={job.sourceType} />
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="queue-message">{job.lastMessage}</td>
                      <td className="queue-updated">{job.updatedAt}</td>
                      <td
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        className="queue-actions"
                      >
                        <button className="icon-action run-action" title="Start channel" onClick={() => startOne(job)} disabled={busy || ffmpegStatus !== "ok"}>
                          <Play size={12} />
                        </button>
                        <button className="icon-action stop-action" title="Stop channel" onClick={() => stopOne(job.id)}>
                          <Square size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="pagination-footer">
                <div className="pagination-actions">
                  <button className="page-button" onClick={() => setQueuePage(1)} disabled={queuePage === 1} title="First page">
                    <ChevronFirst size={15} />
                  </button>
                  <button className="page-button" onClick={() => setQueuePage((page) => Math.max(1, page - 1))} disabled={queuePage === 1} title="Previous page">
                    <ChevronLeft size={15} />
                  </button>
                  <span>
                    {queuePage} / {queueTotalPages}
                  </span>
                  <button
                    className="page-button"
                    onClick={() => setQueuePage((page) => Math.min(queueTotalPages, page + 1))}
                    disabled={queuePage === queueTotalPages}
                    title="Next page"
                  >
                    <ChevronRight size={15} />
                  </button>
                  <button className="page-button" onClick={() => setQueuePage(queueTotalPages)} disabled={queuePage === queueTotalPages} title="Last page">
                    <ChevronLast size={15} />
                  </button>
                </div>
                <div className="pagination-meta">
                  <span>
                    {queueRows.length === 0 ? "0" : queuePageStart + 1}-{queuePageEnd} of {queueRows.length} channels
                  </span>
                  <label>
                    Rows per page
                    <select className="table-page-size" value={queuePageSize} onChange={(event) => setQueuePageSize(Number(event.target.value))}>
                      {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
            <div className="pane-actions">
              <button className="run" onClick={startAll} disabled={busy || ffmpegStatus !== "ok"}>
                <Play size={14} />
                Start all
              </button>
              <button className="stop" onClick={stopAll}>
                <Square size={12} />
                Stop all
              </button>
            </div>
          </div>

          <div className="right-pane">
            <section className="card stream-config-card">
              <div className="pane-head">
                <h2>Stream Config</h2>
                {selectedJob && <span>{selectedJob.channelName}</span>}
              </div>
              {selectedJob ? (
                <>
                  <div className="form-grid">
                    <label>
                      Channel name
                      <input value={selectedJob.channelName} onChange={(event) => updateSelectedJob({ channelName: event.target.value })} />
                    </label>
                    <label className="source-type-field">
                      Source type
                      <SmartFilterDropdown
                        value={selectedJob.sourceType}
                        options={sourceTypeOptions}
                        label="Source type"
                        searchLabel="Search source..."
                        onChange={(value) => updateSelectedJob({ sourceType: value as StreamJob["sourceType"] })}
                      />
                    </label>
                    <label className="span-2">
                      Primary RTMP URL (full URL)
                      <input
                        value={selectedJob.primaryRtmpUrl}
                        onChange={(event) => updateSelectedJob({ primaryRtmpUrl: event.target.value })}
                        placeholder="rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx..."
                      />
                    </label>
                    <label className="span-2">
                      Backup RTMP URL (optional)
                      <input
                        value={selectedJob.backupRtmpUrl}
                        onChange={(event) => updateSelectedJob({ backupRtmpUrl: event.target.value })}
                        placeholder="rtmp://b.rtmp.youtube.com/live2?backup=1"
                      />
                    </label>
                    <label>
                      RTMP base URL (legacy mode)
                      <input value={selectedJob.rtmpBase} onChange={(event) => updateSelectedJob({ rtmpBase: event.target.value })} placeholder="rtmp://a.rtmp.youtube.com/live2" />
                    </label>
                    <label>
                      Stream key (legacy mode)
                      <input value={selectedJob.streamKey} onChange={(event) => updateSelectedJob({ streamKey: event.target.value })} placeholder="xxxx-xxxx-xxxx-xxxx-xxxx" />
                    </label>
                    {selectedJob.sourceType === "local" ? (
                      <label className="span-2">
                        Local file path
                        <div className="inline-row">
                          <input value={selectedJob.localPath} onChange={(event) => updateSelectedJob({ localPath: event.target.value })} placeholder="D:\\videos\\sample.mp4" />
                          <button className="ghost slim-button" onClick={pickSourceFile}>
                            <Upload size={14} />
                            Pick
                          </button>
                        </div>
                      </label>
                    ) : (
                      <div className="span-2 drive-config-picker">
                        <div className="field-label icon-label">
                          <Cloud size={13} />
                          Google Drive URLs
                        </div>
                        <div className="drive-url-row">
                          <input
                            value={selectedJob.driveUrl}
                            onChange={(event) => updateSelectedJob({ driveUrl: event.target.value })}
                            placeholder="https://drive.google.com/file/d/FILE_ID/view"
                          />
                          <button className="ghost slim-button" onClick={addCurrentDriveUrlToLibrary} disabled={!canAddSelectedDriveUrl}>
                            <Plus size={14} />
                            Add link
                          </button>
                          <button className="ghost slim-button" onClick={() => setDrivePickerOpen(true)}>
                            <Files size={14} />
                            Choose from Drive Library
                          </button>
                        </div>
                        <div className="drive-selection-head">
                          <span>{selectedJobDriveUrls.length} selected</span>
                          <label className="drive-run-mode-field">
                            Drive run mode
                            <SmartFilterDropdown
                              value={selectedJob.drivePlayMode || "sequential"}
                              options={drivePlayModeOptions}
                              label="Run mode"
                              searchLabel="Search mode..."
                              onChange={(value) => updateSelectedJob({ drivePlayMode: value as StreamJob["drivePlayMode"] })}
                            />
                          </label>
                        </div>
                        {selectedJobDriveUrls.length > 0 && (
                          <div className="drive-selected-list">
                            {selectedJobDriveUrls.map((url, index) => {
                              const item = driveLibrary.find((entry) => driveFileKey(entry.url) === driveFileKey(url));
                              return (
                                <span className="drive-selected-chip" key={driveFileKey(url)}>
                                  <Cloud size={12} />
                                  <span title={item?.name || url}>{item?.name || `Drive link ${index + 1}`}</span>
                                  <button type="button" title="Remove selected Drive link" onClick={() => removeSelectedDriveUrl(url)}>
                                    <X size={11} />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    <label>
                      Schedule time
                      <input
                        type="datetime-local"
                        value={selectedJob.scheduledAt || ""}
                        onChange={(event) => updateSelectedJob({ scheduledAt: event.target.value })}
                      />
                    </label>
                    <div className="source-summary">
                      <SourceBadge sourceType={selectedJob.sourceType} />
                      <span title={selectedSourceLabel}>{selectedSourceLabel}</span>
                    </div>
                  </div>
                  <div className="stream-action-bar">
                    <button className="run" onClick={() => startOne(selectedJob)} disabled={busy || ffmpegStatus !== "ok"}>
                      <Play size={14} />
                      Start selected
                    </button>
                    <button className="stop" onClick={() => stopOne(selectedJob.id)}>
                      <Square size={12} />
                      Stop selected
                    </button>
                    {selectedJob.status === "scheduled" ? (
                      <button className="ghost slim-button" onClick={cancelSelectedSchedule}>
                        <CalendarClock size={14} />
                        Cancel schedule
                      </button>
                    ) : (
                      <button className="ghost slim-button" onClick={scheduleSelectedJob}>
                        <CalendarClock size={14} />
                        Schedule selected
                      </button>
                    )}
                    <button
                      className="ghost slim-button"
                      onClick={() =>
                        updateSelectedJob({
                          sourceType: "drive",
                          driveUrl: "https://drive.google.com/file/d/1jMQ6HIUvWHVPb_WLQQXQNZ4J2dbW3vze/view?usp=drive_link",
                          driveUrls: ["https://drive.google.com/file/d/1jMQ6HIUvWHVPb_WLQQXQNZ4J2dbW3vze/view?usp=drive_link"],
                          drivePlayMode: "sequential",
                          primaryRtmpUrl: "rtmp://a.rtmp.youtube.com/live2",
                          backupRtmpUrl: "rtmp://b.rtmp.youtube.com/live2?backup=1"
                        })
                      }
                    >
                      <Zap size={14} />
                      Apply test preset
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">Select a channel to edit stream configuration.</p>
              )}
            </section>

            <section className="card console-card">
              <div className="pane-head">
                <h2>Runtime Console</h2>
                <button className="ghost slim-button" onClick={() => setLogs([])}>
                  Clear
                </button>
              </div>
              <div className="console">
                {logs.map((log) => (
                  <div key={log.id} className={`log-line ${log.level}`}>
                    <span>{log.time}</span>
                    <p>{log.message}</p>
                  </div>
                ))}
                {logs.length === 0 && <p className="muted">No stream logs yet.</p>}
              </div>
            </section>
          </div>
          </section>
        )}
        {view === "library" && (
          <section className="library-layout card">
            <div className="pane-head">
              <h2>Drive Library</h2>
              <div className="inline-row">
                <span>{libraryRows.length} of {driveLibrary.length} items</span>
                <button className="primary slim-button" onClick={() => setDriveModalOpen(true)}>
                  <Plus size={14} />
                  Add
                </button>
                <button className="ghost slim-button" onClick={refreshAllDriveMetadata} disabled={driveLibrary.length === 0}>
                  <RefreshCw size={14} />
                  Refresh
                </button>
                <button className="danger slim-button" onClick={removeSelectedDriveLink} disabled={!selectedDriveId}>
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
            <div className="metrics">
              <div className="metric-card">
                <span className="metric-icon metric-ready">
                  <HardDrive size={12} />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Drive Links</span>
                  <strong className="metric-value">{driveLibrary.length}</strong>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-icon metric-running">
                  <Search size={12} />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Filtered</span>
                  <strong className="metric-value">{libraryRows.length}</strong>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-icon metric-scheduled">
                  <Files size={12} />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Groups</span>
                  <strong className="metric-value">{libraryGroupOptions.length}</strong>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-icon metric-ready">
                  <CircleCheckBig size={12} />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Metadata</span>
                  <strong className="metric-value">{metadataReadyCount}/{driveLibrary.length}</strong>
                </div>
              </div>
            </div>
            <div className="library-toolbar">
              <label className="input with-icon">
                <Search size={15} />
                <input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search file, group, metadata, Drive link..." />
              </label>
              <SmartFilterDropdown
                value={libraryGroupFilter}
                options={libraryGroupDropdownOptions}
                label="All groups"
                searchLabel="Search groups..."
                onChange={setLibraryGroupFilter}
              />
              <SmartFilterDropdown
                value={libraryResolutionFilter}
                options={libraryResolutionDropdownOptions}
                label="All resolutions"
                searchLabel="Search resolutions..."
                onChange={setLibraryResolutionFilter}
              />
            </div>
            <div className="library-table-wrap">
              <div className="table-scroll">
              <table className="queue-table library-table">
                <thead>
                  <tr>
                    <th>
                      <span className="col-head">
                        <HardDrive size={13} />
                        File / Drive Link
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <CircleCheckBig size={13} />
                        Status
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <FolderOpen size={13} />
                        Group
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <Clock3 size={13} />
                        Duration
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <Tv size={13} />
                        Resolution
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <Files size={13} />
                        Size
                      </span>
                    </th>
                    <th>
                      <span className="col-head">
                        <Settings size={13} />
                        Actions
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {libraryPagedRows.map((item) => (
                    <tr
                      key={item.id}
                      className={selectedDriveId === item.id || selectedJob?.driveUrl === item.url ? "queue-row active" : "queue-row"}
                      onClick={() => setSelectedDriveId(item.id)}
                    >
                      <td>
                        <div className="drive-file-cell">
                          <strong className="drive-file-name" title={item.name}>
                            {metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning" ? "Scanning metadata..." : item.name}
                          </strong>
                          <span className="library-link" title={item.url}>
                            <HardDrive size={12} />
                            <span>{item.url}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`metadata-pill ${item.metadataStatus}`} title={item.metadataMessage || metadataStatusLabel(item.metadataStatus)}>
                          {metadataStatusLabel(item.metadataStatus)}
                        </span>
                      </td>
                      <td>
                        <span className="group-badge">{item.group}</span>
                      </td>
                      <td>
                        <span className="metadata-value">
                          <CalendarClock size={12} />
                          {item.duration}
                        </span>
                      </td>
                      <td>
                        <span className="metadata-value">
                          <Tv size={12} />
                          {item.resolution}
                        </span>
                      </td>
                      <td>
                        <span className="metadata-value">
                          <HardDrive size={12} />
                          {item.size}
                        </span>
                      </td>
                      <td
                        className="library-actions"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <button
                          className="icon-action library-refresh-action"
                          title="Refresh metadata"
                          onClick={() => refreshDriveMetadata(item.id)}
                          disabled={metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning"}
                        >
                          <RefreshCw size={12} className={metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning" ? "spinning" : ""} />
                        </button>
                        <button className="icon-action library-remove-action" title="Remove drive link" onClick={() => removeDriveLink(item.id)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {libraryRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="library-empty">
                        No drive items match current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
              <div className="pagination-footer">
                <div className="pagination-actions">
                  <button className="page-button" onClick={() => setLibraryPage(1)} disabled={libraryPage === 1} title="First page">
                    <ChevronFirst size={15} />
                  </button>
                  <button className="page-button" onClick={() => setLibraryPage((page) => Math.max(1, page - 1))} disabled={libraryPage === 1} title="Previous page">
                    <ChevronLeft size={15} />
                  </button>
                  <span>
                    {libraryPage} / {libraryTotalPages}
                  </span>
                  <button
                    className="page-button"
                    onClick={() => setLibraryPage((page) => Math.min(libraryTotalPages, page + 1))}
                    disabled={libraryPage === libraryTotalPages}
                    title="Next page"
                  >
                    <ChevronRight size={15} />
                  </button>
                  <button className="page-button" onClick={() => setLibraryPage(libraryTotalPages)} disabled={libraryPage === libraryTotalPages} title="Last page">
                    <ChevronLast size={15} />
                  </button>
                </div>
                <div className="pagination-meta">
                  <span>
                    {libraryRows.length === 0 ? "0" : libraryPageStart + 1}-{libraryPageEnd} of {libraryRows.length} items
                  </span>
                  <label>
                    Rows per page
                    <select className="table-page-size" value={libraryPageSize} onChange={(event) => setLibraryPageSize(Number(event.target.value))}>
                      {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </section>
        )}
        {drivePickerOpen && selectedJob && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setDrivePickerOpen(false)}>
            <div className="modal-card drive-picker-modal" role="dialog" aria-modal="true" aria-labelledby="drive-picker-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="pane-head">
                <div>
                  <h2 id="drive-picker-title">Choose from Drive Library</h2>
                  <p className="muted">{selectedJobDriveUrls.length} selected for {selectedJob.channelName}</p>
                </div>
                <button className="icon-action library-remove-action" title="Close" onClick={() => setDrivePickerOpen(false)}>
                  <X size={14} />
                </button>
              </div>
              <div className="drive-picker-summary">
                <div className="metric-card">
                  <span className="metric-icon metric-ready">
                    <Cloud size={12} />
                  </span>
                  <div className="metric-content">
                    <span className="metric-label">Selected</span>
                    <strong className="metric-value">{selectedJobDriveUrls.length}</strong>
                  </div>
                </div>
                <div className="metric-card">
                  <span className="metric-icon metric-running">
                    <Search size={12} />
                  </span>
                  <div className="metric-content">
                    <span className="metric-label">Filtered</span>
                    <strong className="metric-value">{configDriveRows.length}</strong>
                  </div>
                </div>
                <div className="metric-card">
                  <span className="metric-icon metric-scheduled">
                    <Files size={12} />
                  </span>
                  <div className="metric-content">
                    <span className="metric-label">Library</span>
                    <strong className="metric-value">{driveLibrary.length}</strong>
                  </div>
                </div>
              </div>
              <div className="drive-picker-toolbar">
                <label className="input with-icon">
                  <Search size={15} />
                  <input value={configDriveSearch} onChange={(event) => setConfigDriveSearch(event.target.value)} placeholder="Search file, group, metadata, Drive link..." autoFocus />
                </label>
                <SmartFilterDropdown
                  value={configDriveGroupFilter}
                  options={libraryGroupDropdownOptions}
                  label="All groups"
                  searchLabel="Search groups..."
                  onChange={setConfigDriveGroupFilter}
                />
                <button className="ghost slim-button" onClick={() => updateSelectedDriveUrls(configDriveRows.map((item) => item.url))} disabled={configDriveRows.length === 0}>
                  <Check size={14} />
                  Select filtered
                </button>
              </div>
              <div className="drive-picker-table-wrap">
                <table className="queue-table library-table drive-picker-table">
                  <thead>
                    <tr>
                      <th>
                        <span className="col-head">
                          <Cloud size={13} />
                          File / Drive Link
                        </span>
                      </th>
                      <th>
                        <span className="col-head">
                          <CircleCheckBig size={13} />
                          Status
                        </span>
                      </th>
                      <th>
                        <span className="col-head">
                          <FolderOpen size={13} />
                          Group
                        </span>
                      </th>
                      <th>
                        <span className="col-head">
                          <Clock3 size={13} />
                          Duration
                        </span>
                      </th>
                      <th>
                        <span className="col-head">
                          <Tv size={13} />
                          Resolution
                        </span>
                      </th>
                      <th>
                        <span className="col-head">
                          <Files size={13} />
                          Size
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {configDriveRows.map((item) => {
                      const selected = selectedJobDriveKeys.has(driveFileKey(item.url));
                      return (
                        <tr key={item.id} className={selected ? "queue-row active" : "queue-row"} onClick={() => applyDriveLibraryItem(item)}>
                          <td>
                            <div className="drive-file-cell drive-picker-file-cell">
                              <span className="drive-config-check">{selected ? <Check size={10} /> : null}</span>
                              <div className="drive-file-cell">
                                <strong className="drive-file-name" title={item.name}>
                                  {metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning" ? "Scanning metadata..." : item.name}
                                </strong>
                                <span className="library-link" title={item.url}>
                                  <Cloud size={12} />
                                  <span>{item.url}</span>
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`metadata-pill ${item.metadataStatus}`} title={item.metadataMessage || metadataStatusLabel(item.metadataStatus)}>
                              {metadataStatusLabel(item.metadataStatus)}
                            </span>
                          </td>
                          <td>
                            <span className="group-badge">{item.group}</span>
                          </td>
                          <td>
                            <span className="metadata-value">
                              <CalendarClock size={12} />
                              {item.duration}
                            </span>
                          </td>
                          <td>
                            <span className="metadata-value">
                              <Tv size={12} />
                              {item.resolution}
                            </span>
                          </td>
                          <td>
                            <span className="metadata-value">
                              <HardDrive size={12} />
                              {item.size}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {configDriveRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="library-empty">
                          No Drive links match current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                <button className="ghost slim-button" onClick={() => updateSelectedDriveUrls([])} disabled={selectedJobDriveUrls.length === 0}>
                  Clear selected
                </button>
                <button
                  className="ghost slim-button"
                  onClick={() => {
                    setDrivePickerOpen(false);
                    setDriveModalOpen(true);
                  }}
                >
                  <Plus size={14} />
                  Add Drive Link
                </button>
                <button className="primary slim-button" onClick={() => setDrivePickerOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
        {driveModalOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setDriveModalOpen(false)}>
            <div className="modal-card drive-modal" role="dialog" aria-modal="true" aria-labelledby="drive-modal-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="pane-head">
                <h2 id="drive-modal-title">Add Drive Link</h2>
                <button className="icon-action library-remove-action" title="Close" onClick={() => setDriveModalOpen(false)}>
                  <X size={14} />
                </button>
              </div>
              <div className="modal-form">
                <label className="span-2">
                  Google Drive URLs
                  <textarea
                    value={driveDraft}
                    onChange={(event) => setDriveDraft(event.target.value)}
                    placeholder="Paste one or many Google Drive file links, separated by new lines"
                    autoFocus
                  />
                </label>
                <label>
                  Group
                  <input value={driveGroupDraft} onChange={(event) => setDriveGroupDraft(event.target.value)} placeholder="Default" list="drive-groups" />
                  <datalist id="drive-groups">
                    {libraryGroupOptions.map((group) => (
                      <option value={group} key={group} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Drive folder URL
                  <div className="inline-row">
                    <input value={driveFolderDraft} onChange={(event) => setDriveFolderDraft(event.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
                    <button className="ghost slim-button" onClick={() => void scanFolderAndAppendLinks()} disabled={driveScanBusy}>
                      <Search size={14} />
                      Scan
                    </button>
                  </div>
                </label>
              </div>
              <div className="modal-actions">
                <button className="ghost slim-button" onClick={() => setDriveModalOpen(false)}>
                  Cancel
                </button>
                <button className="primary slim-button" onClick={() => addDriveLinks()}>
                  <Plus size={14} />
                  Add links
                </button>
              </div>
            </div>
          </div>
        )}
        {showToolGuide && (
          <div className="modal-backdrop" onMouseDown={() => setShowToolGuide(false)}>
            <div className="modal info-modal" onMouseDown={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <h2>
                    <Info size={17} />
                    Tool Guide
                  </h2>
                  <p className="muted">Core functions and usage notes.</p>
                </div>
                <button className="icon-only" onClick={() => setShowToolGuide(false)} title="Close guide">
                  <X size={18} />
                </button>
              </header>
              <div className="info-modal-body">
                {TOOL_GUIDE_SECTIONS.map((section) => {
                  const SectionIcon = section.icon;
                  return (
                    <section className="info-section" key={section.title}>
                      <div className="info-section-title">
                        <span className="info-section-icon">
                          <SectionIcon size={15} />
                        </span>
                        <h3>{section.title}</h3>
                      </div>
                      <ul>
                        {section.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
              <footer>
                <button className="primary" onClick={() => setShowToolGuide(false)}>
                  Close
                </button>
              </footer>
            </div>
          </div>
        )}
        {showVersionLog && (
          <div className="modal-backdrop" onMouseDown={() => setShowVersionLog(false)}>
            <div className="modal info-modal" onMouseDown={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <h2>
                    <History size={17} />
                    Version Log
                  </h2>
                  <p className="muted">Recent update highlights from the changelog.</p>
                </div>
                <button className="icon-only" onClick={() => setShowVersionLog(false)} title="Close version log">
                  <X size={18} />
                </button>
              </header>
              <div className="info-modal-body version-log-list">
                {VERSION_LOG_ENTRIES.map((entry) => {
                  const EntryIcon = entry.icon;
                  return (
                    <section className="info-section version-log-entry" key={entry.version}>
                      <div className="version-log-title">
                        <span className="info-section-icon">
                          <EntryIcon size={15} />
                        </span>
                        <span className="version-log-version">{entry.version}</span>
                        <h3>{entry.title}</h3>
                      </div>
                      <ul>
                        {entry.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
              <footer>
                <button className="primary" onClick={() => setShowVersionLog(false)}>
                  Close
                </button>
              </footer>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
