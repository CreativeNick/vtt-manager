// Phase 0 smoke test: verifies at the WebSocket-frame level that
//  1. unjoined (lobby) connections receive REDACTED state (no scenes/tokens/sheets/log)
//  2. after JOIN the DM receives full state
//  3. DM UPDATE_VIEWPORT produces lightweight VIEWPORT frames for other clients,
//     never full STATE broadcasts
//  4. a joined player receives full (unredacted-for-now) state
const ROOM = `smoke-${Date.now().toString(36)}`;
const URL_BASE = `ws://127.0.0.1:1999/parties/main/${ROOM}`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
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
        const timer = setTimeout(() => reject(new Error(`${label}: timeout`)), timeoutMs);
        waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // --- lobby connection sees redacted state --------------------------------
  const lobby = connect("lobby");
  await lobby.opened;
  const lobbyState = await lobby.next((m) => m.type === "STATE");
  const s = lobbyState.state;
  check(
    "lobby state is redacted",
    s.scenes.length === 0 &&
      s.tokens.length === 0 &&
      Object.keys(s.sheets).length === 0 &&
      s.log.length === 0,
    `scenes=${s.scenes.length} tokens=${s.tokens.length} sheets=${Object.keys(s.sheets).length}`,
  );

  // --- DM joins and gets full state ----------------------------------------
  const dm = connect("dm");
  await dm.opened;
  dm.send({ type: "JOIN", role: "dm", displayName: "Smoke DM", roomKey: "" });
  await dm.next((m) => m.type === "JOINED" && m.role === "dm");
  const dmState = await dm.next((m) => m.type === "STATE" && m.yourRole === "dm");
  check(
    "DM receives full state after JOIN",
    dmState.state.scenes.length > 0,
    `scenes=${dmState.state.scenes.length}`,
  );

  // --- player slot + player join -------------------------------------------
  dm.send({ type: "ADD_PLAYER_SLOT", name: "Smoke Hero" });
  const withSlot = await dm.next(
    (m) => m.type === "STATE" && m.state.playerSlots.length > 0,
  );
  const slotId = withSlot.state.playerSlots[0].id;

  const player = connect("player");
  await player.opened;
  player.send({ type: "JOIN", role: "player", slotId, roomKey: "" });
  await player.next((m) => m.type === "JOINED" && m.role === "player");
  const playerState = await player.next((m) => m.type === "STATE" && m.yourRole === "player");
  check(
    "player receives full state after JOIN",
    playerState.state.scenes.length > 0 &&
      Object.keys(playerState.state.sheets).length > 0,
  );

  // --- viewport hot path: VIEWPORT deltas, zero STATE frames ----------------
  const playerFramesBefore = player.frames.length;
  for (let i = 0; i < 10; i++) {
    dm.send({ type: "UPDATE_VIEWPORT", viewport: { x: i * 10, y: i * 5, scale: 1 + i / 100 } });
    await sleep(25);
  }
  await player.next((m) => m.type === "VIEWPORT" && m.viewport.x === 90, 4000).catch(() => null);
  await sleep(300); // let any trailing throttled flush land
  const newFrames = player.frames.slice(playerFramesBefore);
  const viewportFrames = newFrames.filter((m) => m.type === "VIEWPORT");
  const stateFrames = newFrames.filter((m) => m.type === "STATE");
  check(
    "DM pan produces VIEWPORT deltas",
    viewportFrames.length >= 2,
    `${viewportFrames.length} VIEWPORT frames for 10 updates (66ms coalescing)`,
  );
  check(
    "DM pan produces zero full-STATE broadcasts",
    stateFrames.length === 0,
    `${stateFrames.length} STATE frames`,
  );
  const last = viewportFrames[viewportFrames.length - 1];
  check(
    "final viewport value is correct",
    last && last.viewport.x === 90 && last.viewport.y === 45,
    last ? `x=${last.viewport.x} y=${last.viewport.y}` : "no frame",
  );

  // --- secret roll values stay DM-only (players see a masked entry) ---------
  dm.send({ type: "ROLL_DICE", expression: "1d20", private: true });
  const dmRoll = await dm.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "roll" && e.dmOnly),
  );
  await sleep(250);
  const playerRollEntries = player.frames
    .filter((m) => m.type === "STATE")
    .flatMap((m) => m.state.log.filter((e) => e.kind === "roll"));
  const valueLeaks = playerRollEntries.filter(
    (e) => !e.masked || e.roll.total !== 0 || e.roll.rolls.length > 0 || e.label,
  );
  check(
    "secret DM roll values never reach the player (masked entry only)",
    valueLeaks.length === 0 && playerRollEntries.length > 0 && !!dmRoll,
  );

  lobby.ws.close();
  dm.ws.close();
  player.ws.close();
} catch (err) {
  check("smoke run completed", false, String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
