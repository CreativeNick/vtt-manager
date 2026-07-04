import { useState } from "react";
import type { HitPoints } from "../lib/types";

/**
 * Quick damage/heal control (Phase 7). Shows current/max (+temp) HP and a small amount
 * field with − / + buttons that apply ADJUST_HP deltas (− damages, + heals). Used on the
 * initiative rows, the DM token editor, and the right-click token popover.
 */
export function HpStepper({
  hp,
  canEdit,
  onAdjust,
  compact,
}: {
  hp: HitPoints;
  canEdit: boolean;
  onAdjust: (delta: number) => void;
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
        {hp.current}
        <span className="muted">/{hp.max}</span>
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
