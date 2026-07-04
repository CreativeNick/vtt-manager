import {
  createInventoryRow,
  INVENTORY_CATEGORIES,
  type Currency,
  type InventoryCategory,
  type InventoryEntry,
} from "../../../lib/types";
import { NumberInput } from "../../NumberInput";
import { RowTable, type RowGroup } from "../RowTable";
import { advFromEvent, ROLL_HINT, type SheetEdit } from "../context";


const CATEGORY_TITLES: Record<InventoryCategory, string> = {
  weapon: "Weapons",
  equipment: "Equipment",
  consumable: "Consumables",
  loot: "Loot",
};

const CURRENCY_KEYS: Array<{ key: keyof Currency; label: string }> = [
  { key: "cp", label: "CP" },
  { key: "sp", label: "SP" },
  { key: "ep", label: "EP" },
  { key: "gp", label: "GP" },
  { key: "pp", label: "PP" },
];

/**
 * The Inventory page: encumbrance header (carried weight vs manual capacity), currency,
 * attunement counter, and item tables grouped by category. Carried weight is a
 * client-side display sum — no rules automation (Phase 7 manual-fields-first).
 */
export function InventoryPage({ sheet }: { sheet: SheetEdit }) {
  const { value, canEdit, update, onRollCheck } = sheet;

  const setRows = (rows: InventoryEntry[]) => update({ inventory: rows });
  const patchRow = (id: string, patch: Partial<InventoryEntry>) =>
    setRows(value.inventory.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const carried = value.inventory.reduce((sum, r) => sum + (r.weight ?? 0) * r.qty, 0);
  const over = value.carryCapacity > 0 && carried > value.carryCapacity;
  const attunedCount = value.inventory.filter((r) => r.attuned).length;

  const groups: RowGroup<InventoryEntry>[] = INVENTORY_CATEGORIES.map((category) => ({
    id: category,
    title: CATEGORY_TITLES[category],
    rows: value.inventory.filter((r) => r.category === category),
    onAdd: canEdit ? () => setRows([...value.inventory, createInventoryRow({ category })]) : undefined,
  }));

  return (
    <div className="sheet-page inventory-page">
      <div className="encumbrance">
        <div className={`encumbrance-bar ${over ? "encumbrance-bar--over" : ""}`}>
          <div
            className="encumbrance-fill"
            style={{ width: `${value.carryCapacity > 0 ? Math.min(100, (carried / value.carryCapacity) * 100) : 0}%` }}
          />
          <span className="encumbrance-text">
            {carried.toFixed(carried % 1 ? 1 : 0)} / {value.carryCapacity || "—"}
          </span>
        </div>
        <div className="encumbrance-stats">
          <div className="enc-stat">
            <span className="enc-stat-label">Strength</span>
            <span className="enc-stat-value">{value.abilityScores["str"] ?? 10}</span>
          </div>
          <div className="enc-stat">
            <span className="enc-stat-label">Size</span>
            <span className="enc-stat-value">{value.size || "—"}</span>
          </div>
          <div className="enc-stat">
            <span className="enc-stat-label">Capacity</span>
            {canEdit ? (
              <NumberInput value={value.carryCapacity} min={0} allowNegative={false} onCommit={(carryCapacity) => update({ carryCapacity })} aria-label="Carry capacity" />
            ) : (
              <span className="enc-stat-value">{value.carryCapacity}</span>
            )}
          </div>
          <div className="enc-stat">
            <span className="enc-stat-label">Attunement</span>
            <span className="enc-stat-value">
              {attunedCount} /{" "}
              {canEdit ? (
                <NumberInput className="enc-attune-max" value={value.attunementMax} min={0} allowNegative={false} onCommit={(attunementMax) => update({ attunementMax })} aria-label="Attunement max" />
              ) : (
                value.attunementMax
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="currency-row">
        {CURRENCY_KEYS.map(({ key, label }) => (
          <div className="currency-cell" key={key}>
            <span className="currency-label">{label}</span>
            {canEdit ? (
              <NumberInput value={value.currency[key]} min={0} allowNegative={false} onCommit={(n) => update({ currency: { ...value.currency, [key]: n } })} aria-label={label} />
            ) : (
              <span>{value.currency[key]}</span>
            )}
          </div>
        ))}
      </div>

      <RowTable
        groups={groups}
        canEdit={canEdit}
        getSearchText={(r) => `${r.name} ${r.note} ${r.damageType ?? ""}`}
        emptyHint="No items. Drag from the Items tab, or add a row per category."
        onRemove={canEdit ? (row) => setRows(value.inventory.filter((r) => r.id !== row.id)) : undefined}
        renderName={(row) => (
          <div className="inv-name">
            {canEdit ? (
              <input className="inv-name-input" value={row.name} onChange={(e) => patchRow(row.id, { name: e.target.value })} aria-label="Item name" />
            ) : (
              <span className="inv-name-text">{row.name}</span>
            )}
            {row.damageType ? <span className="inv-subtitle">{row.damageType}</span> : null}
          </div>
        )}
        renderCells={(row) => (
          <>
            {row.category === "weapon" ? (
              <>
                <span className="inv-cell">
                  {onRollCheck ? (
                    <button className="roll-btn" title={`${row.name} attack — ${ROLL_HINT}`} onClick={(e) => onRollCheck({ kind: "attack", rowId: row.id }, advFromEvent(e))}>
                      {(row.toHit ?? 0) >= 0 ? `+${row.toHit ?? 0}` : row.toHit}
                    </button>
                  ) : (
                    <span>{(row.toHit ?? 0) >= 0 ? `+${row.toHit ?? 0}` : row.toHit}</span>
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
            ) : (
              <>
                <span className="inv-cell" title="Weight">
                  {canEdit ? (
                    <NumberInput className="inv-num" value={row.weight ?? 0} min={0} allowNegative={false} onCommit={(weight) => patchRow(row.id, { weight })} aria-label="Weight" />
                  ) : (
                    <span>{row.weight ?? "—"}</span>
                  )}
                </span>
                <span className="inv-cell inv-qty" title="Quantity">
                  {canEdit ? (
                    <>
                      <button className="qty-step" onClick={() => patchRow(row.id, { qty: Math.max(1, row.qty - 1) })}>−</button>
                      <span>{row.qty}</span>
                      <button className="qty-step" onClick={() => patchRow(row.id, { qty: row.qty + 1 })}>+</button>
                    </>
                  ) : (
                    <span>×{row.qty}</span>
                  )}
                </span>
              </>
            )}
            <span className="inv-cell inv-equip">
              {row.category === "weapon" || row.category === "equipment" ? (
                <button
                  type="button"
                  className={`equip-toggle ${row.equipped ? "equip-toggle--on" : ""}`}
                  disabled={!canEdit}
                  title={row.equipped ? "Equipped" : "Not equipped"}
                  onClick={() => patchRow(row.id, { equipped: !row.equipped })}
                >
                  🛡
                </button>
              ) : null}
              <button
                type="button"
                className={`attune-toggle ${row.attuned ? "attune-toggle--on" : ""}`}
                disabled={!canEdit}
                title={row.attuned ? "Attuned" : "Not attuned"}
                onClick={() => patchRow(row.id, { attuned: !row.attuned })}
              >
                ✦
              </button>
            </span>
          </>
        )}
        renderExpand={(row) => (
          <div className="inv-expand">
            <div className="inv-expand-grid">
              <label>Price</label>
              {canEdit ? (
                <input value={row.price ?? ""} placeholder="5 gp" onChange={(e) => patchRow(row.id, { price: e.target.value })} />
              ) : (
                <span>{row.price || "—"}</span>
              )}
              <label>Charges</label>
              {canEdit ? (
                <span className="uses-cell">
                  <NumberInput value={row.charges?.current ?? 0} min={0} allowNegative={false} onCommit={(current) => patchRow(row.id, { charges: { current, max: row.charges?.max ?? 0 } })} aria-label="Charges current" />
                  <span className="muted">/</span>
                  <NumberInput value={row.charges?.max ?? 0} min={0} allowNegative={false} onCommit={(max) => patchRow(row.id, { charges: { current: row.charges?.current ?? 0, max } })} aria-label="Charges max" />
                </span>
              ) : (
                <span>{row.charges ? `${row.charges.current}/${row.charges.max}` : "—"}</span>
              )}
            </div>
            <label>Notes</label>
            <textarea value={row.description ?? row.note} disabled={!canEdit} rows={2} onChange={(e) => patchRow(row.id, { description: e.target.value })} />
          </div>
        )}
      />
    </div>
  );
}
