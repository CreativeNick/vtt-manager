// Phase 7 unit test: the fleshed-out sheet data model — section-coverage guard,
// new-field normalization + caps, redaction of new sections, and migration defaults.
// Run against the real src/lib code (bundled via esbuild).
import {
  createDefaultSheet,
  createNpcSheetRecord,
  createInitialState,
  inventoryRowFromItem,
  normalizeCharacterSheet,
  normalizeGameState,
  normalizeToken,
  MAX_SHEET_BYTES,
  SHEET_ROW_CAPS,
  SHEET_SECTION_FIELDS,
  SHEET_SECTIONS,
  type CharacterSheet,
  type GameState,
  type ItemRecord,
  type Token,
} from "@lib/types";
import { redactStateFor } from "@lib/redact";
import { findAssetUsage } from "@lib/assetUsage";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// 1. GUARD: every CharacterSheet key appears in EXACTLY ONE section.
//    This is the single most important redaction invariant — a field missing
//    from every section vanishes for players; a field in two is ambiguous.
// ---------------------------------------------------------------------------
const sheetKeys = Object.keys(createDefaultSheet("x")) as Array<keyof CharacterSheet>;
const sectionAssignments = new Map<string, string[]>();
for (const key of sheetKeys) {
  sectionAssignments.set(key, []);
}
for (const section of SHEET_SECTIONS) {
  for (const field of SHEET_SECTION_FIELDS[section.id]) {
    sectionAssignments.get(field as string)?.push(section.id);
    if (!sectionAssignments.has(field as string)) {
      // A field listed in a section that isn't a real CharacterSheet key.
      sectionAssignments.set(field as string, [`UNKNOWN:${section.id}`]);
    }
  }
}
const missing = [...sectionAssignments].filter(([, s]) => s.length === 0).map(([k]) => k);
const duplicated = [...sectionAssignments].filter(([, s]) => s.length > 1).map(([k]) => k);
const unknown = [...sectionAssignments]
  .filter(([, s]) => s.some((x) => x.startsWith("UNKNOWN")))
  .map(([k]) => k);
check("every sheet field is assigned to a section", missing.length === 0, `missing: ${missing.join(", ")}`);
check("no sheet field is in two sections", duplicated.length === 0, `dup: ${duplicated.join(", ")}`);
check("no section lists a non-existent field", unknown.length === 0, `unknown: ${unknown.join(", ")}`);

// ---------------------------------------------------------------------------
// 2. New-field normalization + defaults on a legacy (bare) sheet.
// ---------------------------------------------------------------------------
const bare = normalizeCharacterSheet({ characterName: "Old" } as Partial<CharacterSheet>, "Old");
check("temp HP absent by default", bare.hp.temp === undefined);
check("death saves default 0/0", bare.deathSaves.successes === 0 && bare.deathSaves.failures === 0);
check("proficiency defaults to +2", bare.proficiencyBonus === 2);
check("attunementMax defaults to 3", bare.attunementMax === 3);
check("currency defaults present", bare.currency.gp === 0 && bare.currency.pp === 0);
check("new row arrays default empty", bare.attacks.length === 0 && bare.features.length === 0 && bare.spells.length === 0);
check("spellcasting defaults", bare.spellcasting.saveDc === 0 && bare.spellcasting.abilityId === "");

// ---------------------------------------------------------------------------
// 3. Caps: rows truncated, death saves clamped, temp>0, spell slots bounded.
// ---------------------------------------------------------------------------
const huge = normalizeCharacterSheet(
  {
    characterName: "Big",
    attacks: Array.from({ length: 80 }, (_, i) => ({ id: `a${i}`, name: "x", toHit: 1, damage: "1d6" })),
    deathSaves: { successes: 9, failures: -2 },
    hp: { current: 5, max: 10, temp: 4 },
    spellSlots: { "1": { current: 99, max: 99 }, "12": { current: 1, max: 1 } },
    traits: { "halfling-lucky": true, "crit-weapon": 19, junk: "nope" as unknown as number },
  } as Partial<CharacterSheet>,
  "Big",
);
check("attacks capped", huge.attacks.length === SHEET_ROW_CAPS.attacks, `got ${huge.attacks.length}`);
check("death saves clamped 0..3", huge.deathSaves.successes === 3 && huge.deathSaves.failures === 0);
check("temp HP kept when positive", huge.hp.temp === 4);
check("spell slots clamped to ≤12 and 1..9 only", huge.spellSlots["1"]?.max === 12 && huge.spellSlots["12"] === undefined);
check("traits keep bool + number, drop non-finite", huge.traits["halfling-lucky"] === true && huge.traits["crit-weapon"] === 19 && huge.traits["junk"] === undefined);

// Row-id backfill is deterministic (no randomUUID churn).
const noIds = normalizeCharacterSheet(
  { characterName: "R", features: [{ name: "A" }, { name: "B" }] } as unknown as Partial<CharacterSheet>,
  "R",
);
const noIds2 = normalizeCharacterSheet(
  { characterName: "R", features: [{ name: "A" }, { name: "B" }] } as unknown as Partial<CharacterSheet>,
  "R",
);
check("row ids backfilled deterministically", noIds.features[0]?.id === "feat-0" && noIds.features[0]?.id === noIds2.features[0]?.id);

// A maxed-out sheet still serializes under the hard cap when rows stay reasonable.
check("MAX_SHEET_BYTES is defined", MAX_SHEET_BYTES === 20_000);

// ---------------------------------------------------------------------------
// 4. inventoryRowFromItem copies self-contained display fields.
// ---------------------------------------------------------------------------
const weapon: ItemRecord = {
  id: "item-sword",
  name: "Longsword",
  description: "",
  iconUrl: null,
  folderId: null,
  type: "weapon",
  weight: 3,
  value: "15 gp",
  damage: "1d8+2",
  damageType: "slashing",
  toHit: 5,
  equippable: true,
};
const row = inventoryRowFromItem(weapon);
check("drop-copy sets weapon category", row.category === "weapon");
check("drop-copy carries damage/price/weight", row.damage === "1d8+2" && row.price === "15 gp" && row.weight === 3);
check("drop-copy links itemId + equippable→unequipped", row.itemId === "item-sword" && row.equipped === false);

// ---------------------------------------------------------------------------
// 5. Redaction: new sections strip for players; biography no longer rides identity.
// ---------------------------------------------------------------------------
const npc = createNpcSheetRecord("sheet-armor", "Animated Armor");
npc.data.characterName = "Animated Armor";
npc.data.creatureType = "Construct";
npc.data.alignment = "Unaligned";
npc.data.flaws = "Secret weakness: fire";
npc.data.features = [{ id: "f1", name: "False Appearance", source: "other", description: "looks inert" }];
npc.revealed.identity = true; // reveal identity only
const state = normalizeGameState({
  ...createInitialState("room-p7"),
  playerSlots: [{ id: "slot-a", name: "A" }],
  sheets: { "sheet-armor": npc },
} as unknown as GameState);

const pv = redactStateFor(state, { role: "player", playerId: "slot-a" });
const armor = pv.sheets["sheet-armor"]!;
check("player: revealed identity shows creatureType", armor.data.creatureType === "Construct");
check("player: biography (flaws) hidden when biography unrevealed", armor.data.flaws === "");
check("player: features hidden when features unrevealed", armor.data.features.length === 0);

// Reveal biography + features → they appear.
const npc2 = normalizeGameState(state).sheets["sheet-armor"]!;
npc2.revealed.biography = true;
npc2.revealed.features = true;
const state2 = { ...state, sheets: { "sheet-armor": npc2 } };
const pv2 = redactStateFor(state2 as GameState, { role: "player", playerId: "slot-a" });
check("player: revealed biography shows flaws", pv2.sheets["sheet-armor"]!.data.flaws === "Secret weakness: fire");
check("player: revealed features show rows", pv2.sheets["sheet-armor"]!.data.features.length === 1);

// ---------------------------------------------------------------------------
// 6. Token.facing normalization (Phase 7f): wraps into [0,360), drops non-finite.
// ---------------------------------------------------------------------------
const mkToken = (facing: unknown): Token =>
  normalizeToken({ id: "t", sceneId: "s", x: 0, y: 0, label: "", color: "", kind: "enemy", imageUrl: null, ownerPlayerId: null, sheetId: null, conditions: [], showHp: "none", facing } as unknown as Token);
check("facing wraps 370 → 10", mkToken(370).facing === 10, `got ${mkToken(370).facing}`);
check("facing wraps -90 → 270", mkToken(-90).facing === 270, `got ${mkToken(-90).facing}`);
check("facing NaN → undefined (no arrow)", mkToken(Number.NaN).facing === undefined);
check("facing absent → undefined", mkToken(undefined).facing === undefined);

// ---------------------------------------------------------------------------
// 7. Map pins (Phase 7i): dmOnly annotations are stripped from player scenes.
// ---------------------------------------------------------------------------
const pinState = normalizeGameState(createInitialState("room-pin") as unknown as GameState);
const activeScene = pinState.scenes.find((s) => s.id === pinState.activeSceneId)!;
activeScene.annotations = [
  { id: "pin-secret", authorId: "dm", kind: "pin", x: 5, y: 5, text: "trap here", color: "#e9c176", width: 2, createdAt: Date.now(), ephemeral: false, dmOnly: true },
  { id: "note-open", authorId: "dm", kind: "pin", x: 9, y: 9, text: "landmark", color: "#e9c176", width: 2, createdAt: Date.now(), ephemeral: false },
];
const pinPlayer = redactStateFor(pinState, { role: "player", playerId: "nobody" });
const playerScene = pinPlayer.scenes[0];
check("player: dmOnly pin stripped", !!playerScene && !playerScene.annotations.some((a) => a.id === "pin-secret"));
check("player: non-dmOnly pin kept", !!playerScene && playerScene.annotations.some((a) => a.id === "note-open"));
check("DM: keeps all pins", redactStateFor(pinState, { role: "dm" }).scenes[0]!.annotations.length === 2);
check("redaction does not mutate the source scene", activeScene.annotations.length === 2);

// ---------------------------------------------------------------------------
// 8. Assets in-use scanner (Phase 7j): finds token/sheet/scene/item references.
// ---------------------------------------------------------------------------
const usageState = normalizeGameState({
  ...createInitialState("room-assets"),
  playerSlots: [{ id: "slot-u", name: "U" }],
  tokens: [
    { id: "t-img", sceneId: "scene-1", x: 0, y: 0, label: "Orc", color: "#c45c5c", kind: "enemy", imageUrl: "/tokens/room-assets--asset-1.png", ownerPlayerId: null, sheetId: null, conditions: [], showHp: "none" },
  ],
} as unknown as GameState);
usageState.sheets["slot-u"]!.data.iconUrl = "/portraits/room-assets--asset-1.png"; // different key, same asset name style
const used = findAssetUsage(usageState, "/tokens/room-assets--asset-1.png");
check("in-use scan finds the token reference", used.length === 1 && used[0].kind === "token");
check("in-use scan reports unused for an unreferenced URL", findAssetUsage(usageState, "/tokens/room-assets--nope.png").length === 0);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
