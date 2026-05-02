import { CircleAlert, Clock3, Check, ChevronDown, CheckCircle2, FolderOpen, Globe2, HardDrive, Layers3, Play, RefreshCw, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { DropdownDotTone } from "../features/streams/dropdown-utils";
import { GoogleDriveBrandIcon } from "./GoogleDriveBrandIcon";

export type MultiSelectDropdownOption = {
  value: string;
  label: string;
  tone?: "neutral" | "all" | "group" | "platform" | "source" | "local" | "drive" | "status" | "pending" | "ready" | "opening" | "scanning" | "partial" | "running" | "failed";
  dotTone?: DropdownDotTone;
};

type MultiSelectDropdownProps = {
  values: string[];
  options: MultiSelectDropdownOption[];
  label: string;
  searchLabel: string;
  summaryLabel?: string;
  defaultTone?: MultiSelectDropdownOption["tone"];
  onChange: (values: string[]) => void;
};

function DropdownOptionMarker({ tone, dotTone }: { tone?: MultiSelectDropdownOption["tone"]; dotTone?: MultiSelectDropdownOption["dotTone"] }) {
  if (dotTone) return <span className={`dropdown-option-dot ${dotTone}`} />;
  if (!tone || tone === "neutral") return null;
  if (tone === "all") return <Globe2 size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "group") return <Layers3 size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "platform") return <Globe2 size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "source") return <HardDrive size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "local") return <FolderOpen size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "drive") return <GoogleDriveBrandIcon size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "status") return <CheckCircle2 size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "pending") return <Clock3 size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "ready") return <CheckCircle2 size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "scanning") return <RefreshCw size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "opening") return <RefreshCw size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "partial") return <CircleAlert size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "running") return <Play size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "failed") return <XCircle size={13} className={`dropdown-option-icon ${tone}`} />;
  return null;
}

export function MultiSelectDropdown({
  values,
  options,
  label,
  searchLabel,
  summaryLabel,
  defaultTone = "all",
  onChange
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(values), [values]);
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedLabels = options.filter((option) => selectedSet.has(option.value)).map((option) => option.label);
  const displayLabel =
    selectedLabels.length === 0 ? label : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} ${summaryLabel || "selected"}`;
  const selectedOption = options.find((option) => selectedSet.has(option.value));
  const triggerTone = selectedSet.size === 0 ? defaultTone : selectedSet.size === 1 ? selectedOption?.tone : undefined;

  function toggleValue(value: string) {
    if (!value) {
      onChange([]);
      return;
    }

    const next = new Set(values);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  }

  return (
    <div
      className={open ? "smart-dropdown multi-select-dropdown open" : "smart-dropdown multi-select-dropdown"}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setSearch("");
        }
      }}
    >
      <button type="button" className="smart-dropdown-trigger" onClick={() => setOpen((current) => !current)}>
        <span className={triggerTone ? `dropdown-trigger-label ${triggerTone}` : "dropdown-trigger-label"}>
          <DropdownOptionMarker tone={triggerTone} dotTone={selectedSet.size === 1 ? selectedOption?.dotTone : undefined} />
          {displayLabel}
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
            <button type="button" className={values.length === 0 ? "smart-dropdown-option active" : "smart-dropdown-option"} onMouseDown={(event) => event.preventDefault()} onClick={() => onChange([])}>
              <span className="dropdown-checkbox">{values.length === 0 ? <Check size={10} /> : null}</span>
              <span className="dropdown-option-label">
                <DropdownOptionMarker tone="all" />
                All
              </span>
            </button>
            {filteredOptions.map((option) => (
              <button
                type="button"
                className={selectedSet.has(option.value) ? "smart-dropdown-option active" : "smart-dropdown-option"}
                key={option.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleValue(option.value)}
              >
                <span className="dropdown-checkbox">{selectedSet.has(option.value) ? <Check size={10} /> : null}</span>
                <span className={option.tone ? `dropdown-option-label ${option.tone}` : "dropdown-option-label"}>
                  <DropdownOptionMarker tone={option.tone} dotTone={option.dotTone} />
                  {option.label}
                </span>
              </button>
            ))}
            {filteredOptions.length === 0 && <span className="dropdown-empty">No matches</span>}
          </div>
        </div>
      )}
    </div>
  );
}
