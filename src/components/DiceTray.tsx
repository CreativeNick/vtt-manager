import { useEffect, useState } from "react";
import { DICE_QUICK_SIDES } from "../lib/dice";
import type { DiceOverlayController } from "../dice/useDiceOverlay";

type DiceTrayProps = {
  /** Slides up into view when true, down out of view when false (stays mounted). */
  open: boolean;
  isDm: boolean;
  secret: boolean;
  onToggleSecret: (on: boolean) => void;
  controller: DiceOverlayController;
  /** Text-roll fallback (3D off, engine warming up, or invalid for 3D). */
  onTextRoll: (expression: string) => void;
  onClose: () => void;
};

/// <summary>
/// The dice tray: a bottom-center drawer holding a physical rack of 3D dice in a felt
/// well. Click a d# button to ready dice — the matching dice glow (click again for more,
/// right-click to put one back) — then drag any glowing die out of the tray to pick the
/// whole set up, shake, and throw onto the board. Dragging an unlit die throws just that
/// one. Falls back to text rolls when 3D is off. Toggling the tray slides it in and out.
/// </summary>
export function DiceTray({
  open,
  isDm,
  secret,
  onToggleSecret,
  controller,
  onTextRoll,
  onClose,
}: DiceTrayProps) {
  const [expression, setExpression] = useState("1d20");

  const selectionActive = Object.keys(controller.selection).length > 0;

  // Esc puts readied dice back.
  useEffect(() => {
    if (!selectionActive) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        controller.clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionActive, controller]);

  const rollExpression = () => {
    const expr = expression.trim();
    if (!expr) {
      return;
    }
    if (!controller.throwExpression(expr)) {
      onTextRoll(expr);
    }
  };

  return (
    <div className={`dice-tray${open ? " dice-tray--open" : ""}`} aria-hidden={!open}>
      {controller.enabled ? (
        <div
          className="dice-tray-well"
          ref={controller.trayMountRef}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if (controller.grabFromTray(event)) {
              event.preventDefault();
            }
          }}
        />
      ) : null}

      <div className="dice-tray-controls">
        <button
          className="chip-btn dice-put-back"
          disabled={!selectionActive}
          title="Put all readied dice back (Esc). Right-click a d# button to put back just one."
          onClick={controller.clearSelection}
        >
          ↩
        </button>

        {DICE_QUICK_SIDES.map((sides) => {
          const count = controller.selection[sides] ?? 0;
          return (
            <button
              key={sides}
              className={`die-btn${count > 0 ? " die-btn--sel" : ""}`}
              title={
                controller.enabled
                  ? `d${sides} — click to ready a die (right-click puts one back), then drag it out of the tray to throw`
                  : `d${sides} — roll 1d${sides}`
              }
              onClick={() => {
                if (controller.enabled) {
                  controller.adjustSelection(sides, 1);
                } else {
                  onTextRoll(`1d${sides}`);
                }
              }}
              onContextMenu={(event) => {
                if (controller.enabled) {
                  event.preventDefault();
                  controller.adjustSelection(sides, -1);
                }
              }}
            >
              d{sides}
              {count > 0 ? <span className="die-count">{count}</span> : null}
            </button>
          );
        })}

        <input
          className="dice-tray-expr"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rollExpression();
          }}
          placeholder="2d6+3"
          aria-label="Dice expression"
        />
        <button className="btn-primary" onClick={rollExpression}>
          Roll
        </button>

        {isDm ? (
          <button
            className={`chip-btn ${secret ? "btn-active" : ""}`}
            title="While on, every roll you make is secret — players see blank dice and a masked log entry"
            onClick={() => onToggleSecret(!secret)}
          >
            🔒
          </button>
        ) : null}
        <button
          className={`chip-btn ${controller.enabled ? "btn-active" : ""}`}
          title={controller.enabled ? "3D dice: on" : "3D dice: off (text rolls)"}
          onClick={() => controller.setEnabled(!controller.enabled)}
        >
          3D
        </button>
        {controller.enabled ? (
          <button
            className="chip-btn"
            title={controller.muted ? "Unmute dice" : "Mute dice"}
            onClick={() => controller.setMuted(!controller.muted)}
          >
            {controller.muted ? "🔇" : "🔊"}
          </button>
        ) : null}
        <button className="btn-ghost icon-btn" title="Hide tray" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
