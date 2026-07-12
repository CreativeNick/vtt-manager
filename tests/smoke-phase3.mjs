// Phase 3 WS smoke test: combat start (NPC auto-roll, PC pending), player
// initiative CTA roll, DEX tiebreak, turn wrap, set-initiative turn
// preservation, HP-display redaction exception, mid-combat joiner.
const ROOM = `smoke3-${Date.now().toString(36)}`;
const URL_BASE = `ws://127.0.0.1:1999/parties/main/${ROOM}`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function connect(label) {
  const ws = new WebSocket(URL_BASE);
  const frames = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    frames.push(msg);
    for (const w of [...waiters]) {
      if (w.pred(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error(`${label}: connect failed`)));
  });
  return {
    ws, frames, opened,
    send: (obj) => ws.send(JSON.stringify(obj)),
    next: (pred, timeoutMs = 5000) =>
      new Promise((resolve, reject) => {
        const existing = frames.find(pred);
        if (existing) return resolve(existing);
        const timer = setTimeout(() => reject(new Error(`${label}: timeout`)), timeoutMs);
        waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastState = (c) => c.frames.filter((m) => m.type === "STATE").at(-1).state;
const mkToken = (id, sceneId, extra = {}) => ({
  id, sceneId, x: 0, y: 0, label: id, color: "#c45c5c", kind: "enemy",
  imageUrl: null, ownerPlayerId: null, sheetId: null, conditions: [], showHp: "none", ...extra,
});

try {
  // Setup: DM, one player slot + player
  const dm = connect("dm");
  await dm.opened;
  dm.send({ type: "JOIN", role: "dm", displayName: "DM", roomKey: "" });
  await dm.next((m) => m.type === "JOINED");
  dm.send({ type: "ADD_PLAYER_SLOT", name: "Vex" });
  const slotFrame = await dm.next((m) => m.type === "STATE" && m.state.playerSlots.length === 1);
  const vexId = slotFrame.state.playerSlots[0].id;
  const sceneId = slotFrame.state.activeSceneId;

  const vex = connect("vex");
  await vex.opened;
  vex.send({ type: "JOIN", role: "player", slotId: vexId, roomKey: "" });
  await vex.next((m) => m.type === "JOINED");

  // NPC sheet with high DEX (18 → +4) and some HP
  dm.send({ type: "CREATE_SHEET", sheetId: "sheet-gob", name: "Goblin" });
  const gobFrame = await dm.next((m) => m.type === "STATE" && m.state.sheets["sheet-gob"]);
  dm.send({
    type: "UPDATE_SHEET", sheetId: "sheet-gob",
    sheet: { ...gobFrame.state.sheets["sheet-gob"].data, abilityScores: { dex: 18 }, hp: { current: 9, max: 21 } },
  });
  await dm.next((m) => m.type === "STATE" && m.state.sheets["sheet-gob"]?.data.hp.max === 21);

  // Tokens: player token + goblin (sheet) + mook (no sheet)
  dm.send({ type: "ADD_TOKEN", token: mkToken("tok-vex", sceneId, { kind: "player", ownerPlayerId: vexId, label: "Vex" }) });
  dm.send({ type: "ADD_TOKEN", token: mkToken("tok-gob", sceneId, { sheetId: "sheet-gob", label: "Goblin" }) });
  dm.send({ type: "ADD_TOKEN", token: mkToken("tok-mook", sceneId, { label: "Mook" }) });
  await dm.next((m) => m.type === "STATE" && m.state.tokens.length === 3);

  // --- combat start: NPCs pre-rolled, PC pending -----------------------------
  dm.send({ type: "COMBAT_START", tokenIds: ["tok-vex", "tok-gob", "tok-mook"] });
  const startFrame = await vex.next((m) => m.type === "STATE" && m.state.combat);
  const combat0 = startFrame.state.combat;
  const pcEntry = combat0.entries.find((e) => e.tokenId === "tok-vex");
  const npcEntries = combat0.entries.filter((e) => e.tokenId !== "tok-vex");
  check(
    "combat starts: NPCs auto-rolled, PC pending",
    combat0.round === 1 && pcEntry.initiative === null &&
      npcEntries.every((e) => typeof e.initiative === "number"),
    `npc inits=[${npcEntries.map((e) => e.initiative)}]`,
  );
  check(
    "unrolled PC sorts last",
    combat0.entries[combat0.entries.length - 1].tokenId === "tok-vex",
  );
  check(
    "combat start logged",
    startFrame.state.log.some((e) => e.kind === "event" && /Combat started/.test(e.text)),
  );

  // --- player CTA roll --------------------------------------------------------
  vex.send({ type: "COMBAT_ROLL_INITIATIVE" });
  const rolledFrame = await vex.next(
    (m) => m.type === "STATE" && m.state.combat?.entries.every((e) => e.initiative !== null),
  );
  const vexEntry = rolledFrame.state.combat.entries.find((e) => e.tokenId === "tok-vex");
  check("player initiative rolled via CTA", vexEntry.hasRolled && vexEntry.initiative !== null,
    `init=${vexEntry.initiative}`);
  check(
    "initiative roll appears in public log",
    rolledFrame.state.log.some((e) => e.kind === "roll" && e.label === "Initiative"),
  );
  const sorted = rolledFrame.state.combat.entries.map((e) => e.initiative);
  check(
    "entries sorted descending",
    sorted.every((v, i) => i === 0 || sorted[i - 1] >= v),
    `[${sorted}]`,
  );

  // re-rolling when nothing pending → error
  vex.send({ type: "COMBAT_ROLL_INITIATIVE" });
  const rerollErr = await vex.next((m) => m.type === "ERROR");
  check("no double initiative roll", /no pending/i.test(rerollErr.message));

  // --- DEX tiebreak via forced tie ---------------------------------------------
  const combatNow = lastState(dm).combat;
  for (const entry of combatNow.entries) {
    dm.send({ type: "COMBAT_SET_INITIATIVE", entryId: entry.id, value: 15 });
  }
  await sleep(400);
  const tied = lastState(dm).combat.entries;
  const gobIdx = tied.findIndex((e) => e.tokenId === "tok-gob");
  check(
    "equal initiative ties broken by DEX (goblin DEX 18 first)",
    tied.every((e) => e.initiative === 15) && gobIdx === 0,
    `order=[${tied.map((e) => `${e.name}:${e.dexScore}`)}]`,
  );

  // --- set-initiative preserves whose turn it is ---------------------------------
  const currentEntryId = tied[lastState(dm).combat.turnIndex].id;
  const lastEntry = tied[tied.length - 1];
  dm.send({ type: "COMBAT_SET_INITIATIVE", entryId: lastEntry.id, value: 99 });
  const resorted = await dm.next(
    (m) => m.type === "STATE" && m.state.combat?.entries[0]?.id === lastEntry.id,
  );
  const stillCurrent = resorted.state.combat.entries[resorted.state.combat.turnIndex].id;
  check("re-sort keeps the turn on the same combatant", stillCurrent === currentEntryId);

  // --- turn wrap → round increments ------------------------------------------------
  const entryCount = resorted.state.combat.entries.length;
  for (let i = 0; i < entryCount; i++) {
    dm.send({ type: "COMBAT_NEXT" });
  }
  const wrapped = await dm.next((m) => m.type === "STATE" && m.state.combat?.round === 2);
  check(
    "turn wrap increments round and logs it",
    wrapped.state.combat.turnIndex === wrapped.state.combat.entries.length - 1 ||
      wrapped.state.log.some((e) => e.kind === "event" && /Round 2/.test(e.text)),
  );

  // --- HP redaction exception -------------------------------------------------------
  // Goblin sheet combat section is unrevealed → hp normally stripped for players.
  let vexView = lastState(vex).sheets["sheet-gob"];
  check("baseline: hidden NPC hp stripped for player", vexView.data.hp.max === 0);

  const gobToken = lastState(dm).tokens.find((t) => t.id === "tok-gob");
  dm.send({ type: "UPDATE_TOKEN", token: { ...gobToken, showHp: "bar" } });
  await vex.next(
    (m) => m.type === "STATE" && m.state.tokens.find((t) => t.id === "tok-gob")?.showHp === "bar",
  );
  vexView = lastState(vex).sheets["sheet-gob"];
  check(
    "showHp=bar exposes hp (and only hp) through redaction",
    vexView.data.hp.max === 21 && vexView.data.ac === 0 && vexView.data.characterName === "",
    `hp=${vexView.data.hp.current}/${vexView.data.hp.max} ac=${vexView.data.ac}`,
  );

  // --- conditions roundtrip ------------------------------------------------------------
  dm.send({ type: "UPDATE_TOKEN", token: { ...gobToken, showHp: "bar", conditions: ["poisoned", "prone", "bogus"] } });
  const condFrame = await vex.next(
    (m) => m.type === "STATE" && m.state.tokens.find((t) => t.id === "tok-gob")?.conditions.length > 0,
  );
  const condTok = condFrame.state.tokens.find((t) => t.id === "tok-gob");
  check(
    "conditions sync; unknown ids dropped",
    condTok.conditions.includes("poisoned") && condTok.conditions.includes("prone") &&
      !condTok.conditions.includes("bogus"),
    `[${condTok.conditions}]`,
  );

  // --- mid-combat joiner sees the tracker ------------------------------------------------
  dm.send({ type: "ADD_PLAYER_SLOT", name: "Brom" });
  const bromSlot = await dm.next((m) => m.type === "STATE" && m.state.playerSlots.length === 2);
  const bromId = bromSlot.state.playerSlots.find((s) => s.name === "Brom").id;
  const brom = connect("brom");
  await brom.opened;
  brom.send({ type: "JOIN", role: "player", slotId: bromId, roomKey: "" });
  const bromState = await brom.next((m) => m.type === "STATE" && m.yourRole === "player");
  check(
    "mid-combat joiner receives the combat state",
    bromState.state.combat && bromState.state.combat.round >= 2,
  );

  // --- end combat --------------------------------------------------------------------------
  dm.send({ type: "COMBAT_END" });
  const ended = await vex.next(
    (m) =>
      m.type === "STATE" &&
      m.state.combat === null &&
      m.state.log.some((e) => e.kind === "event" && /Combat ended/.test(e.text)),
  );
  check("combat ends and is logged", !!ended);

  dm.ws.close();
  vex.ws.close();
  brom.ws.close();
} catch (err) {
  check("smoke run completed", false, String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
