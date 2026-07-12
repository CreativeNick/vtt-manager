import { useState } from "react";
import type { HitPoints } from "../lib/types";
import { NumberInput } from "./NumberInput";

/**
 * Quick damage/heal control (Phase 7). Shows current/max (+temp) HP and a small amount
 * field with − / + buttons that apply ADJUST_HP deltas (− damages, + heals). Used on the
 * initiative rows, the DM token editor, and the right-click token popover. When `onSetHp`
 * is provided (and the viewer can edit), current/max render as fields that commit typed
 * absolute values instead of read-only text.
 */
export function HpStepper({
  hp,
  canEdit,
  onAdjust,
  onSetHp,
  compact,
}: {
  hp: HitPoints;
  canEdit: boolean;
  onAdjust: (delta: number) => void;
  /** Commit a directly-edited HP block (typed current/max), bypassing the delta path. */
  onSetHp?: (hp: HitPoints) => void;
  compact?: boolean;
}) {
  const [amount, setAmount] = useState(1);
  const amt = Math.max(1, Math.abs(amount) || 1);
  return (
    <span className={`hp-stepper ${compact ? "hp-stepper--compact" : ""}`}>
      {canEdit ? (
        <button type="button" className="hp-step hp-step--dmg" title={`Damage ${amt}`} onClick={() => onAdjust(-amt)}>
          −
        </button>
      ) : null}
      <span className="hp-stepper-value" title="Current / Max HP">
        {canEdit && onSetHp ? (
          <>
            <NumberInput
              className="hp-num"
              value={hp.current}
              min={0}
              allowNegative={false}
              aria-label="Current HP"
              onCommit={(current) => onSetHp({ ...hp, current })}
            />
            <span className="muted">/</span>
            <NumberInput
              className="hp-num"
              value={hp.max}
              min={0}
              allowNegative={false}
              aria-label="Max HP"
              onCommit={(max) => onSetHp({ ...hp, max })}
            />
          </>
        ) : (
          <>
            {hp.current}
            <span className="muted">/{hp.max}</span>
          </>
        )}
        {hp.temp ? <span className="hp-temp" title="Temp HP">+{hp.temp}</span> : null}
      </span>
      {canEdit ? (
        <>
          <button type="button" className="hp-step hp-step--heal" title={`Heal ${amt}`} onClick={() => onAdjust(amt)}>
            +
          </button>
          <input
            className="hp-amount"
            type="text"
            inputMode="numeric"
            value={amount}
            aria-label="HP change amount"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ""));
              setAmount(Number.isFinite(n) ? n : 1);
            }}
          />
        </>
      ) : null}
    </span>
  );
}
