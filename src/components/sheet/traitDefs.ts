/**
 * Curated Special-Traits definitions (Phase 7). These are DM/player switches that a
 * FUTURE rules engine will consume to adjust derived math (crit range, extra dice,
 * half-proficiency). Today they are purely manual toggles/overrides — only the values
 * persist (in `CharacterSheet.traits`), keyed by these ids. Mirrors the reference
 * "Special Traits" screenshot. Kept client-side like DEFAULT_SHEET_TEMPLATE so the
 * persisted sheet stays small.
 */
export type TraitKind = "toggle" | "number";

export type TraitDef = {
  id: string;
  name: string;
  description: string;
  kind: TraitKind;
};

export type TraitGroup = {
  id: string;
  title: string;
  traits: TraitDef[];
};

export const TRAIT_GROUPS: TraitGroup[] = [
  {
    id: "feats",
    title: "Feats",
    traits: [
      { id: "diamond-soul", name: "Diamond Soul", description: "Gain proficiency to all saving throws.", kind: "toggle" },
      { id: "enhanced-dual-wielding", name: "Enhanced Dual Wielding", description: "Allow bonus action extra attacks using any melee weapon without the Two-Handed property.", kind: "toggle" },
      { id: "advantage-initiative", name: "Advantage on Initiative", description: "Provided by feats or magical items.", kind: "toggle" },
      { id: "alert-feat", name: "Alert Feat", description: "Proficient in Initiative rolls.", kind: "toggle" },
      { id: "jack-of-all-trades", name: "Jack of All Trades", description: "Half-Proficiency to Ability Checks in which you are not already Proficient.", kind: "toggle" },
      { id: "observant-feat", name: "Observant Feat", description: "Provides a +5 to passive Perception and Investigation.", kind: "toggle" },
      { id: "tavern-brawler-feat", name: "Tavern Brawler Feat", description: "Proficient with improvised weapons.", kind: "toggle" },
      { id: "reliable-talent", name: "Reliable Talent", description: "Rogues Reliable Talent Feature.", kind: "toggle" },
      { id: "remarkable-athlete", name: "Remarkable Athlete", description: "Half-Proficiency (rounded-up) to physical Ability Checks and Initiative.", kind: "toggle" },
      { id: "weapon-crit-threshold", name: "Weapon Critical Hit Threshold", description: "An expanded critical hit threshold for weapon attacks.", kind: "number" },
      { id: "spell-crit-threshold", name: "Spell Critical Hit Threshold", description: "An expanded critical hit threshold for spell attacks.", kind: "number" },
      { id: "melee-crit-damage-dice", name: "Melee Critical Damage Dice", description: "A number of additional damage dice added to melee weapon critical hits.", kind: "number" },
    ],
  },
  {
    id: "species",
    title: "Species Traits",
    traits: [
      { id: "elven-accuracy", name: "Elven Accuracy", description: "Roll an extra d20 with advantage to Dex, Int, Wis, or Cha.", kind: "toggle" },
      { id: "halfling-lucky", name: "Halfling Lucky", description: "Reroll ones when rolling d20 checks.", kind: "toggle" },
      { id: "powerful-build", name: "Powerful Build", description: "Provides increased carrying capacity.", kind: "toggle" },
    ],
  },
  {
    id: "global-bonuses",
    title: "Global Bonuses",
    traits: [
      { id: "melee-weapon-attack-bonus", name: "Melee Weapon Attack Bonus", description: "", kind: "number" },
      { id: "melee-weapon-damage-bonus", name: "Melee Weapon Damage Bonus", description: "", kind: "number" },
      { id: "ranged-weapon-attack-bonus", name: "Ranged Weapon Attack Bonus", description: "", kind: "number" },
      { id: "ranged-weapon-damage-bonus", name: "Ranged Weapon Damage Bonus", description: "", kind: "number" },
      { id: "melee-spell-attack-bonus", name: "Melee Spell Attack Bonus", description: "", kind: "number" },
      { id: "melee-spell-damage-bonus", name: "Melee Spell Damage Bonus", description: "", kind: "number" },
      { id: "ranged-spell-attack-bonus", name: "Ranged Spell Attack Bonus", description: "", kind: "number" },
      { id: "ranged-spell-damage-bonus", name: "Ranged Spell Damage Bonus", description: "", kind: "number" },
      { id: "global-ability-check-bonus", name: "Global Ability Check Bonus", description: "", kind: "number" },
      { id: "global-saving-throw-bonus", name: "Global Saving Throw Bonus", description: "", kind: "number" },
      { id: "global-skill-check-bonus", name: "Global Skill Check Bonus", description: "", kind: "number" },
      { id: "global-spell-dc-bonus", name: "Global Spell DC Bonus", description: "", kind: "number" },
    ],
  },
];
