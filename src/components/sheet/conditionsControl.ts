import type { ClientMessage, Token } from "../../lib/types";
import type { SheetEdit } from "./context";

/**
 * Builds the Effects-page conditions control: a view over the sheet's linked tokens.
 * A condition is active if any linked token has it; toggling writes SET_TOKEN_CONDITIONS
 * to every linked token (the server authorizes — DM any, player own token only).
 */
export function buildConditionsControl(
  tokens: Token[],
  sheetId: string,
  canEdit: boolean,
  send: (message: ClientMessage) => void,
): SheetEdit["conditions"] {
  const linked = tokens.filter((token) => token.sheetId === sheetId);
  const active = new Set<string>();
  for (const token of linked) {
    for (const condition of token.conditions) active.add(condition);
  }
  return {
    active,
    linkedTokenCount: canEdit ? linked.length : 0,
    toggle: (conditionId, on) => {
      for (const token of linked) {
        const next = on
          ? [...new Set([...token.conditions, conditionId])]
          : token.conditions.filter((c) => c !== conditionId);
        send({ type: "SET_TOKEN_CONDITIONS", tokenId: token.id, conditions: next });
      }
    },
  };
}
