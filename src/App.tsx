import {
  BookOpen,
  CalendarDays,
  CalendarClock,
  Check,
  Clock3,
  CircleCheckBig,
  CheckCircle2,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  CircleAlert,
  Info,
  Copy,
  Files,
  FolderOpen,
  HardDrive,
  MessageCircle,
  Play,
  Link2,
  Pencil,
  Settings,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Tv,
  X,
  XCircle,
  Zap
} from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { checkFfmpegStatus, pickLocalVideo, probeDriveLink, readReleaseLog, scanDriveFolder, startStreamJob, stopAllStreams, stopStreamJob } from "./api";
import type { ReleaseLogEntry, StreamEvent, StreamJob } from "./types";
import releaseLogMarkdown from "../RELEASE.md?raw";
import {
  driveFileKey,
  getJobDriveUrls,
  hasDriveValue,
  parseDriveLinks,
  type DriveMetadataStatus,
  uniqueDriveUrls,
  type DriveLibraryItem
} from "./features/drive/drive-utils";
import { appendDriveLinks, applyGroupToDriveLinks, markDriveMetadataPending, removeDriveLinkById, removeSelectedDriveLinks } from "./features/drive/actions";
import { persistDriveLibrary, persistJobs, persistTheme, readDriveLibrary, readJobs, readTheme } from "./features/app/storage";
import { findDueScheduledJob } from "./features/streams/scheduler";
import { buildCancelledScheduleUpdate, buildScheduledUpdate, buildStoppedUpdate, validateStartJob } from "./features/streams/actions";
import { filterConfigDriveRows, filterLibraryRows, filterQueueRows } from "./features/streams/selectors";
import { toneFromSeed } from "./features/streams/dropdown-utils";
import { useDriveMetadataScanner } from "./features/drive/useDriveMetadataScanner";
import { now } from "./utils/time";
import { MultiSelectDropdown } from "./components/MultiSelectDropdown";
import { GroupApplyDropdown } from "./components/GroupApplyDropdown";
import { ScheduleDatetimeField } from "./components/ScheduleDatetimeField";
import { SmartFilterDropdown, type DropdownOption } from "./components/SmartFilterDropdown";
import { GoogleDriveBrandIcon } from "./components/GoogleDriveBrandIcon";
import { SourceBadge, StatusBadge } from "./components/StatusBadges";

function driveLibraryMetadataLabel(status: DriveMetadataStatus) {
  if (status === "scanning") return "Scanning";
  if (status === "ready") return "Ready";
  if (status === "partial") return "Partial";
  if (status === "error") return "No metadata";
  return "Pending";
}

/** GPM Profile–style inline status: icon + plain label (no pill). */
function DriveLibraryMetadataStatusIcon({ status, spinning }: { status: DriveMetadataStatus; spinning: boolean }) {
  if (status === "ready") return <CheckCircle2 size={13} aria-hidden />;
  if (status === "scanning") return <RefreshCw size={13} className={spinning ? "spinning" : ""} aria-hidden />;
  if (status === "partial") return <CircleAlert size={13} aria-hidden />;
  if (status === "error") return <XCircle size={13} aria-hidden />;
  return <Clock3 size={13} aria-hidden />;
}

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
  const [managedGroups, setManagedGroups] = useState<string[]>(["Default"]);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDraft, setGroupDraft] = useState("");
  const [selectedManagedGroup, setSelectedManagedGroup] = useState("Default");
  const [driveFolderDraft, setDriveFolderDraft] = useState("");
  const [driveScanBusy, setDriveScanBusy] = useState(false);
  const [metadataLoadingIds, setMetadataLoadingIds] = useState<string[]>([]);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatusFilter, setQueueStatusFilter] = useState<string[]>([]);
  const [queueSourceFilter, setQueueSourceFilter] = useState<string[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySelectedStatuses, setLibrarySelectedStatuses] = useState<string[]>([]);
  const [librarySelectedResolutions, setLibrarySelectedResolutions] = useState<string[]>([]);
  const [configDriveSearch, setConfigDriveSearch] = useState("");
  const [configDriveSelectedStatuses, setConfigDriveSelectedStatuses] = useState<string[]>([]);
  const [configDriveSelectedResolutions, setConfigDriveSelectedResolutions] = useState<string[]>([]);
  const [queuePage, setQueuePage] = useState(1);
  const [queuePageSize, setQueuePageSize] = useState(20);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageSize, setLibraryPageSize] = useState(20);
  const [showToolGuide, setShowToolGuide] = useState(false);
  const [showVersionLog, setShowVersionLog] = useState(false);
  const [versionLogEntries, setVersionLogEntries] = useState<ReleaseLogEntry[]>(() => VERSION_LOG_FALLBACK);
  const [lastDrivePickIndex, setLastDrivePickIndex] = useState<number | null>(null);
  const [libraryDragging, setLibraryDragging] = useState(false);
  const [libraryDragAnchorIndex, setLibraryDragAnchorIndex] = useState<number | null>(null);
  const [libraryDragAdditive, setLibraryDragAdditive] = useState(false);
  const [drivePickerDragging, setDrivePickerDragging] = useState(false);
  const [drivePickerDragAnchorIndex, setDrivePickerDragAnchorIndex] = useState<number | null>(null);
  const [drivePickerDragAdditive, setDrivePickerDragAdditive] = useState(false);

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
  const libraryGroupOptions = useMemo(() => Array.from(new Set(driveLibrary.map((item) => item.group).filter((value) => value && value !== "-"))), [driveLibrary]);
  const mergedGroupOptions = useMemo(() => Array.from(new Set(["Default", ...managedGroups, ...libraryGroupOptions])), [libraryGroupOptions, managedGroups]);
  const groupManagerRows = useMemo(() => {
    const term = groupSearch.trim().toLowerCase();
    return mergedGroupOptions
      .map((group) => ({
        group,
        count: driveLibrary.filter((item) => (item.group || "Default") === group).length,
        updatedAt:
          driveLibrary.find((item) => (item.group || "Default") === group)?.addedAt ||
          "-"
      }))
      .filter((row) => !term || row.group.toLowerCase().includes(term));
  }, [driveLibrary, groupSearch, mergedGroupOptions]);
  const libraryRows = useMemo(
    () => filterLibraryRows(driveLibrary, librarySearch, librarySelectedStatuses, librarySelectedResolutions),
    [driveLibrary, librarySearch, librarySelectedResolutions, librarySelectedStatuses]
  );
  const libraryTotalPages = Math.max(1, Math.ceil(libraryRows.length / libraryPageSize));
  const libraryPageStart = (libraryPage - 1) * libraryPageSize;
  const libraryPageEnd = Math.min(libraryPageStart + libraryPageSize, libraryRows.length);
  const libraryPagedRows = libraryRows.slice(libraryPageStart, libraryPageEnd);
  const configDriveRows = useMemo(
    () => filterConfigDriveRows(driveLibrary, configDriveSearch, configDriveSelectedStatuses, configDriveSelectedResolutions),
    [configDriveSearch, configDriveSelectedResolutions, configDriveSelectedStatuses, driveLibrary]
  );
  const metadataReadyCount = driveLibrary.filter((item) => item.metadataStatus === "ready" || item.metadataStatus === "partial").length;
  const selectedLibraryCount = selectedDriveIds.size;
  const selectedSourceCount = selectedJob ? (selectedJob.sourceType === "drive" ? selectedJobDriveUrls.length : selectedJob.localPath.trim() ? 1 : 0) : 0;
  const selectedSourceLabel = `${selectedSourceCount} video${selectedSourceCount === 1 ? "" : "s"} selected`;

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
    setManagedGroups((current) => Array.from(new Set(["Default", ...current, ...libraryGroupOptions])));
  }, [libraryGroupOptions]);

  useEffect(() => {
    if (!drivePickerDragging && !libraryDragging) return;
    const stopDragging = () => {
      setDrivePickerDragging(false);
      setDrivePickerDragAnchorIndex(null);
      setDrivePickerDragAdditive(false);
      setLibraryDragging(false);
      setLibraryDragAnchorIndex(null);
      setLibraryDragAdditive(false);
    };
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, [drivePickerDragging, libraryDragging]);

  useEffect(() => {
    if (view !== "library" || drivePickerOpen || driveModalOpen || groupManagerOpen) return;
    const handleLibraryHotkeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
      if (selectedDriveIds.size === 0) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault();
      setSelectedDriveIds(new Set(libraryRows.map((item) => item.id)));
      setSelectedDriveId(libraryRows[0]?.id || "");
      setLastLibraryPickIndex(libraryRows.length > 0 ? libraryRows.length - 1 : null);
    };
    window.addEventListener("keydown", handleLibraryHotkeys);
    return () => window.removeEventListener("keydown", handleLibraryHotkeys);
  }, [driveModalOpen, drivePickerOpen, groupManagerOpen, libraryRows, selectedDriveIds.size, view]);

  useEffect(() => {
    if (!drivePickerOpen || !selectedJob) return;
    const handlePickerHotkeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      updateSelectedDriveUrls(configDriveRows.map((item) => item.url));
      setLastDrivePickIndex(configDriveRows.length > 0 ? configDriveRows.length - 1 : null);
    };
    window.addEventListener("keydown", handlePickerHotkeys);
    return () => window.removeEventListener("keydown", handlePickerHotkeys);
  // updateSelectedDriveUrls is intentionally omitted to keep this hotkey listener stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configDriveRows, drivePickerOpen, selectedJob]);

  useEffect(() => {
    setQueuePage(1);
  }, [queueSearch, queueSourceFilter, queueStatusFilter]);

  useEffect(() => {
    if (queuePage > queueTotalPages) setQueuePage(queueTotalPages);
  }, [queuePage, queueTotalPages]);

  useEffect(() => {
    setLibraryPage(1);
  }, [librarySearch, librarySelectedResolutions, librarySelectedStatuses]);

  useEffect(() => {
    if (libraryPage > libraryTotalPages) setLibraryPage(libraryTotalPages);
  }, [libraryPage, libraryTotalPages]);

  useEffect(() => {
    if (!error) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setError("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [error]);

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

  function commitScheduledAtInput(raw: string) {
    if (!selectedJob || selectedJob.publishMode !== "scheduled") return;
    const name = selectedJob.channelName;

    if (!raw) {
      setError("");
      if (selectedJob.status === "scheduled") {
        updateSelectedJob(buildCancelledScheduleUpdate());
        addLog("info", `${name} schedule cancelled`);
      } else {
        updateSelectedJob({ scheduledAt: "" });
      }
      return;
    }

    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms) || ms <= Date.now()) {
      setError("Schedule time must be in the future.");
      updateSelectedJob({
        scheduledAt: raw,
        ...(selectedJob.status === "scheduled" ? { status: "idle" as const, lastMessage: "Ready", updatedAt: now() } : {})
      });
      return;
    }

    setError("");
    updateSelectedJob({ scheduledAt: raw, ...buildScheduledUpdate(raw) });
    addLog("info", `${name} scheduled for ${new Date(raw).toLocaleString()}`);
  }

  function addDriveLinks(urls = parseDriveLinks(driveDraft)) {
    if (urls.length === 0) return;
    setDriveLibrary((items) => appendDriveLinks(items, urls, driveGroupDraft));
    setDriveDraft("");
    setDriveGroupDraft("Default");
    setDriveFolderDraft("");
    setDriveModalOpen(false);
  }

  function selectDrivePickerRange(anchorIndex: number, rowIndex: number, additive: boolean) {
    const start = Math.min(anchorIndex, rowIndex);
    const end = Math.max(anchorIndex, rowIndex);
    const rangeUrls = configDriveRows.slice(start, end + 1).map((entry) => entry.url);
    if (additive) {
      updateSelectedDriveUrls([...selectedJobDriveUrls, ...rangeUrls]);
      return;
    }
    updateSelectedDriveUrls(rangeUrls);
  }

  function applyDriveLibraryItem(item: DriveLibraryItem, rowIndex: number, event: MouseEvent<HTMLTableRowElement>) {
    const additive = event.metaKey || event.ctrlKey;
    event.preventDefault();
    if (event.shiftKey && lastDrivePickIndex !== null) {
      selectDrivePickerRange(lastDrivePickIndex, rowIndex, additive);
    } else if (additive) {
      const key = driveFileKey(item.url);
      const nextUrls = selectedJobDriveKeys.has(key) ? selectedJobDriveUrls.filter((url) => driveFileKey(url) !== key) : [...selectedJobDriveUrls, item.url];
      updateSelectedDriveUrls(nextUrls);
    } else {
      updateSelectedDriveUrls([item.url]);
    }
    setDrivePickerDragging(true);
    setDrivePickerDragAnchorIndex(rowIndex);
    setDrivePickerDragAdditive(additive);
    setSelectedDriveId(item.id);
    setLastDrivePickIndex(rowIndex);
  }

  function extendDrivePickerSelection(item: DriveLibraryItem, rowIndex: number) {
    if (!drivePickerDragging || drivePickerDragAnchorIndex === null) return;
    selectDrivePickerRange(drivePickerDragAnchorIndex, rowIndex, drivePickerDragAdditive);
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
      setDriveDraft((current) => uniqueDriveUrls([...parseDriveLinks(current), ...result.links]).join("\n"));
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

  function applyGroupToSelectedDriveLinks(groupName?: string) {
    const group = (groupName || selectedManagedGroup).trim();
    if (!group || selectedDriveIds.size === 0) return;
    setDriveLibrary((items) => applyGroupToDriveLinks(items, selectedDriveIds, group));
  }

  function applyGroupsToSelectedDriveLinks(groups: string[]) {
    const nextGroups = groups.map((group) => group.trim()).filter(Boolean);
    if (nextGroups.length === 0 || selectedDriveIds.size === 0) return;
    const selectedIdsInOrder = libraryRows.map((item) => item.id).filter((id) => selectedDriveIds.has(id));
    if (selectedIdsInOrder.length === 0) return;
    const groupMap = new Map<string, string>();
    selectedIdsInOrder.forEach((id, index) => {
      groupMap.set(id, nextGroups[index % nextGroups.length]);
    });
    setDriveLibrary((items) => items.map((item) => (groupMap.has(item.id) ? { ...item, group: groupMap.get(item.id) || item.group } : item)));
    setSelectedManagedGroup(nextGroups[0]);
    setDriveGroupDraft(nextGroups[0]);
  }

  function addManagedGroup() {
    const nextGroup = groupDraft.trim();
    if (!nextGroup) return;
    setManagedGroups((groups) => Array.from(new Set([...groups, nextGroup])));
    setSelectedManagedGroup(nextGroup);
    setDriveGroupDraft(nextGroup);
    setGroupDraft("");
  }

  function renameManagedGroup() {
    const nextGroup = groupDraft.trim();
    if (!nextGroup || !selectedManagedGroup || selectedManagedGroup === "Default") return;
    const fromGroup = selectedManagedGroup;
    setManagedGroups((groups) => Array.from(new Set(groups.map((group) => (group === fromGroup ? nextGroup : group)))));
    setDriveLibrary((items) => items.map((item) => ((item.group || "Default") === fromGroup ? { ...item, group: nextGroup } : item)));
    if (driveGroupDraft === fromGroup) setDriveGroupDraft(nextGroup);
    setSelectedManagedGroup(nextGroup);
    setGroupDraft("");
  }

  function deleteManagedGroup() {
    if (!selectedManagedGroup || selectedManagedGroup === "Default") return;
    const targetGroup = selectedManagedGroup;
    setManagedGroups((groups) => groups.filter((group) => group !== targetGroup));
    setDriveLibrary((items) => items.map((item) => ((item.group || "Default") === targetGroup ? { ...item, group: "Default" } : item)));
    if (driveGroupDraft === targetGroup) setDriveGroupDraft("Default");
    setSelectedManagedGroup("Default");
  }

  function selectLibraryRange(anchorIndex: number, rowIndex: number, additive: boolean) {
    const start = Math.min(anchorIndex, rowIndex);
    const end = Math.max(anchorIndex, rowIndex);
    const rangeIds = libraryPagedRows.slice(start, end + 1).map((item) => item.id);
    setSelectedDriveIds((current) => {
      const next = additive ? new Set(current) : new Set<string>();
      rangeIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function handleLibraryRowSelection(itemId: string, rowIndex: number, event: MouseEvent<HTMLTableRowElement>) {
    event.preventDefault();
    const additive = event.metaKey || event.ctrlKey;
    if (event.shiftKey && lastLibraryPickIndex !== null) {
      selectLibraryRange(lastLibraryPickIndex, rowIndex, additive);
      setSelectedDriveId(itemId);
      setLastLibraryPickIndex(rowIndex);
      setLibraryDragging(true);
      setLibraryDragAnchorIndex(lastLibraryPickIndex);
      setLibraryDragAdditive(additive);
      return;
    }

    setSelectedDriveIds((current) => {
      const next = new Set(current);
      if (additive) {
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
      } else {
        next.clear();
        next.add(itemId);
      }
      return next;
    });
    setSelectedDriveId(itemId);
    setLastLibraryPickIndex(rowIndex);
    setLibraryDragging(true);
    setLibraryDragAnchorIndex(rowIndex);
    setLibraryDragAdditive(additive);
  }

  function extendLibraryRowSelection(itemId: string, rowIndex: number) {
    if (!libraryDragging || libraryDragAnchorIndex === null) return;
    selectLibraryRange(libraryDragAnchorIndex, rowIndex, libraryDragAdditive);
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

  const ffmpegPillClass = ffmpegStatus === "ok" ? "connected" : ffmpegStatus === "missing" ? "offline" : "";
  const ffmpegPillLabel = ffmpegStatus === "ok" ? "ffmpeg ready" : ffmpegStatus === "missing" ? "ffmpeg missing" : "checking ffmpeg";
  const queueStatusOptions = [
    { value: "idle", label: "Ready", tone: "ready" as const },
    { value: "running", label: "Running", tone: "running" as const },
    { value: "scheduled", label: "Schedule", tone: "opening" as const },
    { value: "failed", label: "Failed", tone: "failed" as const }
  ];
  const queueSourceOptions = [
    { value: "local", label: "Local file", tone: "local" as const },
    { value: "drive", label: "Google Drive", tone: "drive" as const }
  ];
  const sourceTypeOptions: DropdownOption[] = [
    { value: "local", label: "Local file", tone: "local" },
    { value: "drive", label: "Google Drive", tone: "drive" }
  ];
  const drivePlayModeOptions: DropdownOption[] = [
    { value: "sequential", label: "Loop", tone: "loop" },
    { value: "random", label: "Random", tone: "shuffle" }
  ];
  const publishModeOptions: DropdownOption[] = [
    { value: "immediate", label: "Publish", tone: "immediate" },
    { value: "scheduled", label: "Schedule", tone: "scheduled" }
  ];
  const libraryDriveMetadataStatusFilterOptions = useMemo(
    () => [
      { value: "pending", label: "Pending", tone: "pending" as const },
      { value: "scanning", label: "Scanning", tone: "scanning" as const },
      { value: "ready", label: "Ready", tone: "ready" as const },
      { value: "partial", label: "Partial", tone: "partial" as const },
      { value: "error", label: "No metadata", tone: "failed" as const }
    ],
    []
  );
  const libraryDriveResolutionFilterOptions = useMemo(
    () =>
      libraryResolutionOptions.map((resolution) => ({
        value: resolution,
        label: resolution,
        tone: "platform" as const,
        dotTone: toneFromSeed(`drive-resolution:${resolution}`)
      })),
    [libraryResolutionOptions]
  );
  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand-mark">YT</div>
        <nav>
          <button className={view === "streams" ? "active" : ""} title="Streams" onClick={() => setView("streams")}>
            <Tv size={18} />
          </button>
          <button className={view === "library" ? "active" : ""} title="Drive Library" onClick={() => setView("library")}>
            <GoogleDriveBrandIcon size={18} />
          </button>
        </nav>
        <div className={`api-dot ${ffmpegStatus === "ok" ? "connected" : ffmpegStatus === "missing" ? "offline" : "checking"}`}>
          {ffmpegStatus === "ok" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
        </div>
      </aside>

      <main className="workspace shell">
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

        {view === "streams" && (
          <section className="layout">
          <div className="left-pane card">
            <div className="table-header-top">
              <h2>Channel Queue</h2>
              <span>{queueRows.length} of {jobs.length} channels</span>
            </div>
            <div className="metrics table-header-stats">
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
            <div className="queue-filters table-header-filters profile-filters">
              <label className="input with-icon">
                <Search size={15} />
                <input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search channels" />
              </label>
              <MultiSelectDropdown
                values={queueStatusFilter}
                options={queueStatusOptions}
                label="Status"
                searchLabel="Search statuses..."
                summaryLabel="statuses"
                defaultTone="status"
                onChange={setQueueStatusFilter}
              />
              <MultiSelectDropdown
                values={queueSourceFilter}
                options={queueSourceOptions}
                label="Source"
                searchLabel="Search sources..."
                summaryLabel="sources"
                defaultTone="source"
                onChange={setQueueSourceFilter}
              />
            </div>
            <div className="table-header-actions profile-table-header-actions">
              <div className="toolbar profile-table-header-buttons">
                <button className="ghost compact profile-header-btn-run" onClick={startAll} disabled={busy || ffmpegStatus !== "ok"}>
                  <Play size={14} />
                  Run
                </button>
                <button className="ghost compact profile-header-btn-close" onClick={stopAll}>
                  <Square size={12} />
                  Close
                </button>
                <button className="ghost compact profile-header-btn-new" onClick={addJob}>
                  <Plus size={14} />
                  New
                </button>
                <button className="ghost compact profile-header-btn-delete" onClick={deleteSelectedJob} disabled={!selectedJob || jobs.length <= 1}>
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
              <div className="profile-table-header-summary">
                <button className="icon-only" onClick={() => setSelectedJobId("")} title="Clear selection" disabled={!selectedJob}>
                  <X size={16} />
                </button>
                <span>{selectedJob ? "1 selected" : "0 selected"}</span>
                <button className="ghost compact" onClick={copySelectedJob} disabled={!selectedJob}>
                  <Copy size={14} />
                  Copy
                </button>
              </div>
            </div>
            <div className="job-list">
              <div className="table-scroll table-wrap">
              <table className="queue-table row-select-table">
                <thead>
                  <tr>
                    <th>
                      <span className="table-col-head table-col-profile">
                        <Tv size={13} />
                        Channel
                      </span>
                    </th>
                    <th>
                      <span className="table-col-head table-col-group">
                        <HardDrive size={13} />
                        Source
                      </span>
                    </th>
                    <th>
                      <span className="table-col-head table-col-status">
                        <CircleCheckBig size={13} />
                        Status
                      </span>
                    </th>
                    <th>
                      <span className="table-col-head table-col-note">
                        <MessageCircle size={13} />
                        Last message
                      </span>
                    </th>
                    <th>
                      <span className="table-col-head table-col-proxy">
                        <Clock3 size={13} />
                        Updated
                      </span>
                    </th>
                    <th className="action-col">
                      <span className="table-col-head table-col-actions">
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
                        <div className="table-action-icons">
                          <button className="table-action-btn table-action-run" title="Start channel" aria-label="Start channel" onClick={() => startOne(job)} disabled={busy || ffmpegStatus !== "ok"}>
                            <Play size={12} />
                          </button>
                          <button className="table-action-btn table-action-close" title="Stop channel" aria-label="Stop channel" onClick={() => stopOne(job.id)}>
                            <Square size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {queueRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="library-empty">
                        No channels match current filters.
                      </td>
                    </tr>
                  )}
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
                  <label>
                    Rows per page
                    <select value={queuePageSize} onChange={(event) => setQueuePageSize(Number(event.target.value))}>
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
                      <div className="source-settings-top-row">
                        <label className="source-settings-cell source-channel-field">
                          Channel name
                          <input value={selectedJob.channelName} onChange={(event) => updateSelectedJob({ channelName: event.target.value })} />
                        </label>
                        <label className="source-settings-cell source-type-field">
                          Source type
                          <SmartFilterDropdown
                            value={selectedJob.sourceType}
                            options={sourceTypeOptions}
                            label="Source type"
                            searchLabel="Search source..."
                            onChange={(value) => updateSelectedJob({ sourceType: value as StreamJob["sourceType"] })}
                          />
                        </label>
                        <div className="source-settings-cell source-choose-cell">
                          <span className="source-settings-field-label">Choose source</span>
                          <div className="source-choose-row">
                            <button
                              type="button"
                              className="ghost slim-button source-choose-btn"
                              onClick={() => {
                                if (selectedJob.sourceType === "drive") {
                                  setDrivePickerOpen(true);
                                  return;
                                }
                                void pickSourceFile();
                              }}
                            >
                              <Files size={14} />
                              {selectedJob.sourceType === "drive" ? "Choose from Drive..." : "Choose from Local..."}
                            </button>
                            <span className="source-selection-meta" role="status" aria-live="polite" title={selectedSourceLabel}>
                              {selectedSourceLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <label className="run-mode-field drive-run-mode-field">
                        Run mode
                        <SmartFilterDropdown
                          value={selectedJob.drivePlayMode || "sequential"}
                          options={drivePlayModeOptions}
                          label="Run mode"
                          searchLabel="Search mode..."
                          onChange={(value) => updateSelectedJob({ drivePlayMode: value as StreamJob["drivePlayMode"] })}
                        />
                      </label>
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
                      <div className="schedule-inline">
                        <label className="schedule-mode-field">
                          Publish mode
                          <SmartFilterDropdown
                            value={selectedJob.publishMode || "immediate"}
                            options={publishModeOptions}
                            label="Publish mode"
                            searchLabel="Search publish mode..."
                            triggerTitle={
                              (selectedJob.publishMode || "immediate") === "immediate"
                                ? "Stream starts when you click Start selected."
                                : undefined
                            }
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
                        {(selectedJob.publishMode || "immediate") === "scheduled" ? (
                          <label className="schedule-time-field">
                            Schedule time
                            <ScheduleDatetimeField value={selectedJob.scheduledAt || ""} onChange={commitScheduledAtInput} />
                          </label>
                        ) : null}
                      </div>
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
          <section className="library-layout card shell">
            <header className="table-header-top library-table-header-top">
              <h2>Drive Library</h2>
              <span>{libraryRows.length} of {driveLibrary.length} items</span>
            </header>
            <div className="metrics table-header-stats">
              <div className="metric-card">
                <span className="metric-icon metric-ready metric-drive-brand">
                  <GoogleDriveBrandIcon size={23} className="drive-brand-metric" title="Google Drive" />
                </span>
                <div className="metric-content">
                  <span className="metric-label">Drive links</span>
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
                  <span className="metric-label">Resolutions</span>
                  <strong className="metric-value">{libraryResolutionOptions.length}</strong>
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
            <div className="table-header-actions profile-table-header-actions">
              <div className="profile-table-header-buttons drive-library-actions">
                <button className="ghost compact profile-header-btn-new" onClick={() => setDriveModalOpen(true)}>
                  <Plus size={14} />
                  New
                </button>
                <button className="ghost compact profile-header-btn-close" onClick={removeSelectedDriveLink} disabled={selectedLibraryCount === 0}>
                  <Trash2 size={14} />
                  Delete ({selectedLibraryCount})
                </button>
                <button className="ghost compact profile-header-btn-new" onClick={refreshAllDriveMetadata} disabled={driveLibrary.length === 0}>
                  <RefreshCw size={14} />
                  Refresh
                </button>
                <button className="ghost compact profile-header-btn-delete" onClick={() => setGroupManagerOpen(true)}>
                  <FolderOpen size={14} />
                  Manage Group
                </button>
                <div className="drive-library-apply-group">
                  <GroupApplyDropdown
                    groups={mergedGroupOptions}
                    selectedRowsCount={selectedLibraryCount}
                    onApply={applyGroupsToSelectedDriveLinks}
                    onManage={() => setGroupManagerOpen(true)}
                  />
                </div>
              </div>
            </div>
            <div className="library-toolbar table-header-filters profile-filters">
              <label className="input with-icon">
                <Search size={15} />
                <input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search file, group, Drive link…" />
              </label>
              <MultiSelectDropdown
                values={librarySelectedStatuses}
                options={libraryDriveMetadataStatusFilterOptions}
                label="Status"
                searchLabel="Search statuses…"
                summaryLabel="statuses"
                defaultTone="status"
                onChange={setLibrarySelectedStatuses}
              />
              <MultiSelectDropdown
                values={librarySelectedResolutions}
                options={libraryDriveResolutionFilterOptions}
                label="Resolution"
                searchLabel="Search resolutions…"
                summaryLabel="resolutions"
                defaultTone="platform"
                onChange={setLibrarySelectedResolutions}
              />
            </div>
            <div className="library-table-wrap">
              <div className="table-scroll table-wrap">
              <table className="queue-table library-table row-select-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="table-col-head table-col-profile">
                        <FileText size={13} />
                        File
                      </span>
                    </th>
                    <th scope="col">
                      <span className="table-col-head table-col-drive drive-brand-col-head">
                        <Link2 size={13} />
                        Drive link
                      </span>
                    </th>
                    <th scope="col">
                      <span className="table-col-head table-col-status">
                        <CircleCheckBig size={13} />
                        Status
                      </span>
                    </th>
                    <th scope="col">
                      <span className="table-col-head table-col-group">
                        <FolderOpen size={13} />
                        Group
                      </span>
                    </th>
                    <th scope="col">
                      <span className="table-col-head">
                        <CalendarDays size={13} />
                        Added
                      </span>
                    </th>
                    <th scope="col">
                      <span className="table-col-head table-col-proxy">
                        <Clock3 size={13} />
                        Duration
                      </span>
                    </th>
                    <th scope="col">
                      <span className="table-col-head table-col-note">
                        <Tv size={13} />
                        Resolution
                      </span>
                    </th>
                    <th scope="col">
                      <span className="table-col-head">
                        <Files size={13} />
                        Size
                      </span>
                    </th>
                    <th scope="col">
                      <span className="table-col-head table-col-actions">
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
                      className={selectedDriveIds.has(item.id) ? "queue-row active" : "queue-row"}
                      onMouseDown={(event) => handleLibraryRowSelection(item.id, index, event)}
                      onMouseEnter={() => extendLibraryRowSelection(item.id, index)}
                      title="Click: single, Ctrl: add, Shift: range, drag to sweep, Ctrl+A: select all"
                    >
                      <td className="library-td-single-line library-td-file">
                        <span className="library-cell-ellipsis drive-file-name" title={item.name}>
                          {metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning" ? "Scanning metadata..." : item.name}
                        </span>
                      </td>
                      <td className="library-td-single-line library-td-url">
                        <button
                          type="button"
                          className="library-link library-cell-ellipsis library-url-button"
                          title={item.url}
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyDriveUrl(item.url);
                          }}
                        >
                          <span>{item.url}</span>
                        </button>
                      </td>
                      <td className="library-td-single-line library-td-status">
                        <span
                          className={`library-metadata-status md-${item.metadataStatus}`}
                          title={item.metadataMessage || driveLibraryMetadataLabel(item.metadataStatus)}
                        >
                          <DriveLibraryMetadataStatusIcon
                            status={item.metadataStatus}
                            spinning={metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning"}
                          />
                          {driveLibraryMetadataLabel(item.metadataStatus)}
                        </span>
                      </td>
                      <td className="library-td-single-line library-td-group">
                        <span className="library-cell-ellipsis" title={item.group}>
                          {item.group || "-"}
                        </span>
                      </td>
                      <td>
                        <span className="metadata-value">
                          <CalendarDays size={12} />
                          {item.addedAt}
                        </span>
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
                        <div className="table-action-icons">
                          <button
                            type="button"
                            className="table-action-btn table-action-reset"
                            aria-label="Refresh metadata"
                            title="Refresh metadata"
                            onClick={() => refreshDriveMetadata(item.id)}
                            disabled={metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning"}
                          >
                            <RefreshCw size={12} className={metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning" ? "spinning" : ""} />
                          </button>
                          <button
                            type="button"
                            className="table-action-btn table-action-close"
                            aria-label="Remove drive link"
                            title="Remove drive link"
                            onClick={() => removeDriveLink(item.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {libraryRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="library-empty">
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
                  <label>
                    Rows per page
                    <select value={libraryPageSize} onChange={(event) => setLibraryPageSize(Number(event.target.value))}>
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
            <div className="modal-card drive-picker-modal shell" role="dialog" aria-modal="true" aria-labelledby="drive-picker-title" onMouseDown={(event) => event.stopPropagation()}>
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
                  <span className="metric-icon metric-ready metric-drive-brand">
                    <GoogleDriveBrandIcon size={22} className="drive-brand-metric" title="Google Drive" />
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
              <div className="drive-picker-toolbar table-header-filters profile-filters">
                <label className="input with-icon">
                  <Search size={15} />
                  <input value={configDriveSearch} onChange={(event) => setConfigDriveSearch(event.target.value)} placeholder="Search file, group, Drive link…" autoFocus />
                </label>
                <MultiSelectDropdown
                  values={configDriveSelectedStatuses}
                  options={libraryDriveMetadataStatusFilterOptions}
                  label="Status"
                  searchLabel="Search statuses…"
                  summaryLabel="statuses"
                  defaultTone="status"
                  onChange={setConfigDriveSelectedStatuses}
                />
                <MultiSelectDropdown
                  values={configDriveSelectedResolutions}
                  options={libraryDriveResolutionFilterOptions}
                  label="Resolution"
                  searchLabel="Search resolutions…"
                  summaryLabel="resolutions"
                  defaultTone="platform"
                  onChange={setConfigDriveSelectedResolutions}
                />
              </div>
              <div className="drive-picker-table-wrap">
                <table className="queue-table library-table drive-picker-table row-select-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="table-col-head table-col-profile">
                          <FileText size={13} />
                          File
                        </span>
                      </th>
                      <th scope="col">
                        <span className="table-col-head table-col-drive drive-brand-col-head">
                          <Link2 size={13} />
                          Drive link
                        </span>
                      </th>
                      <th scope="col">
                        <span className="table-col-head table-col-status">
                          <CircleCheckBig size={13} />
                          Status
                        </span>
                      </th>
                      <th scope="col">
                        <span className="table-col-head table-col-group">
                          <FolderOpen size={13} />
                          Group
                        </span>
                      </th>
                      <th scope="col">
                        <span className="table-col-head">
                          <CalendarDays size={13} />
                          Added
                        </span>
                      </th>
                      <th scope="col">
                        <span className="table-col-head table-col-proxy">
                          <Clock3 size={13} />
                          Duration
                        </span>
                      </th>
                      <th scope="col">
                        <span className="table-col-head table-col-note">
                          <Tv size={13} />
                          Resolution
                        </span>
                      </th>
                      <th scope="col">
                        <span className="table-col-head">
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
                          onMouseDown={(event) => applyDriveLibraryItem(item, index, event)}
                          onMouseEnter={() => extendDrivePickerSelection(item, index)}
                          title="Click: single, Ctrl: add, Shift: range, drag to sweep, Ctrl+A: select all"
                        >
                          <td className="library-td-single-line library-td-file">
                            <span className="library-cell-ellipsis drive-file-name" title={item.name}>
                              {metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning" ? "Scanning metadata..." : item.name}
                            </span>
                          </td>
                          <td className="library-td-single-line library-td-url">
                            <span className="library-link library-cell-ellipsis library-url-static" title={item.url}>
                              <span>{item.url}</span>
                            </span>
                          </td>
                          <td className="library-td-single-line library-td-status">
                            <span
                              className={`library-metadata-status md-${item.metadataStatus}`}
                              title={item.metadataMessage || driveLibraryMetadataLabel(item.metadataStatus)}
                            >
                              <DriveLibraryMetadataStatusIcon
                                status={item.metadataStatus}
                                spinning={metadataLoadingIds.includes(item.id) || item.metadataStatus === "scanning"}
                              />
                              {driveLibraryMetadataLabel(item.metadataStatus)}
                            </span>
                          </td>
                          <td className="library-td-single-line library-td-group">
                            <span className="library-cell-ellipsis" title={item.group}>
                              {item.group || "-"}
                            </span>
                          </td>
                          <td>
                            <span className="metadata-value">
                              <CalendarDays size={12} />
                              {item.addedAt}
                            </span>
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
                        <td colSpan={8} className="library-empty">
                          No Drive links match current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions modal-actions-centered">
                <button className="ghost compact profile-header-btn-run" onClick={() => updateSelectedDriveUrls(configDriveRows.map((item) => item.url))} disabled={configDriveRows.length === 0}>
                  <Check size={14} />
                  Select filtered
                </button>
                <button className="ghost compact profile-header-btn-close" onClick={() => updateSelectedDriveUrls([])} disabled={selectedJobDriveUrls.length === 0}>
                  <X size={14} />
                  Clear selected
                </button>
                <button
                  className="ghost compact profile-header-btn-new"
                  onClick={() => {
                    setDrivePickerOpen(false);
                    setDriveModalOpen(true);
                  }}
                >
                  <Plus size={14} />
                  Add Drive Link
                </button>
                <button className="ghost compact profile-header-btn-delete" onClick={() => setDrivePickerOpen(false)}>
                  <CheckCircle2 size={14} />
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
        {groupManagerOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setGroupManagerOpen(false)}>
            <div className="modal-card group-manager-modal shell" role="dialog" aria-modal="true" aria-labelledby="group-manager-title" onMouseDown={(event) => event.stopPropagation()}>
              <header className="table-header-top">
                <h2 id="group-manager-title">Manage Groups</h2>
                <span>{groupManagerRows.length} of {mergedGroupOptions.length} groups</span>
              </header>
              <div className="table-header-filters profile-filters group-manager-filters">
                <label className="input with-icon">
                  <Search size={15} />
                  <input value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Search group..." autoFocus />
                </label>
                <label>
                  Group name
                  <input value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} placeholder="Type group name" />
                </label>
              </div>
              <div className="table-wrap group-manager-table-wrap">
                <table className="queue-table row-select-table group-manager-table">
                  <thead>
                    <tr>
                      <th>
                        <span className="table-col-head table-col-group">
                          <FolderOpen size={13} />
                          Group
                        </span>
                      </th>
                      <th>
                        <span className="table-col-head table-col-status">
                          <Files size={13} />
                          Links
                        </span>
                      </th>
                      <th>
                        <span className="table-col-head table-col-proxy">
                          <CalendarDays size={13} />
                          Last added
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupManagerRows.map((row) => (
                      <tr
                        key={row.group}
                        className={selectedManagedGroup === row.group ? "queue-row active" : "queue-row"}
                        onClick={() => {
                          setSelectedManagedGroup(row.group);
                          setGroupDraft(row.group);
                        }}
                      >
                        <td>{row.group}</td>
                        <td>{row.count}</td>
                        <td>{row.updatedAt}</td>
                      </tr>
                    ))}
                    {groupManagerRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="library-empty">
                          No groups match search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions modal-actions-centered group-manager-actions">
                <button className="ghost compact profile-header-btn-new" onClick={addManagedGroup} disabled={!groupDraft.trim()}>
                  <Plus size={14} />
                  Add group
                </button>
                <button className="ghost compact profile-header-btn-run" onClick={renameManagedGroup} disabled={!groupDraft.trim() || !selectedManagedGroup || selectedManagedGroup === "Default"}>
                  <Pencil size={14} />
                  Rename
                </button>
                <button className="ghost compact profile-header-btn-close" onClick={deleteManagedGroup} disabled={!selectedManagedGroup || selectedManagedGroup === "Default"}>
                  <Trash2 size={14} />
                  Delete
                </button>
                <button className="ghost compact profile-header-btn-new" onClick={() => applyGroupToSelectedDriveLinks(selectedManagedGroup)} disabled={selectedLibraryCount === 0 || !selectedManagedGroup}>
                  <FolderOpen size={14} />
                  Apply to selected ({selectedLibraryCount})
                </button>
                <button className="ghost compact profile-header-btn-delete" onClick={() => setGroupManagerOpen(false)}>
                  <CheckCircle2 size={14} />
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
        {driveModalOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setDriveModalOpen(false)}>
            <div className="modal-card drive-modal shell" role="dialog" aria-modal="true" aria-labelledby="drive-modal-title" onMouseDown={(event) => event.stopPropagation()}>
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
                    {mergedGroupOptions.map((group) => (
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
        {error ? (
          <div
            className="app-error-overlay-backdrop"
            role="presentation"
            onMouseDown={() => {
              setError("");
            }}
          >
            <div
              className="app-error-overlay-card shell"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="app-error-title"
              aria-describedby="app-error-desc"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="app-error-overlay-header">
                <div className="app-error-overlay-title-row">
                  <span className="app-error-overlay-icon" aria-hidden>
                    <XCircle size={22} strokeWidth={2.1} />
                  </span>
                  <h2 id="app-error-title" className="app-error-overlay-title">
                    Something went wrong
                  </h2>
                </div>
                <button type="button" className="icon-action library-remove-action" title="Dismiss" aria-label="Dismiss" onClick={() => setError("")}>
                  <X size={14} />
                </button>
              </div>
              <p id="app-error-desc" className="app-error-overlay-message">
                {error}
              </p>
              <div className="app-error-overlay-actions">
                <button type="button" className="primary" autoFocus onClick={() => setError("")}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
