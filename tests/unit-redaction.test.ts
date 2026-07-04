// UX round 2 unit test: masked secret rolls, folder/item normalization,
// inventory sanitization, directory redaction. Runs against real src/lib code.
import {
  createInitialState,
  createNpcSheetRecord,
  normalizeGameState,
  type GameState,
  type LogEntry,
} from "@lib/types";
import { redactStateFor } from "@lib/redact";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// 1. Masked secret rolls
// ---------------------------------------------------------------------------
const secretRoll: LogEntry = {
  id: "log-1",
  t: 111,
  kind: "roll",
  dmOnly: true,
  label: "Goblin Boss attack",
  actor: { name: "Goblin Boss", sheetId: "sheet-gob" },
  roll: {
    id: "roll-1", rollerName: "DM", rollerId: "dm", expression: "1d20+6",
    rolls: [17], modifier: 6, total: 23, timestamp: 111,
  },
};
const secretEvent: LogEntry = { id: "log-2", t: 112, kind: "event", text: "hidden", dmOnly: true };
const publicRoll: LogEntry = {
  id: "log-3", t: 113, kind: "roll",
  actor: { name: "Vex" },
  roll: { id: "roll-2", rollerName: "Vex", rollerId: "p1", expression: "1d20", rolls: [4], modifier: 0, total: 4, timestamp: 113 },
};

const state: GameState = {
  ...createInitialState("room-x"),
  playerSlots: [{ id: "p1", name: "Vex" }],
  log: [secretRoll, secretEvent, publicRoll],
};
const normalized = normalizeGameState(state);
const playerView = redactStateFor(normalized, { role: "player", playerId: "p1" });

const maskedEntry = playerView.log.find((e) => e.id === "log-1");
check("secret roll still visible to player as an entry", !!maskedEntry && maskedEntry.kind === "roll");
if (maskedEntry && maskedEntry.kind === "roll") {
  check(
    "masked roll leaks nothing",
    maskedEntry.masked === true &&
      maskedEntry.actor.name === "DM" &&
      !("label" in maskedEntry && maskedEntry.label) &&
      maskedEntry.actor.sheetId === undefined &&
      maskedEntry.roll.expression === "?" &&
      maskedEntry.roll.rolls.length === 0 &&
      maskedEntry.roll.total === 0,
    JSON.stringify(maskedEntry),
  );
}
check("dmOnly event fully hidden from player", !playerView.log.some((e) => e.id === "log-2"));
check("public roll untouched", playerView.log.some((e) => e.id === "log-3"));
const dmView = redactStateFor(normalized, { role: "dm" });
const dmEntry = dmView.log.find((e) => e.id === "log-1");
check(
  "DM still sees full secret roll",
  dmEntry?.kind === "roll" && dmEntry.roll.total === 23 && dmEntry.label === "Goblin Boss attack",
);

// ---------------------------------------------------------------------------
// 2. Folders + items normalization
// ---------------------------------------------------------------------------
const npc = createNpcSheetRecord("sheet-a", "A");
npc.folderId = "folder-gone";
const withDirs = normalizeGameState({
  ...createInitialState("room-y"),
  folders: [
    { id: "folder-1", name: "Bandits", kind: "actor" },
    { id: "bad", name: 5, kind: "actor" },
    { id: "folder-2", name: "Loot", kind: "item" },
  ],
  sheets: { "sheet-a": npc },
  items: {
    "item-1": { id: "item-1", name: "Sword", description: "sharp", iconUrl: null, folderId: "folder-2" },
    "item-2": { id: "item-2", name: "Rope", description: "", iconUrl: null, folderId: "folder-gone" },
  },
} as unknown as GameState);
check("invalid folders dropped", withDirs.folders.length === 2);
check("orphan sheet folderId nulled", withDirs.sheets["sheet-a"]!.folderId === null);
check(
  "item folder links: valid kept, orphan nulled",
  withDirs.items["item-1"]!.folderId === "folder-2" && withDirs.items["item-2"]!.folderId === null,
);

// ---------------------------------------------------------------------------
// 3. Inventory sanitization
// ---------------------------------------------------------------------------
const messySheet = {
  ...createNpcSheetRecord("sheet-b", "B"),
  data: {
    inventory: [
      { itemId: "item-1", name: "Sword", qty: 2.7, note: "worn" },
      { name: "Bare minimum" },
      { qty: 3 },              // no name → dropped
      "garbage",
    ],
  },
};
const withInv = normalizeGameState({
  ...createInitialState("room-z"),
  sheets: { "sheet-b": messySheet },
} as unknown as GameState);
const inv = withInv.sheets["sheet-b"]!.data.inventory;
check(
  "inventory sanitized (non-objects dropped, qty floored, name/category defaulted, ids backfilled)",
  inv.length === 3 &&
    inv[0]!.qty === 2 &&
    inv[0]!.id === "inv-0" &&
    inv[1]!.name === "Bare minimum" &&
    inv[1]!.qty === 1 &&
    inv[1]!.category === "equipment" &&
    inv[2]!.name === "Item", // nameless row kept with a default name (not dropped mid-edit)
  JSON.stringify(inv),
);

// ---------------------------------------------------------------------------
// 4. Directories are DM-only
// ---------------------------------------------------------------------------
const dirsPlayerView = redactStateFor(withDirs, { role: "player", playerId: "p1" });
check(
  "players receive no folders or items",
  dirsPlayerView.folders.length === 0 && Object.keys(dirsPlayerView.items).length === 0,
);
const lobbyView = redactStateFor(withDirs, null);
check(
  "lobby receives no folders or items",
  lobbyView.folders.length === 0 && Object.keys(lobbyView.items).length === 0,
);
check("DM keeps directories", redactStateFor(withDirs, { role: "dm" }).folders.length === 2);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
