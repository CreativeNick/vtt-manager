import { NumberInput } from "../NumberInput";
import type { SheetEdit } from "./context";

/** Per-page reveal control (DM viewing an NPC sheet). */
export type RevealControl = { revealed: boolean; onToggle: (revealed: boolean) => void } | null;

/**
 * The persistent sheet header: name + subtitle (PC: "Class Level"; NPC: type line +
 * source · CR), Short/Long Rest buttons, a level/CR ring, and (DM + NPC) the active
 * page's reveal eye.
 */
export function SheetHeader({
  sheet,
  onRest,
  reveal,
}: {
  sheet: SheetEdit;
  onRest?: (kind: "short" | "long") => void;
  reveal: RevealControl;
}) {
  const { value, canEdit, kind, update } = sheet;
  const isNpc = kind === "npc";

  const subtitle = isNpc
    ? [value.size, value.creatureType, value.alignment].filter(Boolean).join(" · ") || "NPC"
    : `${value.characterClass || "Class"} ${value.level}`;

  const meta = isNpc ? [value.source, value.xp ? `${value.xp} XP` : ""].filter(Boolean).join(" · ") : "";

  return (
    <div className="sheet-header">
      <div className="sheet-header-main">
        {canEdit ? (
          <input
            className="sheet-name-input"
            value={value.characterName}
            placeholder="Name"
            onChange={(e) => update({ characterName: e.target.value })}
          />
        ) : (
          <div className="sheet-name">{value.characterName || (sheet.value ? "" : "???")}</div>
        )}
        <div className="sheet-subtitle">{subtitle}</div>
        {meta ? <div className="sheet-meta">{meta}</div> : null}
      </div>

      <div className="sheet-header-actions">
        {onRest ? (
          <>
            <button type="button" className="rest-btn" title="Short rest" onClick={() => onRest("short")}>🍴</button>
            <button type="button" className="rest-btn" title="Long rest" onClick={() => onRest("long")}>⛰</button>
          </>
        ) : null}
        {reveal ? (
          <button
            type="button"
            className={`reveal-toggle ${reveal.revealed ? "reveal-toggle--on" : ""}`}
            title={reveal.revealed ? "Page visible to players — click to hide" : "Page hidden from players — click to reveal"}
            onClick={() => reveal.onToggle(!reveal.revealed)}
          >
            {reveal.revealed ? "👁" : "✕"}
          </button>
        ) : null}
      </div>

      <div className="level-ring" title={isNpc ? "Challenge rating" : "Level"}>
        {canEdit ? (
          isNpc ? (
            <input
              className="level-ring-input"
              value={value.cr}
              placeholder="CR"
              onChange={(e) => update({ cr: e.target.value })}
            />
          ) : (
            <NumberInput className="level-ring-input" value={value.level} min={1} allowNegative={false} onCommit={(level) => update({ level })} aria-label="Level" />
          )
        ) : (
          <span className="level-ring-value">{isNpc ? value.cr || "—" : value.level}</span>
        )}
      </div>
    </div>
  );
}
