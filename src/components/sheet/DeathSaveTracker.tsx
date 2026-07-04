import { useState } from "react";
import type { DeathSaves } from "../../lib/types";

/**
 * A skull button that toggles a slide-down death-save tracker (PC only): 3 success
 * slots on the left, 3 failure slots on the right, click to fill. Collapsed by default.
 */
export function DeathSaveTracker({
  value,
  canEdit,
  onChange,
}: {
  value: DeathSaves;
  canEdit: boolean;
  onChange: (next: DeathSaves) => void;
}) {
  const [open, setOpen] = useState(false);

  const setSuccesses = (n: number) => onChange({ ...value, successes: value.successes === n ? n - 1 : n });
  const setFailures = (n: number) => onChange({ ...value, failures: value.failures === n ? n - 1 : n });

  return (
    <div className="death-saves">
      <button
        type="button"
        className={`death-skull ${open ? "death-skull--open" : ""} ${value.successes || value.failures ? "death-skull--active" : ""}`}
        title="Death saves"
        onClick={() => setOpen((v) => !v)}
      >
        💀
      </button>
      {open ? (
        <div className="death-tracker">
          <div className="death-col" title="Successes">
            {[1, 2, 3].map((n) => (
              <button
                type="button"
                key={n}
                className={`death-pip death-pip--success ${value.successes >= n ? "death-pip--full" : ""}`}
                disabled={!canEdit}
                onClick={() => setSuccesses(n)}
              />
            ))}
          </div>
          <span className="death-skull-mid">💀</span>
          <div className="death-col" title="Failures">
            {[1, 2, 3].map((n) => (
              <button
                type="button"
                key={n}
                className={`death-pip death-pip--fail ${value.failures >= n ? "death-pip--full" : ""}`}
                disabled={!canEdit}
                onClick={() => setFailures(n)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
