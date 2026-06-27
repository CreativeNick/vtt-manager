import type { DiceRoll } from "./types";

export type DiceRollResult = {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
};

const DICE_EXPRESSION = /^(\d*)d(\d+)([+-]\d+)?$/i;

/// <summary>
/// Parses and rolls a dice expression such as 1d20+5 or 2d6.
/// </summary>
export function rollDiceExpression(expression: string): DiceRollResult {
  const trimmed = expression.trim().replace(/\s+/g, "");
  const match = trimmed.match(DICE_EXPRESSION);
  if (!match) {
    throw new Error("Use notation like 1d20, 2d6+3, or d20-1.");
  }

  const count = match[1] ? Number.parseInt(match[1], 10) : 1;
  const sides = Number.parseInt(match[2], 10);
  const modifier = match[3] ? Number.parseInt(match[3], 10) : 0;

  if (!Number.isFinite(count) || count < 1 || count > 100) {
    throw new Error("Roll between 1 and 100 dice.");
  }
  if (!Number.isFinite(sides) || sides < 2 || sides > 1000) {
    throw new Error("Die size must be between 2 and 1000.");
  }

  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((sum, value) => sum + value, 0) + modifier;

  return {
    expression: `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : ""}`,
    rolls,
    modifier,
    total,
  };
}

/// <summary>
/// Formats a dice roll for display in the shared or secret log.
/// </summary>
export function formatDiceRoll(roll: Pick<DiceRoll, "expression" | "rolls" | "modifier" | "total">): string {
  const dice =
    roll.rolls.length === 1 ? String(roll.rolls[0]) : `[${roll.rolls.join(", ")}]`;
  if (roll.modifier === 0) {
    return `${roll.expression} → ${dice} = ${roll.total}`;
  }
  const mod = roll.modifier > 0 ? ` + ${roll.modifier}` : ` ${roll.modifier}`;
  return `${roll.expression} → ${dice}${mod} = ${roll.total}`;
}

export const DICE_QUICK_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
