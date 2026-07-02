// Phase 4 WS smoke: DICE_THROW_REQUEST/DICE_THROW protocol — authoritative CSPRNG
// values, identical broadcast to all clients, secret stripping at the frame level,
// deferred + masked log entries, d100 semantics, track validation, sheet attribution.
const ROOM = `smoke4-${Date.now().toString(36)}`;
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
    next: (pred, timeoutMs = 6000) =>
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

/** Minimal valid recorded track for the given specs (2 frames of rest). */
function fakeTrack(specs, frames = 4) {
  return {
    fps: 30,
    frames,
    dice: specs.map((spec) => ({
      id: spec.id,
      samples: Array.from({ length: frames * 7 }, (_, i) => (i % 7 === 6 ? 1 : 0)),
    })),
    impacts: [],
  };
}

try {
  const dm = connect("dm");
  await dm.opened;
  dm.send({ type: "JOIN", role: "dm", displayName: "DM", roomKey: "" });
  await dm.next((m) => m.type === "JOINED");
  dm.send({ type: "ADD_PLAYER_SLOT", name: "Vex" });
  const slotFrame = await dm.next((m) => m.type === "STATE" && m.state.playerSlots.length === 1);
  const vexId = slotFrame.state.playerSlots[0].id;

  const vex = connect("vex");
  await vex.opened;
  vex.send({ type: "JOIN", role: "player", slotId: vexId, roomKey: "" });
  await vex.next((m) => m.type === "JOINED");

  // --- public player throw ---------------------------------------------------
  const specs1 = [{ id: "a1", kind: "d20", percentile: false }];
  vex.send({
    type: "DICE_THROW_REQUEST", rollId: "throw-1", specs: specs1,
    track: fakeTrack(specs1), modifier: 3, trayCenter: [100, 200],
  });
  const dmThrow = await dm.next((m) => m.type === "DICE_THROW" && m.rollId === "throw-1");
  const vexThrow = await vex.next((m) => m.type === "DICE_THROW" && m.rollId === "throw-1");
  check(
    "both clients receive the throw with identical server values",
    JSON.stringify(dmThrow.faceValues) === JSON.stringify(vexThrow.faceValues) &&
      dmThrow.faceValues.length === 1 &&
      dmThrow.faceValues[0] >= 1 && dmThrow.faceValues[0] <= 20 &&
      dmThrow.trayCenter[0] === 100,
    `values=${JSON.stringify(dmThrow.faceValues)}`,
  );
  const logAtThrow = lastState(vex).log.some((e) => e.kind === "roll" && e.roll?.expression === "1d20+3");
  check("log entry is deferred until the dice settle", !logAtThrow);
  const logged = await vex.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "roll" && e.roll?.expression === "1d20+3"),
  );
  const entry1 = logged.state.log.find((e) => e.kind === "roll" && e.roll?.expression === "1d20+3");
  check(
    "deferred log entry totals face value + modifier",
    entry1.roll.total === dmThrow.faceValues[0] + 3 && entry1.actor.name === "Vex",
    `total=${entry1.roll.total}`,
  );

  // --- d100 = percentile d10 + unit d10 --------------------------------------
  const specs100 = [
    { id: "p1", kind: "d10", percentile: true },
    { id: "u1", kind: "d10", percentile: false },
  ];
  vex.send({
    type: "DICE_THROW_REQUEST", rollId: "throw-100", specs: specs100,
    track: fakeTrack(specs100), modifier: 0, trayCenter: [0, 0],
  });
  await vex.next((m) => m.type === "DICE_THROW" && m.rollId === "throw-100");
  const logged100 = await vex.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "roll" && e.roll?.expression === "1d100"),
  );
  const entry100 = logged100.state.log.find((e) => e.roll?.expression === "1d100");
  check(
    "d100 pair interprets to 1..100",
    entry100.roll.total >= 1 && entry100.roll.total <= 100 && entry100.roll.rolls.length === 1,
    `total=${entry100.roll.total}`,
  );

  // --- secret DM throw: stripped for player, masked log ------------------------
  dm.send({ type: "CREATE_SHEET", sheetId: "sheet-gob", name: "Goblin Boss" });
  await dm.next((m) => m.type === "STATE" && m.state.sheets["sheet-gob"]);
  const specsS = [{ id: "s1", kind: "d6", percentile: false }];
  dm.send({
    type: "DICE_THROW_REQUEST", rollId: "throw-secret", specs: specsS,
    track: fakeTrack(specsS), modifier: 0, trayCenter: [0, 0],
    private: true, context: { sheetId: "sheet-gob", label: "Sneak attack" },
  });
  const dmSecret = await dm.next((m) => m.type === "DICE_THROW" && m.rollId === "throw-secret");
  const vexSecret = await vex.next((m) => m.type === "DICE_THROW" && m.rollId === "throw-secret");
  check(
    "secret throw: DM gets values + real actor, player gets blank dice",
    Array.isArray(dmSecret.faceValues) && dmSecret.actorName === "Goblin Boss" &&
      vexSecret.faceValues === undefined && vexSecret.secret === true && vexSecret.actorName === "DM",
    `player copy=${JSON.stringify({ faceValues: vexSecret.faceValues, actor: vexSecret.actorName })}`,
  );
  const dmLogged = await dm.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "roll" && e.dmOnly && e.label === "Sneak attack"),
  );
  check("DM's secret log entry keeps label + values", !!dmLogged);
  await sleep(200);
  const vexMasked = lastState(vex).log.find((e) => e.kind === "roll" && e.masked);
  check(
    "player gets the masked entry (no label, no values)",
    vexMasked && !vexMasked.label && vexMasked.roll.total === 0,
  );

  // --- validation + authz -------------------------------------------------------
  const badSpecs = [{ id: "b1", kind: "d20", percentile: false }];
  const badTrack = fakeTrack(badSpecs);
  badTrack.dice[0].samples = badTrack.dice[0].samples.slice(0, 5); // wrong length
  vex.send({
    type: "DICE_THROW_REQUEST", rollId: "throw-bad", specs: badSpecs,
    track: badTrack, modifier: 0, trayCenter: [0, 0],
  });
  const badErr = await vex.next((m) => m.type === "ERROR");
  check("malformed track rejected", /invalid dice throw/i.test(badErr.message));

  vex.send({
    type: "DICE_THROW_REQUEST", rollId: "throw-priv", specs: badSpecs,
    track: fakeTrack(badSpecs), modifier: 0, trayCenter: [0, 0], private: true,
  });
  const privErr = await vex.next((m) => m.type === "ERROR" && /secret/i.test(m.message));
  check("player cannot make secret throws", true, privErr.message);

  vex.send({
    type: "DICE_THROW_REQUEST", rollId: "throw-cheat", specs: badSpecs,
    track: fakeTrack(badSpecs), modifier: 0, trayCenter: [0, 0],
    context: { sheetId: "sheet-gob", label: "Cheat" },
  });
  const cheatErr = await vex.next((m) => m.type === "ERROR" && /own sheet/i.test(m.message));
  check("player cannot throw as another's sheet", true, cheatErr.message);

  dm.ws.close();
  vex.ws.close();
} catch (err) {
  check("smoke run completed", false, String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
