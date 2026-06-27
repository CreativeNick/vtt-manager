import { useState } from "react";
import { DICE_QUICK_SIDES, formatDiceRoll } from "../lib/dice";
import type { DiceRoll } from "../lib/types";

type DicePanelProps = {
  isDm: boolean;
  yourPlayerId: string | null;
  publicRolls: DiceRoll[];
  privateRolls: DiceRoll[];
  onRoll: (expression: string, options?: { private?: boolean }) => void;
};

/// <summary>
/// Shared dice tray with a public log for everyone and a secret log visible only to the DM.
/// </summary>
export function DicePanel({
  isDm,
  yourPlayerId,
  publicRolls,
  privateRolls,
  onRoll,
}: DicePanelProps) {
  const [expression, setExpression] = useState("1d20");
  const [collapsed, setCollapsed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submitRoll = (nextExpression: string, isPrivate: boolean) => {
    const trimmed = nextExpression.trim();
    if (!trimmed) {
      setLocalError("Enter a dice expression.");
      return;
    }
    setLocalError(null);
    onRoll(trimmed, { private: isPrivate });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submitRoll(expression, false);
  };

  const handleSecretSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submitRoll(expression, true);
  };

  if (collapsed) {
    return (
      <footer className="dice-tray dice-tray-collapsed">
        <button
          type="button"
          className="dice-tray-toggle"
          aria-expanded={false}
          title="Show dice panel"
          onClick={() => setCollapsed(false)}
        >
          Dice
          {publicRolls.length > 0 ? (
            <span className="dice-tray-badge">{publicRolls[publicRolls.length - 1]?.total}</span>
          ) : null}
        </button>
      </footer>
    );
  }

  return (
    <footer className="dice-tray">
      <div className="dice-tray-header">
        <h2>Dice</h2>
        <button
          type="button"
          className="btn-compact"
          aria-expanded={true}
          onClick={() => setCollapsed(true)}
        >
          Hide
        </button>
      </div>

      <div className="dice-tray-body">
        <div className="dice-tray-controls">
          <form className="dice-roll-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              placeholder="1d20+5"
              aria-label="Dice expression"
              spellCheck={false}
            />
            <button type="submit">Roll</button>
          </form>

          <div className="dice-quick-row">
            {DICE_QUICK_SIDES.map((sides) => (
              <button
                key={sides}
                type="button"
                className="btn-compact dice-quick-btn"
                onClick={() => setExpression(`1d${sides}`)}
              >
                d{sides}
              </button>
            ))}
          </div>

          {localError ? <p className="dice-error">{localError}</p> : null}

          {isDm ? (
            <section className="dice-secret-section" aria-label="Secret DM rolls">
              <div className="dice-secret-header">
                <h3>Secret rolls</h3>
                <span className="dice-secret-note">Only you can see these</span>
              </div>
              <form className="dice-roll-form dice-secret-form" onSubmit={handleSecretSubmit}>
                <input
                  type="text"
                  value={expression}
                  onChange={(event) => setExpression(event.target.value)}
                  placeholder="1d20"
                  aria-label="Secret dice expression"
                  spellCheck={false}
                />
                <button type="submit" className="dice-secret-button btn-compact" title="Secret roll">
                  Secret
                </button>
              </form>
            </section>
          ) : null}
        </div>

        <div className="dice-tray-logs">
          <section className="dice-public-section" aria-label="Shared dice log">
            <h3>{isDm ? "Player rolls" : "Table log"}</h3>
            <DiceLog
              rolls={publicRolls}
              yourPlayerId={yourPlayerId}
              emptyMessage="No rolls yet. Everyone in the room can see rolls here."
            />
          </section>

          {isDm ? (
            <section className="dice-secret-log-section" aria-label="Secret roll log">
              <h3>Secret log</h3>
              <DiceLog
                rolls={privateRolls}
                yourPlayerId={yourPlayerId}
                emptyMessage="No secret rolls yet."
                secret
              />
            </section>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

type DiceLogProps = {
  rolls: DiceRoll[];
  yourPlayerId: string | null;
  emptyMessage: string;
  secret?: boolean;
};

/// <summary>
/// Renders a scrollable list of dice roll results, newest first.
/// </summary>
function DiceLog({ rolls, yourPlayerId, emptyMessage, secret = false }: DiceLogProps) {
  if (rolls.length === 0) {
    return <p className="dice-log-empty">{emptyMessage}</p>;
  }

  const visible = [...rolls].reverse().slice(0, 30);

  return (
    <ul className={`dice-log${secret ? " dice-log-secret" : ""}`}>
      {visible.map((roll) => {
        const isOwn = yourPlayerId !== null && roll.rollerId === yourPlayerId;
        return (
          <li key={roll.id} className={isOwn ? "dice-log-own" : undefined}>
            <span className="dice-log-roller">{roll.rollerName}</span>
            <span className="dice-log-detail">{formatDiceRoll(roll)}</span>
          </li>
        );
      })}
    </ul>
  );
}
