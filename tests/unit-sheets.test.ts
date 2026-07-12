// Phase 1 unit test: legacy-state migration + sheet redaction, run against the
// real src/lib code (bundled via esbuild).
import {
  createDefaultSheet,
  createNpcSheetRecord,
  createInitialState,
  normalizeGameState,
  type GameState,
} from "@lib/types";
import { redactStateFor } from "@lib/redact";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// 1. Legacy migration: characterSheets keyed by slot → sheets records
// ---------------------------------------------------------------------------
const legacySheet = { ...createDefaultSheet("Vex"), ac: 17, hp: { current: 22, max: 30 } };
const legacyState = {
  ...createInitialState("room-1"),
  playerSlots: [{ id: "slot-vex", name: "Vex" }],
  tokens: [
    {
      id: "t1",
      sceneId: "scene-1",
      x: 0,
      y: 0,
      label: "",
      color: "",
      kind: "player",
      imageUrl: null,
      ownerPlayerId: "slot-vex",
      // no sheetId — pre-Phase-1 token
    },
  ],
  sheets: undefined,
  characterSheets: { "slot-vex": legacySheet },
} as unknown as GameState;

const migrated = normalizeGameState(legacyState);
const pc = migrated.sheets["slot-vex"];
check("legacy sheet folded into PC record", !!pc && pc.kind === "pc" && pc.ownerSlotId === "slot-vex");
check("legacy sheet data preserved", pc?.data.ac === 17 && pc?.data.hp.current === 22);
check(
  "PC record fully revealed",
  !!pc && Object.values(pc.revealed).every(Boolean),
);
check("player token auto-links to PC sheet", migrated.tokens[0]?.sheetId === "slot-vex");
check("dmNotes defaults to empty string", migrated.dmNotes === "");

// ---------------------------------------------------------------------------
// 2. NPC sheets survive normalization (the old normalizer dropped them)
// ---------------------------------------------------------------------------
const npc = createNpcSheetRecord("sheet-goblin", "Goblin Boss");
npc.data.ac = 15;
npc.data.abilityScores = { str: 14, dex: 12 };
npc.revealed.abilities = true;

const withNpc = normalizeGameState({
  ...createInitialState("room-2"),
  playerSlots: [{ id: "slot-vex", name: "Vex" }],
  sheets: { "sheet-goblin": npc },
  tokens: [
    {
      id: "t2",
      sceneId: "scene-1",
      x: 0,
      y: 0,
      label: "Goblin",
      color: "#c45c5c",
      kind: "enemy",
      imageUrl: null,
      ownerPlayerId: null,
      sheetId: "sheet-goblin",
    },
    {
      id: "t3",
      sceneId: "scene-1",
      x: 5,
      y: 5,
      label: "Ghost",
      color: "#ccc",
      kind: "enemy",
      imageUrl: null,
      ownerPlayerId: null,
      sheetId: "sheet-deleted",
    },
  ],
} as unknown as GameState);

const goblin = withNpc.sheets["sheet-goblin"];
check("NPC record survives normalize", !!goblin && goblin.kind === "npc" && goblin.data.ac === 15);
check("NPC reveal flags preserved", goblin?.revealed.abilities === true && goblin?.revealed.combat === false);
check("PC record auto-created for slot", withNpc.sheets["slot-vex"]?.kind === "pc");
check("enemy token keeps valid sheet link", withNpc.tokens[0]?.sheetId === "sheet-goblin");
check("dangling sheet link nulled", withNpc.tokens[1]?.sheetId === null);

// ---------------------------------------------------------------------------
// 3. Redaction: unrevealed NPC sections stripped for players, PCs untouched
// ---------------------------------------------------------------------------
goblin!.data.characterName = "Goblin Boss";
goblin!.data.hp = { current: 9, max: 21 };
withNpc.dmNotes = "the goblin is secretly the king";
withNpc.sheets["slot-vex"]!.data.notes = "player-visible note";

const playerView = redactStateFor(withNpc, { role: "player", playerId: "slot-vex" });
const gView = playerView.sheets["sheet-goblin"]!;
check("player: NPC marked redacted", gView.redacted === true);
check("player: unrevealed identity stripped", gView.data.characterName === "");
check("player: unrevealed combat stripped", gView.data.hp.current === 0 && gView.data.ac === 0);
check("player: revealed abilities visible", gView.data.abilityScores.str === 14);
check("player: reveal flags still sent (UI labels)", gView.revealed.abilities === true);
check("player: PC sheets untouched", playerView.sheets["slot-vex"]!.data.notes === "player-visible note");
check("player: dmNotes stripped", playerView.dmNotes === "");
check("redaction does not mutate source", withNpc.sheets["sheet-goblin"]!.data.characterName === "Goblin Boss");

const dmView = redactStateFor(withNpc, { role: "dm" });
check("DM: full passthrough", dmView.sheets["sheet-goblin"]!.data.characterName === "Goblin Boss" && dmView.dmNotes.length > 0);

const lobbyView = redactStateFor(withNpc, null);
check("lobby: sheets and notes stripped", Object.keys(lobbyView.sheets).length === 0 && lobbyView.dmNotes === "");

// ---------------------------------------------------------------------------
// 4. Redacted state re-normalizes on the client without losing the marker
// ---------------------------------------------------------------------------
const clientSide = normalizeGameState(playerView);
check(
  "client normalize preserves redacted marker",
  clientSide.sheets["sheet-goblin"]!.redacted === true,
);
check(
  "client normalize keeps stripped data blank (no zero-fill surprises)",
  clientSide.sheets["sheet-goblin"]!.data.characterName === "",
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
