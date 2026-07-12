// UX round 2 WS smoke: masked secret rolls at the frame level, folder/item
// CRUD + DM-only redaction, DELETE_FOLDER unassignment, inventory roundtrip
// with reveal gating.
const ROOM = `smokeux2-${Date.now().toString(36)}`;
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

  // --- masked secret roll -----------------------------------------------------
  dm.send({
    type: "ROLL_DICE", expression: "1d20+6", private: true,
    context: { label: "Goblin Boss attack" },
  });
  await dm.next((m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "roll" && e.dmOnly));
  const maskedFrame = await vex.next(
    (m) => m.type === "STATE" && m.state.log.some((e) => e.kind === "roll" && e.masked),
  );
  const masked = maskedFrame.state.log.find((e) => e.kind === "roll" && e.masked);
  check(
    "player sees masked secret roll with zero leakage",
    masked.actor.name === "DM" && !masked.label &&
      masked.roll.expression === "?" && masked.roll.rolls.length === 0 &&
      masked.roll.total === 0 && masked.roll.modifier === 0,
    JSON.stringify(masked.roll),
  );
  const dmSecret = lastState(dm).log.find((e) => e.kind === "roll" && e.dmOnly);
  check("DM keeps full secret roll", dmSecret.roll.total > 0 && dmSecret.label === "Goblin Boss attack");

  // --- folders + actors ---------------------------------------------------------
  dm.send({ type: "CREATE_FOLDER", folderId: "folder-band", kind: "actor", name: "Bandits" });
  dm.send({ type: "CREATE_SHEET", sheetId: "sheet-band1", name: "Bandit" });
  dm.send({ type: "SET_SHEET_FOLDER", sheetId: "sheet-band1", folderId: "folder-band" });
  const foldered = await dm.next(
    (m) => m.type === "STATE" && m.state.sheets["sheet-band1"]?.folderId === "folder-band",
  );
  check("actor folder assignment works", foldered.state.folders.some((f) => f.id === "folder-band"));

  dm.send({ type: "RENAME_FOLDER", folderId: "folder-band", name: "Bandit Camp" });
  await dm.next(
    (m) => m.type === "STATE" && m.state.folders.some((f) => f.name === "Bandit Camp"),
  );
  check("folder rename works", true);

  // --- items ---------------------------------------------------------------------
  dm.send({ type: "CREATE_FOLDER", folderId: "folder-loot", kind: "item", name: "Loot" });
  dm.send({ type: "CREATE_ITEM", itemId: "item-sword", name: "Longsword" });
  const created = await dm.next((m) => m.type === "STATE" && m.state.items["item-sword"]);
  dm.send({
    type: "UPDATE_ITEM",
    item: { ...created.state.items["item-sword"], description: "A sturdy blade.", folderId: "folder-loot" },
  });
  const updated = await dm.next(
    (m) => m.type === "STATE" && m.state.items["item-sword"]?.folderId === "folder-loot",
  );
  check("item create/update/folder works", updated.state.items["item-sword"].description === "A sturdy blade.");

  // --- players receive no directories ------------------------------------------------
  await sleep(250);
  const playerDirLeak = vex.frames.some(
    (m) =>
      m.type === "STATE" &&
      (m.state.folders.length > 0 || Object.keys(m.state.items).length > 0),
  );
  check("folders/items never reach player frames", !playerDirLeak);

  // --- DELETE_FOLDER unassigns members ------------------------------------------------
  dm.send({ type: "DELETE_FOLDER", folderId: "folder-loot" });
  const unassigned = await dm.next(
    (m) =>
      m.type === "STATE" &&
      m.state.items["item-sword"] &&
      !m.state.folders.some((f) => f.id === "folder-loot"),
  );
  check(
    "deleting a folder moves members to root",
    unassigned.state.items["item-sword"].folderId === null,
  );

  // --- player folder/item mutations rejected -------------------------------------------
  vex.send({ type: "CREATE_ITEM", itemId: "item-hack", name: "Hack" });
  const dmOnlyErr = await vex.next((m) => m.type === "ERROR");
  check("players cannot create items", /only the dm/i.test(dmOnlyErr.message));

  // --- inventory roundtrip + reveal gating ----------------------------------------------
  const vexSheet = lastState(vex).sheets[vexId].data;
  vex.send({
    type: "UPDATE_SHEET", sheetId: vexId,
    sheet: { ...vexSheet, inventory: [{ itemId: "item-sword", name: "Longsword", qty: 2, note: "sharp" }] },
  });
  const invFrame = await dm.next(
    (m) => m.type === "STATE" && m.state.sheets[vexId]?.data.inventory.length === 1,
  );
  check(
    "player inventory roundtrips",
    invFrame.state.sheets[vexId].data.inventory[0].qty === 2,
  );

  // NPC inventory hidden until revealed
  dm.send({ type: "CREATE_SHEET", sheetId: "sheet-hoard", name: "Dragon" });
  const hoardFrame = await dm.next((m) => m.type === "STATE" && m.state.sheets["sheet-hoard"]);
  dm.send({
    type: "UPDATE_SHEET", sheetId: "sheet-hoard",
    sheet: { ...hoardFrame.state.sheets["sheet-hoard"].data, inventory: [{ itemId: null, name: "Hoard gold", qty: 999, note: "" }] },
  });
  await dm.next(
    (m) => m.type === "STATE" && m.state.sheets["sheet-hoard"]?.data.inventory.length === 1,
  );
  await sleep(250);
  let hoardForPlayer = lastState(vex).sheets["sheet-hoard"];
  check("NPC inventory hidden by default", hoardForPlayer.data.inventory.length === 0);
  dm.send({ type: "SET_SHEET_REVEAL", sheetId: "sheet-hoard", section: "inventory", revealed: true });
  const revealedFrame = await vex.next(
    (m) => m.type === "STATE" && m.state.sheets["sheet-hoard"]?.revealed.inventory === true,
  );
  check(
    "revealed NPC inventory reaches player",
    revealedFrame.state.sheets["sheet-hoard"].data.inventory[0]?.name === "Hoard gold",
  );

  dm.ws.close();
  vex.ws.close();
} catch (err) {
  check("smoke run completed", false, String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
