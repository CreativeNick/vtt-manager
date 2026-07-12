// Phase 6.9 WS smoke: wall-based MOVE collision. A player can't drag a token through a
// movement-blocking wall (server rejects with an error and the token stays put); a clear
// path is allowed; toggling `wallsBlockMovement` off lets the token pass; and the DM always
// bypasses collision. Run against a live partykit dev server (see tests/README.md).
const ROOM = `smoke-wallmove-${Date.now().toString(36)}`;
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
    next: (pred, timeoutMs = 6000) =>
      new Promise((resolve, reject) => {
        const existing = frames.find(pred);
        if (existing) return resolve(existing);
        const timer = setTimeout(() => reject(new Error(`${label}: timeout`)), timeoutMs);
        waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      }),
  };
}

const lastState = (c) => c.frames.filter((m) => m.type === "STATE").at(-1).state;
const sceneOf = (state, id) => state.scenes.find((s) => s.id === id);
const tokenOf = (state, id) => state.tokens.find((t) => t.id === id);

try {
  const dm = connect("dm");
  await dm.opened;
  dm.send({ type: "JOIN", role: "dm", displayName: "DM", roomKey: "" });
  await dm.next((m) => m.type === "JOINED");
  dm.send({ type: "SET_PLAYERS_CAN_MOVE", enabled: true });
  dm.send({ type: "ADD_PLAYER_SLOT", name: "Vex" });
  const slotFrame = await dm.next((m) => m.type === "STATE" && m.state.playerSlots.length === 1);
  const vexId = slotFrame.state.playerSlots[0].id;
  const sceneId = slotFrame.state.activeSceneId;

  const vex = connect("vex");
  await vex.opened;
  vex.send({ type: "JOIN", role: "player", slotId: vexId, roomKey: "" });
  await vex.next((m) => m.type === "JOINED");

  // Token owned by Vex at the origin, and a vertical movement wall at x=100 (y −50..50).
  dm.send({
    type: "ADD_TOKEN",
    token: {
      id: "tok-vex", sceneId, x: 0, y: 0, label: "Vex", color: "#c9a227", kind: "player",
      imageUrl: null, ownerPlayerId: vexId, sheetId: vexId, conditions: [], showHp: "none",
    },
  });
  await dm.next((m) => m.type === "STATE" && tokenOf(m.state, "tok-vex"));
  const scene = sceneOf(lastState(dm), sceneId);
  dm.send({
    type: "UPDATE_SCENE",
    scene: {
      ...scene,
      wallsBlockMovement: true,
      walls: [{ id: "mw", x1: 100, y1: -50, x2: 100, y2: 50, sight: "normal", light: "normal", move: "normal" }],
    },
  });
  await vex.next((m) => m.type === "STATE" && sceneOf(m.state, sceneId)?.walls.length === 1);

  // 1. Player move whose path crosses the wall is rejected; the token stays at the origin.
  vex.send({ type: "MOVE_TOKEN", tokenId: "tok-vex", x: 200, y: 0 });
  await vex.next((m) => m.type === "ERROR" && /wall blocks/i.test(m.message));
  check("player move through a wall is rejected", tokenOf(lastState(vex), "tok-vex").x === 0);

  // 2. A clear path (parallel to the wall) is allowed.
  vex.send({ type: "MOVE_TOKEN", tokenId: "tok-vex", x: 0, y: 100 });
  await vex.next((m) => m.type === "STATE" && tokenOf(m.state, "tok-vex")?.y === 100);
  check("player move along a clear path is allowed", true);

  // 3. Disabling wallsBlockMovement lets the token pass through the wall.
  const s2 = sceneOf(lastState(dm), sceneId);
  dm.send({ type: "UPDATE_SCENE", scene: { ...s2, wallsBlockMovement: false } });
  await vex.next((m) => m.type === "STATE" && sceneOf(m.state, sceneId)?.wallsBlockMovement === false);
  vex.send({ type: "MOVE_TOKEN", tokenId: "tok-vex", x: 200, y: 0 });
  await vex.next((m) => m.type === "STATE" && tokenOf(m.state, "tok-vex")?.x === 200);
  check("toggle off lets the token pass through the wall", true);

  // 4. Re-enable, and confirm the DM bypasses collision (DM moves take the unguarded path).
  const s3 = sceneOf(lastState(dm), sceneId);
  dm.send({ type: "UPDATE_SCENE", scene: { ...s3, wallsBlockMovement: true } });
  await dm.next((m) => m.type === "STATE" && sceneOf(m.state, sceneId)?.wallsBlockMovement === true);
  dm.send({ type: "MOVE_TOKEN", tokenId: "tok-vex", x: 0, y: 0 });
  await dm.next((m) => m.type === "STATE" && tokenOf(m.state, "tok-vex")?.x === 0);
  check("DM bypasses wall collision (moves through)", true);

  dm.ws.close();
  vex.ws.close();
} catch (err) {
  check(`unexpected error: ${err.message}`, false);
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
