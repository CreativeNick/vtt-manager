import {
  DEFAULT_SHEET_TEMPLATE,
  rowId,
  type SpellEntry,
} from "../../../lib/types";
import { NumberInput } from "../../NumberInput";
import { RowTable, type RowGroup } from "../RowTable";
import { SlotPips } from "../atoms";
import { type SheetEdit } from "../context";

function levelTitle(level: number): string {
  return level === 0 ? "Cantrips" : `Level ${level}`;
}

/**
 * The Spells page: a manual spellcasting header (ability / attack / save DC), spell-slot
 * pips per level, and a per-level spell list. Always present — simply empty for
 * non-casters (never hidden).
 */
export function SpellsPage({ sheet }: { sheet: SheetEdit }) {
  const { value, canEdit, update } = sheet;

  const patchSpell = (id: string, patch: Partial<SpellEntry>) =>
    update({ spells: value.spells.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const addSpell = (level: number) =>
    update({ spells: [...value.spells, { id: rowId("spell"), name: "New spell", level }] });

  const setSlot = (level: number, patch: { current?: number; max?: number }) => {
    const cur = value.spellSlots[String(level)] ?? { current: 0, max: 0 };
    update({ spellSlots: { ...value.spellSlots, [String(level)]: { ...cur, ...patch } } });
  };

  const levels = [...new Set(value.spells.map((s) => s.level))].sort((a, b) => a - b);
  const groups: RowGroup<SpellEntry>[] = levels.map((level) => ({
    id: String(level),
    title: levelTitle(level),
    rows: value.spells.filter((s) => s.level === level),
    onAdd: canEdit ? () => addSpell(level) : undefined,
  }));

  const slotLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
    (lv) => canEdit || (value.spellSlots[String(lv)]?.max ?? 0) > 0,
  );

  return (
    <div className="sheet-page spells-page">
      <div className="spellcasting-card">
        <div className="spellcasting-cell">
          <span className="sc-label">Ability</span>
          {canEdit ? (
            <select value={value.spellcasting.abilityId} onChange={(e) => update({ spellcasting: { ...value.spellcasting, abilityId: e.target.value } })}>
              <option value="">—</option>
              {DEFAULT_SHEET_TEMPLATE.abilities.map((a) => (
                <option key={a.id} value={a.id}>{a.abbr}</option>
              ))}
            </select>
          ) : (
            <span className="sc-value">{DEFAULT_SHEET_TEMPLATE.abilities.find((a) => a.id === value.spellcasting.abilityId)?.abbr ?? "—"}</span>
          )}
        </div>
        <div className="spellcasting-cell">
          <span className="sc-label">Attack</span>
          {canEdit ? (
            <NumberInput className="sc-value" value={value.spellcasting.attackBonus} onCommit={(attackBonus) => update({ spellcasting: { ...value.spellcasting, attackBonus } })} aria-label="Spell attack bonus" />
          ) : (
            <span className="sc-value">{value.spellcasting.attackBonus >= 0 ? `+${value.spellcasting.attackBonus}` : value.spellcasting.attackBonus}</span>
          )}
        </div>
        <div className="spellcasting-cell">
          <span className="sc-label">Spell DC</span>
          {canEdit ? (
            <NumberInput className="sc-value" value={value.spellcasting.saveDc} min={0} allowNegative={false} onCommit={(saveDc) => update({ spellcasting: { ...value.spellcasting, saveDc } })} aria-label="Spell save DC" />
          ) : (
            <span className="sc-value">{value.spellcasting.saveDc}</span>
          )}
        </div>
      </div>

      {slotLevels.length > 0 ? (
        <div className="spell-slots">
          {slotLevels.map((lv) => {
            const slot = value.spellSlots[String(lv)] ?? { current: 0, max: 0 };
            return (
              <div className="spell-slot-row" key={lv}>
                <span className="spell-slot-lv">Lv {lv}</span>
                <SlotPips current={slot.current} max={slot.max} disabled={!canEdit} onChange={(current) => setSlot(lv, { current })} />
                {canEdit ? (
                  <span className="spell-slot-max">
                    max <NumberInput value={slot.max} min={0} allowNegative={false} onCommit={(max) => setSlot(lv, { max, current: Math.min(slot.current, max) })} aria-label={`Level ${lv} max slots`} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {canEdit ? (
        <div className="spell-add-bar">
          <button type="button" className="btn-ghost" onClick={() => addSpell(0)}>＋ Cantrip</button>
          <button type="button" className="btn-ghost" onClick={() => addSpell(1)}>＋ Spell</button>
        </div>
      ) : null}

      <RowTable
        groups={groups}
        canEdit={canEdit}
        getSearchText={(r) => `${r.name} ${r.components ?? ""}`}
        emptyHint="No spells. This page stays available for non-casters."
        onRemove={canEdit ? (row) => update({ spells: value.spells.filter((s) => s.id !== row.id) }) : undefined}
        renderName={(row) => (
          <div className="inv-name">
            {canEdit ? (
              <input className="inv-name-input" value={row.name} onChange={(e) => patchSpell(row.id, { name: e.target.value })} aria-label="Spell name" />
            ) : (
              <span className="inv-name-text">{row.name}</span>
            )}
            {row.components ? <span className="inv-subtitle">{row.components}</span> : null}
          </div>
        )}
        renderCells={(row) => (
          <>
            <span className="inv-cell inv-cell--sm">{row.time || "—"}</span>
            <span className="inv-cell inv-cell--sm">{row.range || "—"}</span>
            <span className="inv-cell inv-cell--sm">{row.target || "—"}</span>
            <span className="inv-cell inv-equip">
              <button
                type="button"
                className={`prepared-toggle ${row.prepared ? "prepared-toggle--on" : ""}`}
                disabled={!canEdit}
                title={row.prepared ? "Prepared" : "Not prepared"}
                onClick={() => patchSpell(row.id, { prepared: !row.prepared })}
              >
                ✓
              </button>
            </span>
          </>
        )}
        renderExpand={(row) => (
          <div className="inv-expand">
            <div className="inv-expand-grid">
              <label>Level</label>
              <NumberInput value={row.level} min={0} max={9} allowNegative={false} disabled={!canEdit} onCommit={(level) => patchSpell(row.id, { level })} aria-label="Spell level" />
              <label>Components</label>
              <input value={row.components ?? ""} disabled={!canEdit} placeholder="V,S,M" onChange={(e) => patchSpell(row.id, { components: e.target.value })} />
              <label>Time</label>
              <input value={row.time ?? ""} disabled={!canEdit} onChange={(e) => patchSpell(row.id, { time: e.target.value })} />
              <label>Range</label>
              <input value={row.range ?? ""} disabled={!canEdit} onChange={(e) => patchSpell(row.id, { range: e.target.value })} />
              <label>Target</label>
              <input value={row.target ?? ""} disabled={!canEdit} onChange={(e) => patchSpell(row.id, { target: e.target.value })} />
              <label>Roll</label>
              <input value={row.roll ?? ""} disabled={!canEdit} placeholder="e.g. 2d8" onChange={(e) => patchSpell(row.id, { roll: e.target.value })} />
            </div>
            <label>Description</label>
            <textarea value={row.description ?? ""} disabled={!canEdit} rows={3} onChange={(e) => patchSpell(row.id, { description: e.target.value })} />
          </div>
        )}
      />
    </div>
  );
}
