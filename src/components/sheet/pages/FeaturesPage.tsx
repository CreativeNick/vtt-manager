import {
  rowId,
  type AttackEntry,
  type FeatureEntry,
} from "../../../lib/types";
import { NumberInput } from "../../NumberInput";
import { RowTable, type RowGroup } from "../RowTable";
import { UsesCell } from "../atoms";
import { advFromEvent, ROLL_HINT, type SheetEdit } from "../context";
import { AbilityRow, SavesRow } from "./MainPage";


type AttackRow = AttackEntry & { derived?: boolean };

const FEATURE_GROUPS: Array<{ id: FeatureEntry["source"]; title: string }> = [
  { id: "class", title: "Class Features" },
  { id: "species", title: "Species Features" },
  { id: "feat", title: "Feats" },
  { id: "other", title: "Other" },
];

/**
 * The Features page. For NPCs this is the home page: it leads with the ability blocks +
 * saving-throw row (the missing Main tab), then an Actions table, then Features. The
 * Actions table merges manual `attacks` with equipped inventory weapons (derived rows,
 * read-only here — edit them in Inventory).
 */
export function FeaturesPage({ sheet }: { sheet: SheetEdit }) {
  const { value, canEdit, kind, update, onRollCheck } = sheet;
  const isNpc = kind === "npc";

  const derived: AttackRow[] = value.inventory
    .filter((r) => r.equipped && r.damage)
    .map((r) => ({ id: `inv:${r.id}`, name: r.name, toHit: r.toHit ?? 0, damage: r.damage ?? "", damageType: r.damageType, derived: true }));
  const attackRows: AttackRow[] = [...value.attacks, ...derived];

  const patchAttack = (id: string, patch: Partial<AttackEntry>) =>
    update({ attacks: value.attacks.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const addAttack = () =>
    update({ attacks: [...value.attacks, { id: rowId("atk"), name: "New action", toHit: 0, damage: "1d6" }] });

  const patchFeature = (id: string, patch: Partial<FeatureEntry>) =>
    update({ features: value.features.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const addFeature = (source: FeatureEntry["source"]) =>
    update({ features: [...value.features, { id: rowId("feat"), name: "New feature", source, description: "" }] });

  const featureGroups: RowGroup<FeatureEntry>[] = FEATURE_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    rows: value.features.filter((f) => f.source === g.id),
    onAdd: canEdit ? () => addFeature(g.id) : undefined,
  }));

  return (
    <div className="sheet-page features-page">
      {isNpc ? (
        <div className="npc-stat-header">
          <AbilityRow sheet={sheet} />
          <SavesRow sheet={sheet} />
        </div>
      ) : (
        <div className="class-chip">
          {value.characterClass || "Class"} {value.subclass ? `· ${value.subclass}` : ""} {value.level}
        </div>
      )}

      <RowTable
        groups={[{ id: "actions", title: isNpc ? "Actions" : "Attacks & Actions", rows: attackRows, onAdd: canEdit ? addAttack : undefined }]}
        canEdit={canEdit}
        getSearchText={(r) => r.name}
        emptyHint="No actions. Add one, or equip a weapon in Inventory."
        onRemove={canEdit ? (row) => { if (!row.derived) update({ attacks: value.attacks.filter((a) => a.id !== row.id) }); } : undefined}
        renderName={(row) => (
          <div className="inv-name">
            {canEdit && !row.derived ? (
              <input className="inv-name-input" value={row.name} onChange={(e) => patchAttack(row.id, { name: e.target.value })} aria-label="Action name" />
            ) : (
              <span className="inv-name-text">{row.name}{row.derived ? <span className="inv-subtitle">equipped</span> : null}</span>
            )}
          </div>
        )}
        renderCells={(row) => (
          <>
            <span className="inv-cell">
              {onRollCheck ? (
                <button className="roll-btn" title={`${row.name} attack — ${ROLL_HINT}`} onClick={(e) => onRollCheck({ kind: "attack", rowId: row.id }, advFromEvent(e))}>
                  {row.toHit >= 0 ? `+${row.toHit}` : row.toHit}
                </button>
              ) : (
                <span>{row.toHit >= 0 ? `+${row.toHit}` : row.toHit}</span>
              )}
            </span>
            <span className="inv-cell">
              {onRollCheck && row.damage ? (
                <button className="roll-btn" title={`${row.name} damage`} onClick={() => onRollCheck({ kind: "damage", rowId: row.id })}>
                  {row.damage}
                </button>
              ) : (
                <span>{row.damage || "—"}</span>
              )}
            </span>
          </>
        )}
        renderExpand={(row) =>
          row.derived ? (
            <div className="rt-expand-note muted">Edit this weapon in the Inventory page.</div>
          ) : (
            <div className="inv-expand">
              <div className="inv-expand-grid">
                <label>To hit</label>
                <NumberInput value={row.toHit} disabled={!canEdit} onCommit={(toHit) => patchAttack(row.id, { toHit })} aria-label="To hit" />
                <label>Damage</label>
                <input value={row.damage} disabled={!canEdit} onChange={(e) => patchAttack(row.id, { damage: e.target.value })} />
                <label>Type</label>
                <input value={row.damageType ?? ""} disabled={!canEdit} onChange={(e) => patchAttack(row.id, { damageType: e.target.value })} />
              </div>
              <label>Notes</label>
              <textarea value={row.notes ?? ""} disabled={!canEdit} rows={2} onChange={(e) => patchAttack(row.id, { notes: e.target.value })} />
            </div>
          )
        }
      />

      <RowTable
        groups={featureGroups}
        canEdit={canEdit}
        getSearchText={(r) => r.name}
        emptyHint="No features."
        onRemove={canEdit ? (row) => update({ features: value.features.filter((f) => f.id !== row.id) }) : undefined}
        renderName={(row) => (
          <div className="inv-name">
            {canEdit ? (
              <input className="inv-name-input" value={row.name} onChange={(e) => patchFeature(row.id, { name: e.target.value })} aria-label="Feature name" />
            ) : (
              <span className="inv-name-text">{row.name}</span>
            )}
          </div>
        )}
        renderCells={(row) => (
          <>
            <span className="inv-cell" title="Uses">
              {row.uses || canEdit ? (
                <UsesCell
                  current={row.uses?.current ?? 0}
                  max={row.uses?.max ?? 0}
                  disabled={!canEdit}
                  onCurrent={(current) => patchFeature(row.id, { uses: { current, max: row.uses?.max ?? 0 } })}
                  onMax={(max) => patchFeature(row.id, { uses: { current: row.uses?.current ?? 0, max } })}
                />
              ) : (
                <span>—</span>
              )}
            </span>
            <span className="inv-cell" title="Recovery">
              {canEdit ? (
                <select value={row.recovery ?? ""} onChange={(e) => patchFeature(row.id, { recovery: (e.target.value || undefined) as FeatureEntry["recovery"] })}>
                  <option value="">—</option>
                  <option value="sr">SR</option>
                  <option value="lr">LR</option>
                </select>
              ) : (
                <span>{row.recovery ? row.recovery.toUpperCase() : "—"}</span>
              )}
            </span>
          </>
        )}
        renderExpand={(row) => (
          <div className="inv-expand">
            <label>Description</label>
            <textarea value={row.description} disabled={!canEdit} rows={3} onChange={(e) => patchFeature(row.id, { description: e.target.value })} />
          </div>
        )}
      />
    </div>
  );
}
