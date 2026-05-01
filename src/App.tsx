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
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { checkFfmpegStatus, pickLocalVideo, probeDriveLink, readReleaseLog, scanDriveFolder, startStreamJob, stopAllStreams, stopStreamJob } from "./api";
import type { ReleaseLogEntry, StreamEvent, StreamJob } from "./types";
import releaseLogMarkdown from "../RELEASE.md?raw";
import { getJobDriveUrls, uniqueDriveUrls, driveFileKey, hasDriveValue, parseDriveLinks, type DriveLibraryItem, type DriveMetadataStatus } from "./features/drive/drive-utils";
import { appendDriveLinks, applyGroupToDriveLinks, markDriveMetadataPending, removeDriveLinkById, removeSelectedDriveLinks } from "./features/drive/actions";
import { persistDriveLibrary, persistJobs, persistTheme, readDriveLibrary, readJobs, readTheme } from "./features/app/storage";
import { findDueScheduledJob } from "./features/streams/scheduler";
import { buildCancelledScheduleUpdate, buildScheduledUpdate, buildStoppedUpdate, validateStartJob } from "./features/streams/actions";
import { filterConfigDriveRows, filterLibraryRows, filterQueueRows } from "./features/streams/selectors";
import { useDriveMetadataScanner } from "./features/drive/useDriveMetadataScanner";
import { now } from "./utils/time";
import { SmartFilterDropdown, type DropdownOption } from "./components/SmartFilterDropdown";
import { SourceBadge, StatusBadge } from "./components/StatusBadges";

type Theme = "dark" | "light";
type View = "streams" | "library";

const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
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
const VERSION_LOG_FALLBACK: ReleaseLogEntry[] = parseReleaseLogEntries(releaseLogMarkdown, 20);

function parseReleaseLogEntries(markdown: string, maxEntries = 20): ReleaseLogEntry[] {
  const source = String(markdown || "");
  const sections = source.split(/\r?\n(?=## )/g);
  const entries: ReleaseLogEntry[] = [];
  for (const section of sections) {
    const headingMatch = section.match(/^##\s+(\d{4}-\d{2}-\d{2})\s+-\s+(.+)$/m);
    if (!headingMatch) continue;
    const date = headingMatch[1];
    const title = headingMatch[2].trim();
    const versionMatch = section.match(/^- Version:\s*`?([0-9]+\.[0-9]+\.[0-9]+)`?\s*$/m);
    const timestampMatch = section.match(/^- Timestamp:\s*(.+)\s*$/m);
    const changesMatch = section.match(/### Changes\s*\r?\n([\s\S]*?)(?:\r?\n### |\s*$)/);
    if (!changesMatch) continue;
    const items = changesMatch[1]
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .filter(Boolean)
      .slice(0, 6);
    if (items.length === 0) continue;
    entries.push({
      version: (versionMatch && versionMatch[1]) || date,
      timestamp: (timestampMatch && timestampMatch[1] && timestampMatch[1].trim()) || `${date} 00:00`,
      title,
      items
    });
    if (entries.length >= maxEntries) break;
  }
  return entries;
}

type LogLine = { id: string; time: string; level: "info" | "success" | "error"; message: string };

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
  const [selectedDriveIds, setSelectedDriveIds] = useState<Set<string>>(new Set());
  const [lastLibraryPickIndex, setLastLibraryPickIndex] = useState<number | null>(null);
  const [driveDraft, setDriveDraft] = useState("");
  const [driveGroupDraft, setDriveGroupDraft] = useState("Default");
  const [bulkGroupDraft, setBulkGroupDraft] = useState("Default");
  const [driveFolderDraft, setDriveFolderDraft] = useState("");
  const [driveScanBusy, setDriveScanBusy] = useState(false);
  const [metadataLoadingIds, setMetadataLoadingIds] = useState<string[]>([]);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatusFilter, setQueueStatusFilter] = useState<string[]>(["all"]);
  const [queueSourceFilter, setQueueSourceFilter] = useState<string[]>(["all"]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryGroupFilter, setLibraryGroupFilter] = useState("all");
  const [libraryResolutionFilter, setLibraryResolutionFilter] = useState("all");
  const [libraryDurationFilter] = useState("all");
  const [configDriveSearch, setConfigDriveSearch] = useState("");
  const [configDriveGroupFilter, setConfigDriveGroupFilter] = useState("all");
  const [queuePage, setQueuePage] = useState(1);
  const [queuePageSize, setQueuePageSize] = useState(20);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageSize, setLibraryPageSize] = useState(20);
  const [showToolGuide, setShowToolGuide] = useState(false);
  const [showVersionLog, setShowVersionLog] = useState(false);
  const [versionLogEntries, setVersionLogEntries] = useState<ReleaseLogEntry[]>(() => VERSION_LOG_FALLBACK);
  const [lastDrivePickIndex, setLastDrivePickIndex] = useState<number | null>(null);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0];
  const selectedJobDriveUrls = getJobDriveUrls(selectedJob);
  const selectedJobDriveKeys = new Set(selectedJobDriveUrls.map((url) => driveFileKey(url)));
  const runningCount = jobs.filter((job) => job.status === "running").length;
  const scheduledCount = jobs.filter((job) => job.status === "scheduled").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const readyCount = jobs.filter((job) => job.status === "idle").length;
  const queueRows = useMemo(() => filterQueueRows(jobs, queueSearch, queueStatusFilter, queueSourceFilter), [jobs, queueSearch, queueSourceFilter, queueStatusFilter]);
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
  const libraryRows = useMemo(
    () => filterLibraryRows(driveLibrary, librarySearch, libraryGroupFilter, libraryResolutionFilter, libraryDurationFilter),
    [driveLibrary, libraryDurationFilter, libraryGroupFilter, libraryResolutionFilter, librarySearch]
  );
  const libraryTotalPages = Math.max(1, Math.ceil(libraryRows.length / libraryPageSize));
  const libraryPageStart = (libraryPage - 1) * libraryPageSize;
  const libraryPageEnd = Math.min(libraryPageStart + libraryPageSize, libraryRows.length);
  const libraryPagedRows = libraryRows.slice(libraryPageStart, libraryPageEnd);
  const configDriveRows = useMemo(() => filterConfigDriveRows(driveLibrary, configDriveSearch, configDriveGroupFilter), [configDriveGroupFilter, configDriveSearch, driveLibrary]);
  const metadataReadyCount = driveLibrary.filter((item) => item.metadataStatus === "ready" || item.metadataStatus === "partial").length;
  const selectedLibraryCount = selectedDriveIds.size;

  useEffect(() => {
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    persistJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    persistDriveLibrary(driveLibrary);
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
    readReleaseLog()
      .then((result) => {
        if (result.ok && Array.isArray(result.entries) && result.entries.length > 0) {
          setVersionLogEntries(result.entries);
          return;
        }
        const fallbackEntries = parseReleaseLogEntries(releaseLogMarkdown, 20);
        if (fallbackEntries.length > 0) setVersionLogEntries(fallbackEntries);
      })
      .catch(() => {
        const fallbackEntries = parseReleaseLogEntries(releaseLogMarkdown, 20);
        if (fallbackEntries.length > 0) setVersionLogEntries(fallbackEntries);
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
      const dueJob = findDueScheduledJob(jobs);
      if (dueJob) {
        addLog("info", `Scheduled start triggered for ${dueJob.channelName}`);
        void startOne(dueJob);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  // startOne is intentionally omitted to avoid resetting this scheduler on each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, ffmpegStatus, jobs]);

  useDriveMetadataScanner({
    driveLibrary,
    metadataLoadingIds,
    setMetadataLoadingIds,
    setDriveLibrary,
    setError,
    probeDriveLink
  });

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
      publishMode: "immediate",
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
      const driveUrls = getJobDriveUrls(job);
      const validationError = validateStartJob(job, driveUrls);
      if (validationError) throw new Error(validationError);
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
      setJobs((items) => items.map((item) => (item.id === jobId ? { ...item, ...buildStoppedUpdate("Stopped") } : item)));
    } catch (stopError) {
      addLog("error", stopError instanceof Error ? stopError.message : "Unable to stop stream.");
    }
  }

  async function startAll() {
    await Promise.all(jobs.map((job) => startOne(job)));
  }

  async function stopAll() {
    await stopAllStreams();
    setJobs((items) => items.map((item) => ({ ...item, ...buildStoppedUpdate("Stopped all") })));
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
    if (!selectedJob || selectedJob.publishMode !== "scheduled" || !selectedJob.scheduledAt) {
      setError("Pick a schedule time first.");
      return;
    }
    const scheduledTime = new Date(selectedJob.scheduledAt).getTime();
    if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
      setError("Schedule time must be in the future.");
      return;
    }
    setError("");
    updateSelectedJob(buildScheduledUpdate(selectedJob.scheduledAt));
    addLog("info", `${selectedJob.channelName} scheduled for ${new Date(selectedJob.scheduledAt).toLocaleString()}`);
  }

  function cancelSelectedSchedule() {
    if (!selectedJob) return;
    updateSelectedJob(buildCancelledScheduleUpdate());
    addLog("info", `${selectedJob.channelName} schedule cancelled`);
  }


  function addDriveLinks(urls = parseDriveLinks(driveDraft)) {
    if (urls.length === 0) return;
    setDriveLibrary((items) => appendDriveLinks(items, urls, driveGroupDraft));
    setDriveDraft("");
    setDriveGroupDraft("Default");
    setDriveFolderDraft("");
    setDriveModalOpen(false);
  }

  function applyDriveLibraryItem(item: DriveLibraryItem, rowIndex: number, event?: MouseEvent<HTMLTableRowElement>) {
    if (event?.shiftKey && lastDrivePickIndex !== null) {
      const start = Math.min(lastDrivePickIndex, rowIndex);
      const end = Math.max(lastDrivePickIndex, rowIndex);
      const rangeUrls = configDriveRows.slice(start, end + 1).map((entry) => entry.url);
      if (event.metaKey || event.ctrlKey) {
        updateSelectedDriveUrls([...selectedJobDriveUrls, ...rangeUrls]);
      } else {
        updateSelectedDriveUrls(rangeUrls);
      }
      setSelectedDriveId(item.id);
      setLastDrivePickIndex(rowIndex);
      return;
    }

    const key = driveFileKey(item.url);
    const nextUrls = selectedJobDriveKeys.has(key) ? selectedJobDriveUrls.filter((url) => driveFileKey(url) !== key) : [...selectedJobDriveUrls, item.url];
    updateSelectedDriveUrls(nextUrls);
    setSelectedDriveId(item.id);
    setLastDrivePickIndex(rowIndex);
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
    setDriveLibrary((items) => removeDriveLinkById(items, id));
    if (selectedDriveId === id) setSelectedDriveId("");
    setSelectedDriveIds((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  function removeSelectedDriveLink() {
    if (selectedDriveIds.size === 0) return;
    setDriveLibrary((items) => removeSelectedDriveLinks(items, selectedDriveIds));
    setSelectedDriveId("");
    setSelectedDriveIds(new Set());
  }

  function applyGroupToSelectedDriveLinks() {
    const group = bulkGroupDraft.trim();
    if (!group || selectedDriveIds.size === 0) return;
    setDriveLibrary((items) => applyGroupToDriveLinks(items, selectedDriveIds, group));
  }

  function handleLibraryRowSelection(itemId: string, rowIndex: number, event?: MouseEvent<HTMLTableRowElement>) {
    if (event?.shiftKey && lastLibraryPickIndex !== null) {
      const start = Math.min(lastLibraryPickIndex, rowIndex);
      const end = Math.max(lastLibraryPickIndex, rowIndex);
      const rangeIds = libraryPagedRows.slice(start, end + 1).map((item) => item.id);
      setSelectedDriveIds((current) => {
        const next = event.metaKey || event.ctrlKey ? new Set(current) : new Set<string>();
        rangeIds.forEach((id) => next.add(id));
        return next;
      });
      setSelectedDriveId(itemId);
      setLastLibraryPickIndex(rowIndex);
      return;
    }

    setSelectedDriveIds((current) => {
      const next = new Set(current);
      if (event?.metaKey || event?.ctrlKey) {
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
      } else {
        if (next.size === 1 && next.has(itemId)) {
          next.clear();
        } else {
          next.clear();
          next.add(itemId);
        }
      }
      return next;
    });
    setSelectedDriveId(itemId);
    setLastLibraryPickIndex(rowIndex);
  }

  async function copyDriveUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      addLog("success", "Drive URL copied.");
    } catch {
      setError("Unable to copy Drive URL.");
    }
  }

  function refreshDriveMetadata(id: string) {
    setDriveLibrary((items) => items.map((item) => (item.id === id ? markDriveMetadataPending(item) : item)));
  }

  function refreshAllDriveMetadata() {
    setDriveLibrary((items) => items.map((item) => markDriveMetadataPending(item)));
  }

  function metadataStatusLabel(status: DriveMetadataStatus) {
    if (status === "scanning") return "Scanning";
    if (status === "ready") return "Ready";
    if (status === "partial") return "Partial";
    if (status === "error") return "No metadata";
    return "Pending";
  }

  const ffmpegPillClass = ffmpegStatus === "ok" ? "connected" : ffmpegStatus === "missing" ? "offline" : "";
  const ffmpegPillLabel = ffmpegStatus === "ok" ? "ffmpeg ready" : ffmpegStatus === "missing" ? "ffmpeg missing" : "checking ffmpeg";
  const queueStatusOptions: DropdownOption[] = [
    { value: "all", label: "All", tone: "all" },
    { value: "idle", label: "Ready", tone: "idle" },
    { value: "running", label: "Running", tone: "running" },
    { value: "scheduled", label: "Schedule", tone: "scheduled" },
    { value: "failed", label: "Failed", tone: "failed" }
  ];
  const queueSourceOptions: DropdownOption[] = [
    { value: "all", label: "All", tone: "all" },
    { value: "local", label: "Local file", tone: "local" },
    { value: "drive", label: "Google Drive", tone: "drive" }
  ];
  const sourceTypeOptions: DropdownOption[] = [
    { value: "local", label: "Local file", tone: "local" },
    { value: "drive", label: "Google Drive", tone: "drive" }
  ];
  const drivePlayModeOptions: DropdownOption[] = [
    { value: "sequential", label: "Loop", tone: "scheduled" },
    { value: "random", label: "Random", tone: "running" }
  ];
  const publishModeOptions: DropdownOption[] = [
    { value: "immediate", label: "Publish now", tone: "running" },
    { value: "scheduled", label: "Schedule", tone: "scheduled" }
  ];
  const tablePageSizeDropdownOptions: DropdownOption[] = TABLE_PAGE_SIZE_OPTIONS.map((size) => ({
    value: String(size),
    label: `${size}`
  }));
  const libraryResolutionDropdownOptions: DropdownOption[] = [
    { value: "all", label: "All" },
    ...libraryResolutionOptions.map((resolution) => ({ value: resolution, label: resolution }))
  ];
  const libraryGroupDropdownOptions: DropdownOption[] = [
    { value: "all", label: "All" },
    ...libraryGroupOptions.map((group) => ({ value: group, label: group }))
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
            <button className="ghost slim-button" onClick={() => setShowVersionLog(true)} title="Release update log">
              <History size={16} />
              Release Log
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
              <SmartFilterDropdown value={queueStatusFilter} options={queueStatusOptions} label="Status" searchLabel="Search status..." multiple onChange={(value) => setQueueStatusFilter(Array.isArray(value) ? value : [value])} />
              <SmartFilterDropdown
                value={queueSourceFilter}
                options={queueSourceOptions}
                label="Source"
                searchLabel="Search source..."
                multiple
                onChange={(value) => setQueueSourceFilter(Array.isArray(value) ? value : [value])}
              />
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
                    <SmartFilterDropdown
                      value={String(queuePageSize)}
                      options={tablePageSizeDropdownOptions}
                      label="Rows per page"
                      searchLabel="Search page size..."
                      onChange={(value) => setQueuePageSize(Number(value))}
                    />
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
                  <div className="stream-config-body">
                  <div className="config-sections">
                    <section className="config-frame source-config-frame">
                      <h3 className="config-frame-title">
                        <HardDrive size={13} />
                        Source Settings
                      </h3>
                      <div className="source-basic-grid">
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
                        <label className="run-mode-field">
                          Run mode
                          <SmartFilterDropdown
                            value={selectedJob.drivePlayMode || "sequential"}
                            options={drivePlayModeOptions}
                            label="Run mode"
                            searchLabel="Search mode..."
                            onChange={(value) => updateSelectedJob({ drivePlayMode: value as StreamJob["drivePlayMode"] })}
                          />
                        </label>
                      </div>
                      {selectedJob.sourceType === "local" ? (
                        <div className="source-details-area">
                          <label className="source-local-field">
                            Local file path
                            <div className="inline-row">
                              <input value={selectedJob.localPath} onChange={(event) => updateSelectedJob({ localPath: event.target.value })} placeholder="D:\\videos\\sample.mp4" />
                              <button className="ghost slim-button" onClick={pickSourceFile}>
                                <Upload size={14} />
                                Pick
                              </button>
                            </div>
                          </label>
                        </div>
                      ) : (
                        <div className="source-details-area">
                          <div className="drive-config-picker">
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
                              <button className="ghost slim-button" onClick={() => setDrivePickerOpen(true)}>
                                <Files size={14} />
                                Choose from Drive Library
                              </button>
                              <span className="drive-selected-chip drive-selection-inline">
                                <Cloud size={12} />
                                <span>{selectedJobDriveUrls.length}/{driveLibrary.length} videos selected</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="config-frame">
                      <h3 className="config-frame-title">
                        <Settings size={13} />
                        Output & Stream Key
                      </h3>
                      <div className="output-grid">
                        <label>
                          Primary RTMP URL (full URL)
                          <input
                            value={selectedJob.primaryRtmpUrl}
                            onChange={(event) => updateSelectedJob({ primaryRtmpUrl: event.target.value })}
                            placeholder="rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx..."
                          />
                        </label>
                        <label>
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
                      </div>
                    </section>

                    <section className="config-frame">
                      <h3 className="config-frame-title">
                        <CalendarClock size={13} />
                        Schedule
                      </h3>
                      <label className="schedule-mode-field">
                        Publish mode
                        <SmartFilterDropdown
                          value={selectedJob.publishMode || "immediate"}
                          options={publishModeOptions}
                          label="Publish mode"
                          searchLabel="Search publish mode..."
                          onChange={(value) => {
                            const nextMode = value as StreamJob["publishMode"];
                            if (nextMode === "immediate") {
                              if (selectedJob.status === "scheduled") {
                                updateSelectedJob({ publishMode: "immediate", ...buildCancelledScheduleUpdate(), lastMessage: "Ready" });
                                return;
                              }
                              updateSelectedJob({ publishMode: "immediate", scheduledAt: "" });
                              return;
                            }
                            updateSelectedJob({ publishMode: "scheduled" });
                          }}
                        />
                      </label>
                      <div className="schedule-grid">
                        {(selectedJob.publishMode || "immediate") === "scheduled" ? (
                          <label>
                            Schedule time
                            <input
                              type="datetime-local"
                              value={selectedJob.scheduledAt || ""}
                              onChange={(event) => updateSelectedJob({ scheduledAt: event.target.value })}
                            />
                          </label>
                        ) : (
                          <span className="schedule-mode-hint">Publish now: stream starts when you click Start selected.</span>
                        )}
                      </div>
                      {(selectedJob.publishMode || "immediate") === "scheduled" && (
                        <div className="schedule-actions">
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
                        </div>
                      )}
                    </section>
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
                <input value={bulkGroupDraft} onChange={(event) => setBulkGroupDraft(event.target.value)} placeholder="Group name" list="drive-groups" />
                <button className="ghost slim-button" onClick={applyGroupToSelectedDriveLinks} disabled={selectedLibraryCount === 0 || !bulkGroupDraft.trim()}>
                  <FolderOpen size={14} />
                  Apply group
                </button>
                <button className="danger slim-button" onClick={removeSelectedDriveLink} disabled={selectedLibraryCount === 0}>
                  <Trash2 size={14} />
                  Delete ({selectedLibraryCount})
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
                label="Group"
                searchLabel="Search groups..."
                onChange={setLibraryGroupFilter}
              />
              <SmartFilterDropdown
                value={libraryResolutionFilter}
                options={libraryResolutionDropdownOptions}
                label="Resolution"
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
                  {libraryPagedRows.map((item, index) => (
                    <tr
                      key={item.id}
                      className={selectedDriveIds.has(item.id) || selectedJob?.driveUrl === item.url ? "queue-row active" : "queue-row"}
                      onClick={(event) => handleLibraryRowSelection(item.id, index, event)}
                      title="Click to select, Ctrl/Cmd-click to toggle, Shift-click to range select"
                    >
                      <td>
                        <div className="drive-file-cell">
                          <strong className="drive-file-name" title={item.name}>
                            {metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning" ? "Scanning metadata..." : item.name}
                          </strong>
                          <button
                            className="library-link"
                            title="Click to copy Drive URL"
                            onClick={(event) => {
                              event.stopPropagation();
                              void copyDriveUrl(item.url);
                            }}
                          >
                            <HardDrive size={12} />
                            <span>{item.url}</span>
                          </button>
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
                    <SmartFilterDropdown
                      value={String(libraryPageSize)}
                      options={tablePageSizeDropdownOptions}
                      label="Rows per page"
                      searchLabel="Search page size..."
                      onChange={(value) => setLibraryPageSize(Number(value))}
                    />
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
                  label="Group"
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
                    {configDriveRows.map((item, index) => {
                      const selected = selectedJobDriveKeys.has(driveFileKey(item.url));
                      return (
                        <tr
                          key={item.id}
                          className={selected ? "queue-row active" : "queue-row"}
                          onClick={(event) => applyDriveLibraryItem(item, index, event)}
                          title="Click to toggle, Shift-click for range"
                        >
                          <td>
                            <div className="drive-file-cell drive-picker-file-cell">
                              <strong className="drive-file-name" title={item.name}>
                                {metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning" ? "Scanning metadata..." : item.name}
                              </strong>
                              <span className="library-link" title={item.url}>
                                <Cloud size={12} />
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
              <div className="modal-form drive-modal-form">
                <label className="span-2 drive-links-field">
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
              <div className="modal-actions modal-actions-centered">
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
                    Release Log
                  </h2>
                  <p className="muted">Recent update highlights from the release log.</p>
                </div>
                <button className="icon-only" onClick={() => setShowVersionLog(false)} title="Close version log">
                  <X size={18} />
                </button>
              </header>
              <div className="info-modal-body version-log-list">
                {versionLogEntries.length === 0 && <p className="muted">No release entries loaded yet.</p>}
                {versionLogEntries.map((entry, index) => {
                  const EntryIcon = index % 3 === 0 ? RefreshCw : index % 3 === 1 ? CheckCircle2 : BookOpen;
                  return (
                    <section className="info-section version-log-entry" key={`${entry.version}-${entry.title}`}>
                      <div className="version-log-title">
                        <span className="info-section-icon">
                          <EntryIcon size={15} />
                        </span>
                        <span className="version-log-version">{entry.version}</span>
                        <span className="version-log-timestamp">{entry.timestamp}</span>
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
