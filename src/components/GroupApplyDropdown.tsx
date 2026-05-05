import { Check, CheckCheck, ChevronDown, FolderCog, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toneFromSeed } from "../features/streams/dropdown-utils";

type GroupApplyDropdownProps = {
  groups: string[];
  selectedRowsCount: number;
  onApply: (groups: string[]) => void;
  onManage: () => void;
};

export function GroupApplyDropdown({ groups, selectedRowsCount, onApply, onManage }: GroupApplyDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draftGroups, setDraftGroups] = useState<string[]>([]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groups.filter((group) => !term || group.toLowerCase().includes(term));
  }, [groups, search]);

  const triggerLabel = draftGroups.length === 0 ? "Apply Group" : draftGroups.length === 1 ? draftGroups[0] : `${draftGroups.length} groups`;

  function toggleGroup(group: string) {
    setDraftGroups((current) => {
      if (current.includes(group)) return current.filter((item) => item !== group);
      return [...current, group];
    });
  }

  return (
    <div
      className={open ? "smart-dropdown group-apply-dropdown open" : "smart-dropdown group-apply-dropdown"}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setSearch("");
        }
      }}
    >
      <button type="button" className="smart-dropdown-trigger" onClick={() => setOpen((current) => !current)}>
        <span className="dropdown-trigger-label">
          <CheckCheck size={13} className="dropdown-option-icon status" />
          {triggerLabel}
        </span>
        <ChevronDown size={15} className="dropdown-chevron" />
      </button>
      {open && (
        <div className="smart-dropdown-menu">
          <label className="smart-dropdown-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search groups..." autoFocus />
          </label>
          <div className="group-apply-actions">
            <button
              type="button"
              className="ghost compact profile-header-btn-run"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (draftGroups.length === 0 || selectedRowsCount === 0) return;
                onApply(draftGroups);
                setOpen(false);
                setSearch("");
              }}
              disabled={draftGroups.length === 0 || selectedRowsCount === 0}
            >
              <Check size={13} />
              Apply
            </button>
            <button
              type="button"
              className="ghost compact profile-header-btn-close"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setDraftGroups([]);
                setSearch("");
              }}
            >
              <X size={13} />
              Cancel
            </button>
            <button type="button" className="ghost compact profile-header-btn-delete" onMouseDown={(event) => event.preventDefault()} onClick={onManage}>
              <FolderCog size={13} />
              Manage
            </button>
          </div>
          <div className="smart-dropdown-options">
            {filteredGroups.map((group) => (
              <button
                type="button"
                className={draftGroups.includes(group) ? "smart-dropdown-option active" : "smart-dropdown-option"}
                key={group}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleGroup(group)}
              >
                <span className="dropdown-checkbox">{draftGroups.includes(group) ? <Check size={10} /> : null}</span>
                <span className="dropdown-option-label">
                  <span className={`dropdown-option-dot ${toneFromSeed(`drive-group:${group}`)}`} />
                  {group}
                </span>
              </button>
            ))}
            {filteredGroups.length === 0 && <span className="dropdown-empty">No groups</span>}
          </div>
        </div>
      )}
    </div>
  );
}
