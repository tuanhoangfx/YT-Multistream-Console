import { CalendarClock, Check, ChevronDown, CircleCheckBig, FolderOpen, ListFilter, Play, Repeat2, Search, Shuffle, X, Zap } from "lucide-react";
import { GoogleDriveBrandIcon } from "./GoogleDriveBrandIcon";
import { useLayoutEffect, useRef, useState } from "react";

export type DropdownOption = {
  value: string;
  label: string;
  tone?: "neutral" | "all" | "local" | "drive" | "idle" | "running" | "scheduled" | "failed" | "immediate" | "loop" | "shuffle";
};

const MENU_ESTIMATE_PX = 248;

function findVerticalScrollContainer(start: HTMLElement | null): HTMLElement {
  let node: HTMLElement | null = start;
  while (node) {
    const { overflowY, overflow } = getComputedStyle(node);
    const oy = overflowY || overflow;
    if (node !== document.documentElement && (oy === "auto" || oy === "scroll")) {
      return node;
    }
    node = node.parentElement;
  }
  return document.documentElement;
}

function viewportAxisBounds(scrollRoot: HTMLElement) {
  if (scrollRoot === document.documentElement) {
    return { top: 0, bottom: window.innerHeight };
  }
  const r = scrollRoot.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
}

type SmartFilterDropdownProps =
  | {
      value: string;
      options: DropdownOption[];
      label: string;
      searchLabel: string;
      multiple?: false;
      triggerTitle?: string;
      onChange: (value: string) => void;
    }
  | {
      value: string[];
      options: DropdownOption[];
      label: string;
      searchLabel: string;
      multiple: true;
      triggerTitle?: string;
      onChange: (value: string[]) => void;
    };

function DropdownOptionMarker({ tone }: { tone?: DropdownOption["tone"] }) {
  if (!tone || tone === "neutral") return null;
  if (tone === "all") return <ListFilter size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "idle") return <CircleCheckBig size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "immediate") return <Zap size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "loop") return <Repeat2 size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "shuffle") return <Shuffle size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "running") return <Play size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "scheduled") return <CalendarClock size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "failed") return <X size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "local") return <FolderOpen size={13} className={`dropdown-option-icon ${tone}`} />;
  if (tone === "drive") return <GoogleDriveBrandIcon size={13} className={`dropdown-option-icon ${tone}`} />;
  return null;
}

export function SmartFilterDropdown({
  value,
  options,
  label,
  searchLabel,
  multiple = false,
  triggerTitle,
  onChange
}: SmartFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuOpensUp, setMenuOpensUp] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedValues = Array.isArray(value) ? value : [value];
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const hasAllSelected = selectedValues.includes("all");
  const selected = selectedOptions[0];
  const triggerLabel = multiple
    ? hasAllSelected || selectedOptions.length === 0
      ? label
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} ${label}`
    : selected?.label || label;
  const triggerTone = multiple ? (hasAllSelected || selectedOptions.length > 1 ? undefined : selected?.tone) : selected?.tone;

  function isOptionSelected(optionValue: string) {
    return selectedValues.includes(optionValue);
  }

  function computeMenuPlacement() {
    const btn = triggerRef.current;
    if (!btn || !rootRef.current) return;
    const scrollRoot = findVerticalScrollContainer(rootRef.current);
    const tt = btn.getBoundingClientRect();
    const { top: srTop, bottom: srBottom } = viewportAxisBounds(scrollRoot);
    const edgePad = 8;
    const spaceBelow = srBottom - tt.bottom - edgePad;
    const spaceAbove = tt.top - srTop - edgePad;
    const need = MENU_ESTIMATE_PX;
    const openUp = spaceBelow < need && spaceAbove > spaceBelow;
    setMenuOpensUp(openUp);
  }

  useLayoutEffect(() => {
    if (!open) return;
    computeMenuPlacement();
    const scrollRoot = findVerticalScrollContainer(rootRef.current);
    scrollRoot.addEventListener("scroll", computeMenuPlacement, { passive: true });
    window.addEventListener("scroll", computeMenuPlacement, { passive: true });
    window.addEventListener("resize", computeMenuPlacement);
    return () => {
      scrollRoot.removeEventListener("scroll", computeMenuPlacement);
      window.removeEventListener("scroll", computeMenuPlacement);
      window.removeEventListener("resize", computeMenuPlacement);
    };
  }, [open, filteredOptions.length]);

  return (
    <div
      ref={rootRef}
      className={open ? "smart-dropdown open" : "smart-dropdown"}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setSearch("");
          setMenuOpensUp(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="smart-dropdown-trigger"
        title={triggerTitle || undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={triggerTone ? `dropdown-trigger-label ${triggerTone}` : "dropdown-trigger-label"}>
          <DropdownOptionMarker tone={triggerTone} />
          {triggerLabel}
        </span>
        <ChevronDown size={15} className="dropdown-chevron" />
      </button>
      {open && (
        <div className={`smart-dropdown-menu ${menuOpensUp ? "menu-above" : "menu-below"}`}>
          <label className="smart-dropdown-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchLabel} autoFocus />
          </label>
          <div className="smart-dropdown-options">
            {filteredOptions.map((option) => {
              return (
                <button
                  type="button"
                  className={isOptionSelected(option.value) ? "smart-dropdown-option active" : "smart-dropdown-option"}
                  key={option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (multiple) {
                      const onMultiChange = onChange as (nextValue: string[]) => void;
                      const current = new Set(selectedValues);
                      if (option.value === "all") {
                        onMultiChange(["all"]);
                        return;
                      }
                      current.delete("all");
                      if (current.has(option.value)) current.delete(option.value);
                      else current.add(option.value);
                      onMultiChange(current.size === 0 ? ["all"] : Array.from(current));
                      return;
                    }
                    (onChange as (nextValue: string) => void)(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="dropdown-checkbox">{isOptionSelected(option.value) ? <Check size={10} /> : null}</span>
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
