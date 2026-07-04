import type { ReactNode } from "react";
import { NumberInput } from "../NumberInput";
import { formatModifier } from "../../lib/types";

/** A labeled text field (label above input). */
export function Field({
  label,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="sheet-field">
      <label>{label}</label>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** A labeled integer field. */
export function NumField({
  label,
  value,
  disabled,
  min,
  allowNegative,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  min?: number;
  allowNegative?: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="sheet-field">
      <label>{label}</label>
      <NumberInput value={value} disabled={disabled} min={min} allowNegative={allowNegative} onCommit={onCommit} />
    </div>
  );
}

/** A small pill badge (e.g. Initiative +3 / Walk 30). */
export function StatBadge({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat-badge">
      <div className="stat-badge-value">{value}</div>
      <div className="stat-badge-label">{label}</div>
    </div>
  );
}

/** A proficiency dot: empty / half-filled (expertise-capable) / filled. Click cycles. */
export function ProfDot({
  level,
  max = 1,
  disabled,
  onCycle,
  title,
}: {
  level: number;
  max?: number;
  disabled?: boolean;
  onCycle?: (next: number) => void;
  title?: string;
}) {
  const cls = level >= 2 ? "prof-dot--expertise" : level >= 1 ? "prof-dot--prof" : "";
  return (
    <button
      type="button"
      className={`prof-dot ${cls}`}
      disabled={disabled || !onCycle}
      title={title ?? "Proficiency"}
      onClick={() => onCycle?.((level + 1) % (max + 1))}
    />
  );
}

/** A bar meter (HP / hit dice / encumbrance). `over` paints it red. */
export function BarMeter({
  current,
  max,
  color,
  over,
  children,
}: {
  current: number;
  max: number;
  color?: string;
  over?: boolean;
  children?: ReactNode;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  return (
    <div className={`bar-meter ${over ? "bar-meter--over" : ""}`}>
      <div className="bar-meter-fill" style={{ width: `${pct}%`, background: color }} />
      <div className="bar-meter-text">{children}</div>
    </div>
  );
}

/** A "current / max" dual number cell (uses/charges/hit dice). */
export function UsesCell({
  current,
  max,
  disabled,
  onCurrent,
  onMax,
}: {
  current: number;
  max: number;
  disabled?: boolean;
  onCurrent: (value: number) => void;
  onMax: (value: number) => void;
}) {
  return (
    <span className="uses-cell">
      <NumberInput value={current} min={0} allowNegative={false} disabled={disabled} onCommit={onCurrent} aria-label="current" />
      <span className="muted">/</span>
      <NumberInput value={max} min={0} allowNegative={false} disabled={disabled} onCommit={onMax} aria-label="max" />
    </span>
  );
}

/** Spell-slot pips: click a pip to spend/restore. */
export function SlotPips({
  current,
  max,
  disabled,
  onChange,
}: {
  current: number;
  max: number;
  disabled?: boolean;
  onChange: (current: number) => void;
}) {
  if (max <= 0) return null;
  return (
    <span className="slot-pips" title={`${current}/${max} slots`}>
      {Array.from({ length: max }, (_, i) => (
        <button
          type="button"
          key={i}
          className={`slot-pip ${i < current ? "slot-pip--full" : ""}`}
          disabled={disabled}
          onClick={() => onChange(i < current ? i : i + 1)}
        />
      ))}
    </span>
  );
}

/** An editable pill list: add via input+Enter, ✕ removes. */
export function PillList({
  label,
  values,
  canEdit,
  hidden,
  onChange,
}: {
  label: string;
  values: string[];
  canEdit: boolean;
  hidden?: boolean;
  onChange: (values: string[]) => void;
}) {
  if (hidden) {
    return (
      <div className="pill-list">
        <div className="pill-list-label">{label}</div>
        <span className="muted">???</span>
      </div>
    );
  }
  return (
    <div className="pill-list">
      <div className="pill-list-label">{label}</div>
      <div className="pill-list-items">
        {values.map((v, i) => (
          <span className="pill" key={`${v}-${i}`}>
            {v}
            {canEdit ? (
              <button
                type="button"
                className="pill-x"
                title="Remove"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            ) : null}
          </span>
        ))}
        {canEdit ? (
          <input
            className="pill-add"
            placeholder="+ add"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const text = e.currentTarget.value.trim();
                if (text) {
                  onChange([...values, text]);
                  e.currentTarget.value = "";
                }
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** A section header row with an optional trailing "+ add" action. */
export function SectionHeader({
  title,
  onAdd,
  addLabel = "+ add",
}: {
  title: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="sheet-section-head">
      <span className="sheet-section-title">{title}</span>
      {onAdd ? (
        <button type="button" className="btn-ghost sheet-add-btn" onClick={onAdd}>
          {addLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Re-export for pages. */
export { formatModifier };
