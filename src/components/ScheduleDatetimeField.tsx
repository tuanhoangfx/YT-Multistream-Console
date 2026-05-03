// Compact themed datetime picker — see E:\Dev\Rules\standards\Datetime_Picker_Standard.md (styles in workspace-design-base.css).
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const MINUTE_STEP = 5;

const WEEK_M = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDatetimeLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseDatetimeLocal(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.trim())) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function mondayLeadOffset(daySun0: number) {
  return daySun0 === 0 ? 6 : daySun0 - 1;
}

/** Align to dropdown steps (last slot 55 — avoids 60 which would wrap the hour silently in UI). */
function snapToMinuteGrid(m: number) {
  let s = Math.round(m / MINUTE_STEP) * MINUTE_STEP;
  if (s >= 60) s = 55;
  return s;
}

function withSnappedMinutes(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
  x.setMinutes(snapToMinuteGrid(x.getMinutes()));
  return x;
}

function sensibleDefaultBaseline(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 65);
  d.setSeconds(0, 0);
  return withSnappedMinutes(d);
}

export type ScheduleDatetimeFieldProps = {
  value: string;
  onChange: (datetimeLocal: string) => void;
};

export function ScheduleDatetimeField({ value, onChange }: ScheduleDatetimeFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editingTimeRef = useRef(false);
  const [open, setOpen] = useState(false);
  const parsedValue = parseDatetimeLocal(value);

  const [cursor, setCursor] = useState(() => {
    const p = parseDatetimeLocal(value);
    return p ? withSnappedMinutes(new Date(p.getTime())) : sensibleDefaultBaseline();
  });

  const [hourDraft, setHourDraft] = useState(() => pad2(cursor.getHours()));
  const [minuteDraft, setMinuteDraft] = useState(() => pad2(snapToMinuteGrid(cursor.getMinutes())));

  const syncCursorFromProp = useCallback(() => {
    const p = parseDatetimeLocal(value);
    setCursor(p ? withSnappedMinutes(new Date(p.getTime())) : sensibleDefaultBaseline());
  }, [value]);

  useEffect(() => {
    syncCursorFromProp();
  }, [value, open, syncCursorFromProp]);

  const cursorSnap = useMemo(
    () =>
      `${cursor.getFullYear()}|${cursor.getMonth()}|${cursor.getDate()}|${cursor.getHours()}|${cursor.getMinutes()}`,
    [cursor]
  );

  useLayoutEffect(() => {
    if (!open) return;
    if (editingTimeRef.current) return;
    setHourDraft(pad2(cursor.getHours()));
    setMinuteDraft(pad2(snapToMinuteGrid(cursor.getMinutes())));
  }, [open, cursorSnap]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const node = rootRef.current;
      if (node?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const vy = cursor.getFullYear();
  const vm = cursor.getMonth();

  const emit = useCallback(
    (d: Date) => {
      const next = withSnappedMinutes(new Date(d.getTime()));
      next.setSeconds(0, 0);
      setCursor(next);
      onChange(formatDatetimeLocal(next));
      editingTimeRef.current = false;
      setHourDraft(pad2(next.getHours()));
      setMinuteDraft(pad2(next.getMinutes()));
    },
    [onChange]
  );

  function parseDraftTime(): { h: number; m: number } {
    const hi = hourDraft.trim();
    const mi = minuteDraft.trim();
    let h = parseInt(hi, 10);
    let m = parseInt(mi, 10);
    if (Number.isNaN(h) || hi === "") h = cursor.getHours();
    else h = Math.min(23, Math.max(0, h));
    if (Number.isNaN(m) || mi === "") m = cursor.getMinutes();
    else m = Math.min(59, Math.max(0, m));
    m = snapToMinuteGrid(m);
    return { h, m };
  }

  function commitTimeInputs() {
    const { h, m } = parseDraftTime();
    const next = new Date(cursor);
    next.setHours(h, m, 0, 0);
    emit(next);
  }

  function applyToday() {
    const now = new Date();
    const { h, m } = parseDraftTime();
    emit(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0));
  }

  const grid = useMemo(() => {
    const first = new Date(vy, vm, 1);
    const lead = mondayLeadOffset(first.getDay());
    const daysInMonth = new Date(vy, vm + 1, 0).getDate();
    const cells: { n: number; inMonth: boolean }[] = [];
    for (let i = 0; i < lead; i++) cells.push({ n: 0, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ n: d, inMonth: true });
    const rows = Math.ceil(cells.length / 7);
    const total = rows * 7;
    while (cells.length < total) cells.push({ n: 0, inMonth: false });
    return cells;
  }, [vy, vm]);

  const monthLabel = useMemo(
    () => new Date(vy, vm, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" }),
    [vy, vm]
  );

  const displayTrigger = useMemo(() => {
    if (!parsedValue) return null;
    return parsedValue.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }, [parsedValue]);

  function shiftMonth(delta: number) {
    const { h, m } = parseDraftTime();
    const nm = vm + delta;
    const cap = new Date(vy, nm + 1, 0).getDate();
    const day = Math.min(cursor.getDate(), cap);
    setCursor(new Date(vy, nm, day, h, m, 0, 0));
  }

  function pickDay(day: number) {
    const cap = new Date(vy, vm + 1, 0).getDate();
    const d = Math.min(Math.max(1, day), cap);
    const { h, m } = parseDraftTime();
    const next = new Date(vy, vm, d, h, m, 0, 0);
    emit(next);
  }

  const isSelectedDay = (d: number, inMonth: boolean) =>
    inMonth &&
    cursor.getFullYear() === vy &&
    cursor.getMonth() === vm &&
    cursor.getDate() === d;

  return (
    <div ref={rootRef} className="schedule-datetime">
      <button
        type="button"
        className={`schedule-datetime-trigger${open ? " open" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Calendar size={13} strokeWidth={2.2} className="schedule-datetime-trigger-calendar" aria-hidden />
        <span className={`schedule-datetime-trigger-text${parsedValue ? "" : " is-placeholder"}`}>
          {displayTrigger ?? "Select date & time"}
        </span>
        <ChevronDown size={15} strokeWidth={2.25} className="schedule-datetime-trigger-chevron" aria-hidden />
      </button>

      {open ? (
        <div className="schedule-datetime-popover" role="dialog" aria-label="Schedule date and time">
          <div className="schedule-dp-body">
            <div className="schedule-dp-head">
              <button type="button" className="schedule-dp-round" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                <ChevronLeft size={15} strokeWidth={2} />
              </button>
              <span className="schedule-dp-title">{monthLabel}</span>
              <button type="button" className="schedule-dp-round" aria-label="Next month" onClick={() => shiftMonth(1)}>
                <ChevronRight size={15} strokeWidth={2} />
              </button>
            </div>

            <div className="schedule-dp-weekdays">{WEEK_M.map((d) => <span key={d}>{d}</span>)}</div>

            <div className="schedule-dp-grid">
              {grid.map((cell, i) =>
                cell.inMonth ? (
                  <button
                    type="button"
                    key={`d-${vy}-${vm}-${cell.n}-${i}`}
                    className={`schedule-dp-day${isSelectedDay(cell.n, true) ? " selected" : ""}`}
                    onClick={() => pickDay(cell.n)}
                  >
                    {cell.n}
                  </button>
                ) : (
                  <span key={`e-${i}`} className="schedule-dp-pad" aria-hidden />
                )
              )}
            </div>

            <div className="schedule-dp-time-selects">
              <label className="schedule-dp-sr-only" htmlFor="schedule-dp-hour">
                Hour
              </label>
              <input
                id="schedule-dp-hour"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={2}
                className="schedule-dp-time-input"
                aria-label="Hour (24h)"
                value={hourDraft}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setHourDraft(v);
                }}
                onFocus={(e) => {
                  editingTimeRef.current = true;
                  e.target.select();
                }}
                onBlur={() => {
                  commitTimeInputs();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
              <span className="schedule-dp-time-colon" aria-hidden>
                :
              </span>
              <label className="schedule-dp-sr-only" htmlFor="schedule-dp-minute">
                Minute
              </label>
              <input
                id="schedule-dp-minute"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={2}
                className="schedule-dp-time-input"
                aria-label="Minute"
                value={minuteDraft}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setMinuteDraft(v);
                }}
                onFocus={(e) => {
                  editingTimeRef.current = true;
                  e.target.select();
                }}
                onBlur={() => {
                  commitTimeInputs();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </div>

            <div className="schedule-dp-footer">
              <button type="button" className="schedule-dp-link" onClick={applyToday}>
                Today
              </button>
              <button
                type="button"
                className="schedule-dp-link schedule-dp-link-danger"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="schedule-dp-accent-edge" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}
