import {
  abilityModifier,
  DEFAULT_SHEET_TEMPLATE,
  type CharacterSheet,
  type CheckSpec,
  type RollPart,
} from "./types";
import { rollDiceExpression } from "./dice";

/**
 * The resolved result of a ROLL_CHECK — shaped to drop straight into a DiceRoll.
 * `parts` sum to `total`; `rolls` is the d20 (or damage dice) kept.
 */
export type ResolvedCheck = {
  label: string;
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  parts: RollPart[];
  adv?: "adv" | "dis";
  otherTotal?: number;
};

const abbrOf = (abilityId: string) =>
  DEFAULT_SHEET_TEMPLATE.abilities.find((a) => a.id === abilityId)?.abbr ?? abilityId.toUpperCase();
const abilityNameOf = (abilityId: string) =>
  DEFAULT_SHEET_TEMPLATE.abilities.find((a) => a.id === abilityId)?.name ?? abilityId;

/** Find an attack/damage source row by id (manual attacks, then inventory weapons). */
function findAttackRow(sheet: CharacterSheet, rowId: string) {
  const id = rowId.startsWith("inv:") ? rowId.slice(4) : rowId;
  const attack = sheet.attacks.find((a) => a.id === id);
  if (attack) {
    return { name: attack.name, toHit: attack.toHit, damage: attack.damage };
  }
  const item = sheet.inventory.find((r) => r.id === id);
  if (item) {
    return { name: item.name, toHit: item.toHit ?? 0, damage: item.damage ?? "" };
  }
  return null;
}

/** Roll a single d20 (returns 1..20). */
function d20(randInt: (n: number) => number): number {
  return randInt(20) + 1;
}

/**
 * Resolves a structured sheet roll into a labeled, color-coded breakdown. Pure — the
 * caller supplies `randInt` (the server passes secureRandInt for provable fairness).
 * Manual-fields-first: modifiers come straight off the sheet, no derived crit/trait math.
 */
export function resolveCheck(
  sheet: CharacterSheet,
  check: CheckSpec,
  adv: "adv" | "dis" | undefined,
  randInt: (n: number) => number,
): ResolvedCheck {
  // Damage rolls have no d20 — roll the weapon's damage expression instead.
  if (check.kind === "damage") {
    const row = findAttackRow(sheet, check.rowId);
    const name = row?.name ?? "Attack";
    const expr = row?.damage || "1d6";
    let result;
    try {
      result = rollDiceExpression(expr, randInt);
    } catch {
      result = rollDiceExpression("1d6", randInt);
    }
    const parts: RollPart[] = result.rolls.map((v) => ({ kind: "die", value: v, label: dieLabel(result.expression) }));
    if (result.modifier !== 0) {
      parts.push({ kind: "item", value: result.modifier, label: name });
    }
    return {
      label: `${name} damage`,
      expression: result.expression,
      rolls: result.rolls,
      modifier: result.modifier,
      total: result.total,
      parts,
    };
  }

  // Every other check is d20 + typed modifiers.
  const mods: RollPart[] = [];
  let label = "Check";

  switch (check.kind) {
    case "ability": {
      const mod = abilityModifier(sheet.abilityScores[check.abilityId] ?? 10);
      label = `${abilityNameOf(check.abilityId)} check`;
      if (mod !== 0) mods.push({ kind: "ability", value: mod, label: abbrOf(check.abilityId) });
      break;
    }
    case "skill":
    case "save": {
      const def = (check.kind === "skill" ? DEFAULT_SHEET_TEMPLATE.skills : DEFAULT_SHEET_TEMPLATE.saves).find(
        (s) => s.id === check.statId,
      );
      const abilityId = def && def.mode === "ability" ? def.abilityId : undefined;
      const abilityMod = abilityId ? abilityModifier(sheet.abilityScores[abilityId] ?? 10) : 0;
      const manual = (check.kind === "skill" ? sheet.skillMods : sheet.saveMods)[check.statId] ?? 0;
      label = `${def?.name ?? "Check"} ${check.kind === "skill" ? "check" : "save"}`;
      if (abilityMod !== 0 && abilityId) mods.push({ kind: "ability", value: abilityMod, label: abbrOf(abilityId) });
      if (manual !== 0) mods.push({ kind: "prof", value: manual });
      break;
    }
    case "tool": {
      const tool = sheet.tools.find((t) => t.id === check.toolId);
      label = `${tool?.name ?? "Tool"} check`;
      if (tool && tool.mod !== 0) mods.push({ kind: "flat", value: tool.mod });
      break;
    }
    case "initiative": {
      label = "Initiative";
      if (sheet.initiative !== 0) mods.push({ kind: "flat", value: sheet.initiative, label: "Init" });
      break;
    }
    case "attack": {
      const row = findAttackRow(sheet, check.rowId);
      label = `${row?.name ?? "Attack"} attack`;
      if (row && row.toHit !== 0) mods.push({ kind: "item", value: row.toHit, label: row.name });
      break;
    }
    case "spell-attack": {
      label = "Spell attack";
      if (sheet.spellcasting.attackBonus !== 0) mods.push({ kind: "item", value: sheet.spellcasting.attackBonus, label: "Spell" });
      break;
    }
  }

  const modTotal = mods.reduce((sum, p) => sum + p.value, 0);
  const first = d20(randInt);
  let kept = first;
  let otherTotal: number | undefined;
  if (adv) {
    const second = d20(randInt);
    kept = adv === "adv" ? Math.max(first, second) : Math.min(first, second);
    const other = kept === first ? second : first;
    otherTotal = other + modTotal;
  }

  const parts: RollPart[] = [{ kind: "die", value: kept, label: "d20" }, ...mods];
  const modExprTail = modTotal === 0 ? "" : modTotal > 0 ? `+${modTotal}` : `${modTotal}`;

  return {
    label,
    expression: `1d20${modExprTail}`,
    rolls: [kept],
    modifier: modTotal,
    total: kept + modTotal,
    parts,
    ...(adv ? { adv } : {}),
    ...(otherTotal !== undefined ? { otherTotal } : {}),
  };
}

/** Extracts a "dNN" label from a normalized "CdNN±M" expression. */
function dieLabel(expression: string): string {
  const match = expression.match(/d(\d+)/i);
  return match ? `d${match[1]}` : "die";
}

/** Builds color-coded parts from a freeform expression roll (ROLL_DICE / tray). */
export function partsFromExpression(rolls: number[], modifier: number, expression: string): RollPart[] {
  const label = dieLabel(expression);
  const parts: RollPart[] = rolls.map((v) => ({ kind: "die", value: v, label }));
  if (modifier !== 0) {
    parts.push({ kind: "flat", value: modifier });
  }
  return parts;
}
