import type { CharacterSheet, CheckSpec, SheetKind, SheetSectionId } from "../../lib/types";

/** Advantage/disadvantage from a modifier-key click (Shift = adv, Alt = dis). */
export type Adv = "adv" | "dis" | undefined;

/**
 * Everything a sheet page/atom needs to render + edit. Threaded from SheetView to
 * every page so PC/NPC variants share one code path (differences are data-driven).
 */
export type SheetEdit = {
  value: CharacterSheet;
  kind: SheetKind;
  canEdit: boolean;
  isDm: boolean;
  /** Merge a partial patch into the draft (debounced to the server). */
  update: (patch: Partial<CharacterSheet>) => void;
  /** Player looking at an unrevealed NPC section: render "???". */
  hiddenFor: (section: SheetSectionId) => boolean;
  /**
   * Roll a structured check attributed to this sheet — the server resolves the modifiers
   * from the sheet and builds the color-coded parts. Absent when the viewer can't roll as
   * this sheet.
   */
  onRollCheck?: (check: CheckSpec, adv?: Adv) => void;
  /**
   * Two-way conditions control (Effects page). A condition is "active" if any linked
   * token has it; toggling sends SET_TOKEN_CONDITIONS to every linked token. Absent
   * where the sheet has no live token context (e.g. read-only viewers).
   */
  conditions?: {
    active: Set<string>;
    linkedTokenCount: number;
    toggle: (conditionId: string, on: boolean) => void;
  };
};

export const ROLL_HINT = "Click to roll (Shift = advantage, Alt = disadvantage)";

/** Shift-click rolls with advantage, Alt-click with disadvantage. */
export function advFromEvent(event: { shiftKey: boolean; altKey: boolean }): Adv {
  if (event.shiftKey) return "adv";
  if (event.altKey) return "dis";
  return undefined;
}

/** Formats a signed modifier into a dice-expression tail, e.g. "+3" / "-1" / "+0". */
export function modExpr(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}
