import { CONDITIONS, rowId, type EffectEntry } from "../../../lib/types";
import { RowTable } from "../RowTable";
import type { SheetEdit } from "../context";

/**
 * The Effects page: a Passive Effects list plus a Conditions grid. The conditions grid
 * is a VIEW over the sheet's linked tokens — a condition is "on" if any linked token has
 * it, and toggling writes through to those tokens (Token.conditions stays the single
 * source of truth, so there's no sheet-side copy to keep in sync).
 */
export function EffectsPage({ sheet }: { sheet: SheetEdit }) {
  const { value, canEdit, update, conditions } = sheet;

  const patchEffect = (id: string, patch: Partial<EffectEntry>) =>
    update({ effects: value.effects.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const addEffect = () =>
    update({ effects: [...value.effects, { id: rowId("eff"), name: "New effect", enabled: true }] });

  const canToggleConditions = Boolean(conditions && conditions.linkedTokenCount > 0);

  return (
    <div className="sheet-page effects-page">
      <RowTable
        groups={[{ id: "passive", title: "Passive Effects", rows: value.effects, onAdd: canEdit ? addEffect : undefined }]}
        canEdit={canEdit}
        emptyHint="No passive effects."
        onRemove={canEdit ? (row) => update({ effects: value.effects.filter((e) => e.id !== row.id) }) : undefined}
        renderName={(row) => (
          <div className="inv-name">
            {canEdit ? (
              <input className="inv-name-input" value={row.name} onChange={(e) => patchEffect(row.id, { name: e.target.value })} aria-label="Effect name" />
            ) : (
              <span className="inv-name-text">{row.name}</span>
            )}
            {row.source ? <span className="inv-subtitle">{row.source}</span> : null}
          </div>
        )}
        renderCells={(row) => (
          <span className="inv-cell inv-equip">
            <button
              type="button"
              className={`effect-toggle ${row.enabled ? "effect-toggle--on" : ""}`}
              disabled={!canEdit}
              title={row.enabled ? "Enabled" : "Disabled"}
              onClick={() => patchEffect(row.id, { enabled: !row.enabled })}
            >
              {row.enabled ? "◉" : "○"}
            </button>
          </span>
        )}
        renderExpand={(row) => (
          <div className="inv-expand">
            <div className="inv-expand-grid">
              <label>Source</label>
              <input value={row.source ?? ""} disabled={!canEdit} onChange={(e) => patchEffect(row.id, { source: e.target.value })} />
            </div>
            <label>Description</label>
            <textarea value={row.description ?? ""} disabled={!canEdit} rows={2} onChange={(e) => patchEffect(row.id, { description: e.target.value })} />
          </div>
        )}
      />

      <div className="conditions-section">
        <div className="sheet-section-head">
          <span className="sheet-section-title">Conditions</span>
          {!canToggleConditions ? (
            <span className="muted conditions-hint">
              {conditions ? "Link a token to toggle conditions" : "No linked token"}
            </span>
          ) : null}
        </div>
        <div className="conditions-grid">
          {CONDITIONS.map((cond) => {
            const on = conditions?.active.has(cond.id) ?? false;
            return (
              <button
                type="button"
                key={cond.id}
                className={`condition-cell ${on ? "condition-cell--on" : ""}`}
                disabled={!canToggleConditions}
                title={cond.label}
                onClick={() => conditions?.toggle(cond.id, !on)}
              >
                <span className="condition-emoji">{cond.emoji}</span>
                <span className="condition-name">{cond.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
