import { CalendarClock, Circle, CircleCheckBig, Cloud, FolderOpen, Play, X } from "lucide-react";
import type { StreamJob } from "../types";

export function SourceBadge({ sourceType }: { sourceType: StreamJob["sourceType"] }) {
  const isDrive = sourceType === "drive";
  return (
    <span className={isDrive ? "source-badge drive" : "source-badge local"}>
      {isDrive ? <Cloud size={12} /> : <FolderOpen size={12} />}
      {isDrive ? "Google Drive" : "Local"}
    </span>
  );
}

export function StatusBadge({ status }: { status: StreamJob["status"] }) {
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
