// Phase 2 WS smoke test: unified log, sheet-attributed rolls, adv/dis,
// secret rolls persisting across DM refresh, whisper privacy, log cap.
const ROOM = `smoke2-${Date.now().toString(36)}`;
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

try {
  // Setup: DM + two players
  let dm = connect("dm");
  await dm.opened;
  dm.send({ type: "JOIN", role: "dm", displayName: "DM", roomKey: "" });
  await dm.next((m) => m.type === "JOINED");
  dm.send({ type: "ADD_PLAYER_SLOT", name: "Vex" });
  dm.send({ type: "ADD_PLAYER_SLOT", name: "Brom" });
  const slots = await dm.next((m) => m.type === "STATE" && m.state.playerSlots.length === 2);
  const [vexId, bromId] = slots.state.playerSlots.map((s) => s.id);

  const vex = connect("vex");
  await vex.opened;
  vex.send({ type: "JOIN", role: "player", slotId: vexId, roomKey: "" });
  await vex.next((m) => m.type === "JOINED");
  const brom = connect("brom");
  await brom.opened;
  brom.send({ type: "JOIN", role: "player", slotId: bromId, roomKey: "" });
  await brom.next((m) => m.type === "JOINED");

  // Give Vex a character name so roll attribution is visible
  const vexSheet = lastState(vex).sheets[vexId].data;
  vex.send({ type: "UPDATE_SHEET", sheetId: vexId, sheet: { ...vexSheet, characterName: "Vex the Bold" } });
  await dm.next((m) => m.type === "STATE" && m.state.sheets[vexId]?.data.characterName === "Vex the Bold");

  // --- sheet-attributed roll -------------------------------------------------
  vex.send({
    type: "ROLL_DICE", expression: "1d20+7",
    context: { sheetId: vexId, label: "Stealth check" },
  });
  const rollFrame = await brom.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "roll" && e.label === "Stealth check"),
  );
  const rollEntry = rollFrame.state.log.find((e) => e.kind === "roll" && e.label === "Stealth check");
  check(
    "sheet roll attributed to character, visible to everyone",
    rollEntry.actor.name === "Vex the Bold" && rollEntry.actor.sheetId === vexId &&
      rollEntry.roll.modifier === 7,
    `actor=${rollEntry.actor.name} total=${rollEntry.roll.total}`,
  );

  // --- rolling from someone else's sheet is rejected ---------------------------
  vex.send({ type: "ROLL_DICE", expression: "1d20", context: { sheetId: bromId, label: "Cheat" } });
  const rollErr = await vex.next((m) => m.type === "ERROR");
  check("rolling from another's sheet rejected", /own sheet/i.test(rollErr.message));

  // --- advantage ----------------------------------------------------------------
  vex.send({ type: "ROLL_DICE", expression: "1d20+2", context: { sheetId: vexId, label: "Adv test" }, adv: "adv" });
  const advFrame = await vex.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "roll" && e.label === "Adv test"),
  );
  const advEntry = advFrame.state.log.find((e) => e.label === "Adv test");
  check(
    "advantage keeps best total and reports the dropped one",
    advEntry.roll.adv === "adv" && typeof advEntry.roll.otherTotal === "number" &&
      advEntry.roll.total >= advEntry.roll.otherTotal,
    `kept=${advEntry.roll.total} dropped=${advEntry.roll.otherTotal}`,
  );

  // --- secret roll: dmOnly, invisible to players, survives DM refresh ------------
  dm.send({ type: "ROLL_DICE", expression: "1d20+5", private: true, context: { label: "Secret save" } });
  await dm.next((m) => m.type === "STATE" && m.state.log.some((e) => e.dmOnly && e.kind === "roll"));
  await sleep(250);
  const playerSeesSecret = [vex, brom].some((c) =>
    c.frames.some((m) => m.type === "STATE" && m.state.log.some((e) => e.dmOnly)),
  );
  check("secret roll never reaches players", !playerSeesSecret);

  // simulate DM refresh: close + reconnect + rejoin
  dm.ws.close();
  await sleep(400);
  dm = connect("dm2");
  await dm.opened;
  dm.send({ type: "JOIN", role: "dm", displayName: "DM", roomKey: "" });
  const rejoined = await dm.next((m) => m.type === "STATE" && m.yourRole === "dm");
  check(
    "secret roll survives DM refresh (persisted dmOnly log entry)",
    rejoined.state.log.some((e) => e.kind === "roll" && e.dmOnly),
  );

  // --- chat + whispers ------------------------------------------------------------
  vex.send({ type: "SEND_CHAT", text: "hello table" });
  await brom.next((m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "chat" && e.text === "hello table"));
  check("public chat reaches everyone", true);

  vex.send({ type: "SEND_CHAT", text: "psst dm only", whisperTo: "dm" });
  await dm.next((m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "chat" && e.text === "psst dm only"));
  await sleep(250);
  const bromSawWhisper = brom.frames.some(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "chat" && e.text === "psst dm only"),
  );
  const vexSeesOwnWhisper = lastState(vex).log.some((e) => e.kind === "chat" && e.text === "psst dm only");
  check("whisper visible to sender and DM, invisible to third party", !bromSawWhisper && vexSeesOwnWhisper);

  dm.send({ type: "SEND_CHAT", text: "your eyes only", whisperTo: vexId });
  await vex.next((m) => m.type === "STATE" && m.state.log.some((e) => e.text === "your eyes only"));
  await sleep(250);
  const bromSawDmWhisper = brom.frames.some(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.text === "your eyes only"),
  );
  check("DM→player whisper invisible to third party", !bromSawDmWhisper);

  // --- events in the log -------------------------------------------------------------
  const anyState = lastState(dm);
  const sceneId = anyState.scenes[1]?.id ?? anyState.scenes[0].id;
  dm.send({ type: "SET_SCENE", sceneId });
  const evFrame = await brom.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "event" && /Scene changed/.test(e.text)),
  );
  check("scene change logged as event", !!evFrame);

  // --- log cap -------------------------------------------------------------------------
  for (let i = 0; i < 110; i++) {
    vex.send({ type: "SEND_CHAT", text: `spam ${i}` });
  }
  await vex.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "chat" && e.text === "spam 109"),
    8000,
  );
  const cappedLog = lastState(vex).log;
  check("log capped at 100 entries", cappedLog.length <= 100, `len=${cappedLog.length}`);

  dm.ws.close();
  vex.ws.close();
  brom.ws.close();
} catch (err) {
  check("smoke run completed", false, String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
