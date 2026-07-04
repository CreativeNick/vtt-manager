// Phase 7d unit test: the ROLL_CHECK resolver builds color-coded parts that sum to the
// total, straight from the sheet (manual-fields-first, no derived crit/trait math).
import { createDefaultSheet, type CharacterSheet } from "@lib/types";
import { partsFromExpression, resolveCheck } from "@lib/rollCheck";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Deterministic randInt: pops from a queue (returns 0-based like secureRandInt). */
function queued(values: number[]): (n: number) => number {
  const q = [...values];
  return () => (q.length ? q.shift()! : 0);
}

const sumParts = (parts: { value: number }[]) => parts.reduce((s, p) => s + p.value, 0);

const base: CharacterSheet = createDefaultSheet("Vex");
base.abilityScores = { dex: 16, str: 8, wis: 15 };
base.skillMods = { "skill-stealth": 2 };
base.saveMods = { "save-wis": 1 };
base.initiative = 3;
base.spellcasting = { abilityId: "wis", attackBonus: 4, saveDc: 12 };
base.attacks = [{ id: "atk-1", name: "Shortsword", toHit: 5, damage: "1d6+3", damageType: "piercing" }];
base.inventory = [
  { id: "inv-mace", itemId: null, name: "Mace", qty: 1, note: "", category: "weapon", equipped: true, toHit: 4, damage: "1d6+1" },
];

// --- Skill: d20 + ability(DEX +3) + prof(manual +2) -------------------------
const stealth = resolveCheck(base, { kind: "skill", statId: "skill-stealth" }, undefined, queued([14]));
check("skill: d20 rolled from randInt", stealth.rolls[0] === 15, `d20=${stealth.rolls[0]}`);
check("skill: parts sum to total", sumParts(stealth.parts) === stealth.total && stealth.total === 20, `total=${stealth.total}`);
check("skill: has die + ability + prof parts", stealth.parts.map((p) => p.kind).join(",") === "die,ability,prof");
check("skill: label derived server-side", stealth.label === "Stealth check", stealth.label);

// --- Ability check: d20 + ability only --------------------------------------
const dexCheck = resolveCheck(base, { kind: "ability", abilityId: "dex" }, undefined, queued([9]));
check("ability: total = 10 + 3", dexCheck.total === 13 && sumParts(dexCheck.parts) === 13);

// --- Save: d20 + ability(WIS +2) + prof(+1) ---------------------------------
const wisSave = resolveCheck(base, { kind: "save", statId: "save-wis" }, undefined, queued([10]));
check("save: total = 11 + 2 + 1", wisSave.total === 14, `total=${wisSave.total}`);

// --- Attack: d20 + item(toHit +5) -------------------------------------------
const attack = resolveCheck(base, { kind: "attack", rowId: "atk-1" }, undefined, queued([7]));
check("attack: total = 8 + 5", attack.total === 13 && attack.parts[1]?.kind === "item", `total=${attack.total}`);

// --- Attack from an equipped inventory weapon (inv: prefix) ------------------
const invAttack = resolveCheck(base, { kind: "attack", rowId: "inv:inv-mace" }, undefined, queued([11]));
check("attack: resolves inventory weapon via inv: prefix", invAttack.total === 12 + 4, `total=${invAttack.total}`);

// --- Damage: no d20, parse expression 1d6+3 ---------------------------------
const dmg = resolveCheck(base, { kind: "damage", rowId: "atk-1" }, undefined, queued([3]));
check("damage: no d20 (first part is the damage die)", dmg.parts[0]?.label === "d6" && dmg.rolls[0] === 4);
check("damage: parts sum to total (4 + 3)", sumParts(dmg.parts) === dmg.total && dmg.total === 7, `total=${dmg.total}`);
check("damage: modifier labeled as item (weapon name)", dmg.parts[1]?.kind === "item");

// --- Advantage: keeps the higher d20, reports the dropped total -------------
const adv = resolveCheck(base, { kind: "ability", abilityId: "dex" }, "adv", queued([5, 18]));
check("adv: keeps higher d20", adv.rolls[0] === 19, `kept=${adv.rolls[0]}`);
check("adv: reports dropped total", adv.otherTotal === 6 + 3, `other=${adv.otherTotal}`);

// --- Spell attack: d20 + item(spellcasting.attackBonus +4) ------------------
const spell = resolveCheck(base, { kind: "spell-attack" }, undefined, queued([12]));
check("spell-attack: total = 13 + 4", spell.total === 17);

// --- Initiative: d20 + flat(sheet.initiative) -------------------------------
const init = resolveCheck(base, { kind: "initiative" }, undefined, queued([9]));
check("initiative: total = 10 + 3", init.total === 13);

// --- partsFromExpression (freeform ROLL_DICE) -------------------------------
const freeform = partsFromExpression([4, 5], 3, "2d6+3");
check("freeform: die parts + flat modifier", freeform.length === 3 && freeform[0].label === "d6" && freeform[2].kind === "flat");
check("freeform: parts sum matches", sumParts(freeform) === 12);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
