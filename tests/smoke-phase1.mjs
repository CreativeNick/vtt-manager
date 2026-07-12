// Phase 1 WS smoke test: NPC sheets, per-section reveal, edit authorization,
// DM notes — all verified at the WebSocket-frame level (never trusting the UI).
const ROOM = `smoke1-${Date.now().toString(36)}`;
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
    ws,
    frames,
    opened,
    send: (obj) => ws.send(JSON.stringify(obj)),
    next: (pred, timeoutMs = 4000) =>
      new Promise((resolve, reject) => {
        const existing = frames.find(pred);
        if (existing) return resolve(existing);
        const timer = setTimeout(() => reject(new Error(`${label}: timeout waiting for frame`)), timeoutMs);
        waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // Setup: DM + one player
  const dm = connect("dm");
  await dm.opened;
  dm.send({ type: "JOIN", role: "dm", displayName: "DM", roomKey: "" });
  await dm.next((m) => m.type === "JOINED");
  dm.send({ type: "ADD_PLAYER_SLOT", name: "Vex" });
  const slotFrame = await dm.next((m) => m.type === "STATE" && m.state.playerSlots.length > 0);
  const slotId = slotFrame.state.playerSlots[0].id;

  const player = connect("player");
  await player.opened;
  player.send({ type: "JOIN", role: "player", slotId, roomKey: "" });
  await player.next((m) => m.type === "JOINED");

  // --- NPC sheet creation + hidden-by-default -------------------------------
  dm.send({ type: "CREATE_SHEET", sheetId: "sheet-boss", name: "Goblin Boss" });
  const dmSheetFrame = await dm.next(
    (m) => m.type === "STATE" && m.state.sheets["sheet-boss"],
  );
  check(
    "DM sees full NPC sheet",
    dmSheetFrame.state.sheets["sheet-boss"].data.characterName === "Goblin Boss",
  );

  dm.send({
    type: "UPDATE_SHEET",
    sheetId: "sheet-boss",
    sheet: { ...dmSheetFrame.state.sheets["sheet-boss"].data, ac: 17, abilityScores: { str: 16 } },
  });
  await dm.next((m) => m.type === "STATE" && m.state.sheets["sheet-boss"]?.data.ac === 17);

  const playerNpcFrame = await player.next(
    (m) => m.type === "STATE" && m.state.sheets["sheet-boss"],
  );
  const npcForPlayer = playerNpcFrame.state.sheets["sheet-boss"];
  check(
    "player: NPC fully redacted by default",
    npcForPlayer.redacted === true &&
      npcForPlayer.data.characterName === "" &&
      npcForPlayer.data.ac === 0 &&
      !npcForPlayer.data.abilityScores.str,
    `name="${npcForPlayer.data.characterName}" ac=${npcForPlayer.data.ac}`,
  );

  // --- live per-section reveal ----------------------------------------------
  dm.send({ type: "SET_SHEET_REVEAL", sheetId: "sheet-boss", section: "abilities", revealed: true });
  const revealFrame = await player.next(
    (m) => m.type === "STATE" && m.state.sheets["sheet-boss"]?.revealed.abilities === true,
  );
  const revealed = revealFrame.state.sheets["sheet-boss"];
  check(
    "player: revealed section arrives live, others stay hidden",
    revealed.data.abilityScores.str === 16 &&
      revealed.data.ac === 0 &&
      revealed.data.characterName === "",
    `str=${revealed.data.abilityScores.str} ac=${revealed.data.ac}`,
  );

  // --- authorization ----------------------------------------------------------
  player.send({
    type: "UPDATE_SHEET",
    sheetId: "sheet-boss",
    sheet: { ...revealed.data, ac: 1 },
  });
  const authErr = await player.next((m) => m.type === "ERROR");
  check("player editing NPC sheet is rejected", /own character sheet/i.test(authErr.message));
  await sleep(200);
  check(
    "NPC sheet unchanged after rejected edit",
    dm.frames.filter((m) => m.type === "STATE").at(-1).state.sheets["sheet-boss"].data.ac === 17,
  );

  const ownFrame = player.frames.filter((m) => m.type === "STATE").at(-1);
  player.send({
    type: "UPDATE_SHEET",
    sheetId: slotId,
    sheet: { ...ownFrame.state.sheets[slotId].data, characterName: "Vex the Bold" },
  });
  const ownEdit = await dm.next(
    (m) => m.type === "STATE" && m.state.sheets[slotId]?.data.characterName === "Vex the Bold",
  );
  check("player edits own sheet; DM sees it", !!ownEdit);

  // --- DM notes redaction ------------------------------------------------------
  dm.send({ type: "UPDATE_DM_NOTES", notes: "the mayor is a doppelganger" });
  const dmNotesFrame = await dm.next(
    (m) => m.type === "STATE" && m.state.dmNotes.includes("doppelganger"),
  );
  check("DM sees own notes", !!dmNotesFrame);
  await sleep(200);
  const playerLatest = player.frames.filter((m) => m.type === "STATE").at(-1);
  const notesLeak = player.frames.some(
    (m) => m.type === "STATE" && m.state.dmNotes && m.state.dmNotes.length > 0,
  );
  check("player never receives DM notes", !notesLeak && playerLatest.state.dmNotes === "");

  // --- token linking + delete-unlinks ----------------------------------------
  dm.send({
    type: "ADD_TOKEN",
    token: {
      id: "tok-boss", sceneId: dmSheetFrame.state.activeSceneId, x: 10, y: 10,
      label: "Boss", color: "#c45c5c", kind: "enemy", imageUrl: null,
      ownerPlayerId: null, sheetId: "sheet-boss",
    },
  });
  await dm.next((m) => m.type === "STATE" && m.state.tokens.some((t) => t.id === "tok-boss" && t.sheetId === "sheet-boss"));
  dm.send({ type: "DELETE_SHEET", sheetId: "sheet-boss" });
  const afterDelete = await dm.next(
    (m) =>
      m.type === "STATE" &&
      !m.state.sheets["sheet-boss"] &&
      m.state.tokens.some((t) => t.id === "tok-boss"),
  );
  check(
    "deleting a sheet unlinks its tokens",
    afterDelete.state.tokens.find((t) => t.id === "tok-boss")?.sheetId === null,
  );

  // --- PC sheet deletion refused ------------------------------------------------
  dm.send({ type: "DELETE_SHEET", sheetId: slotId });
  const pcErr = await dm.next((m) => m.type === "ERROR");
  check("PC sheet deletion refused", /tied to their player slot/i.test(pcErr.message));

  dm.ws.close();
  player.ws.close();
} catch (err) {
  check("smoke run completed", false, String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
