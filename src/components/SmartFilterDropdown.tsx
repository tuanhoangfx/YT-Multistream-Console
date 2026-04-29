import { CalendarClock, Check, ChevronDown, CircleCheckBig, Cloud, FolderOpen, Play, Search, X } from "lucide-react";
import { useState } from "react";

export type DropdownOption = {
  value: string;
  label: string;
  tone?: "neutral" | "local" | "drive" | "idle" | "running" | "scheduled" | "failed";
};

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

export function SmartFilterDropdown({
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
