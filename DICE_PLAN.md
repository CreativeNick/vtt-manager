# 3D Dice — Design & Behavior

## What the dice are

Players roll physical 3D dice (d4/d6/d8/d10/d12/d20, and d100 as a percentile d10 + a unit d10 for
even 1–100 odds). You grab dice with the mouse, shake, and throw them; there is also a **Throw**
button that throws for you, and an **Instant** option that resolves a roll with no animation. Typing
an expression (e.g. `2d6+3`, or a non-standard `1d77`) also rolls physically. Rolls are shared in
real time across everyone in the room and recorded in the dice log.

The feature is built with **Three.js + Rapier** (`@dimforge/rapier3d-compat`, WASM), procedural
geometry, and Web Audio sound — all in `src/dice3d/`. It is lazy-loaded (dynamic `import()`), so
Three.js + Rapier never touch the initial page load, and it uses a render-on-demand loop that stops
when dice are at rest.

## Core behaviors



### The die lands directly on its number (no post-settle rotation)

Results are **server-authoritative and provably fair** — the PartyKit server picks each face value
with `secureRandInt` (Web Crypto CSPRNG), never the physics. But the die must *land* on that number
rather than settling on a random face and then visibly rotating to the result.

How: when a die is thrown, the roller's client runs a **hidden pre-simulation** of the throw, finds
which face will end up on top, and **labels that face with the server's number before the die is
shown**. The die then physically tumbles and comes to rest already displaying the correct number —
no correction, no snap. (A safety fallback can orient-to-value in the rare case a landing face can't
be resolved, so a number is never displayed wrong.)

### Custom-sided dice roll as a blank crystal, then reveal the number

A non-standard size like `1d77` can't be a real polyhedron. It rolls as a **blank crystal/gem die**
(a hexagonal bipyramid) with no numbers. Once it comes to rest, the rolled value (still chosen by the
server's CSPRNG) **fades onto the up-facing surface**. The crystal carries its side count on the die
spec (`sides`) since the shape itself doesn't encode it. Multiple custom dice each reveal their own
value.

### The table log shows the result only after the dice finish rolling

For a physical roll the server broadcasts the throw immediately (so everyone animates) but **defers**
adding the result to the shared log until the dice would have settled — it waits the recorded track's
duration (`frames / fps`) plus a small buffer before appending to `publicDiceLog`. Instant rolls are
not deferred (they log right away).

### Instant rolls (quick spin-to-value)

A per-roll **Instant** button (next to Throw, and beside the expression input) resolves a roll with a
quick **spin-to-value**: the dice appear at the tray, give a short low-energy tumble, and settle on
the server's value in ~0.3–0.5s (then linger/fade). It reuses the normal `DICE_THROW` pipeline with a
"gentle" release, so it's shared with everyone and uses the same `secureRandInt` CSPRNG — fairness is
identical to a full throw.

### Secret rolls (DM-only): players see blank dice

The DM has a persistent **Secret** toggle. While it's on, every physical roll the DM makes is secret:
the server picks the result as usual but sends the full `DICE_THROW` (with `faceValues` + `roll`) only
to the DM, and broadcasts a copy **with** `faceValues`**/**`roll` **stripped** to everyone else. Players see
the dice tumble and settle **blank** (numbers hidden — the recorded `track` carries no values, so
nothing leaks), and the result is logged only in the DM's secret log (`DM_DICE_ROLL`), never the
public log. The DM sees the real numbers. The live **shake is also shown** to players (the
`DICE_MOTION` relay carries a `secret` flag and the dice render blank), so they see the DM rolling
something just like any other player's shake. Secret mode is read **at throw time** (a live ref), so
it can never go stale between arming and throwing. The toggle is the only secret control (there is no
separate secret form).

### Dice are a fixed on-screen size, pinned to a map spot

Each roll's dice are **positioned** on the shared map — anchored at the roller's view center (a
`trayCenter` in map/world coords, shared in the throw), so they pan with the map and land at the same
map location for everyone, and are clipped to the map pane so they never cover the side panels.

But their **size is independent of zoom**. The tumble runs in a **fixed, shared physics box**
(`AREA_HALF_W/H`), and each client fits that box into `REGION_PANE_FRACTION` (~60%) of its *own* map
pane (aspect-aware) via `recomputeScale`: `k = REGION_PANE_FRACTION * min(paneW/(2*AREA_HALF_W), paneH/(2*AREA_HALF_H)) / scale`. Dividing by the live `scale` cancels the camera's zoom, so a die's
on-screen size (`DIE_SCALE * k * scale`) depends only on the pane — constant through zoom, and
proportional on every window/monitor (small window → smaller dice + tray, but identical layout). The
shared box keeps the recorded track window-independent.

Three coordinate spaces bridge cleanly: the physics simulation runs in the fixed shared box (so the
recorded track is identical and bounded on every client); the per-client `k` (above) maps it to
map/world units; and the orthographic camera is driven purely by the live map viewport (`screen = paneOrigin + viewport + world * scale`). Dice render on a full-window overlay canvas that is
**clipped (**`clip-path`**) to the map pane**, so they can never paint over the side panels.

### Everyone sees the exact same motion + the roller's cursor

Multiplayer motion is **exact**, not approximate: the roller's client records the dice's real path
(positions/rotations per frame + impact markers for sound) during the pre-simulation and broadcasts
that **recorded track**. Every client — including the roller — replays the same track, so the
tumble and landing are pixel-identical on every screen.

While a player is grabbing/shaking/throwing, their **labeled cursor** (name + a per-player color) is
shown live on everyone else's screen, then hides once the dice settle. This reuses the existing
throttled live-motion relay.

The live shake is sent at ~30 updates/second, and other clients **smooth it with client-side
interpolation** — remote dice ease toward each received transform (position lerp + quaternion slerp,
frame-rate-independent), and the cursor glides via a short CSS transition — so the shake looks fluid
even though only a handful of samples cross the wire. The interpolation runs only while a shake is in
progress (the render loop idles otherwise), and like all live motion it is **WebSocket relay with
zero R2 usage**.

## Networking (transient — not persisted in GameState)

- `DICE_MOTION` — throttled live drag/shake relay (dice transforms + the roller's map/world
cursor + `trayCenter` + a `secret?` flag for the DM's blank shake), rebroadcast to other clients.
`specs` is sent only on the first packet (receivers cache by `rollId`).
- `DICE_THROW_REQUEST` (client→server) — `{ rollId, specs, track, modifier, private?, trayCenter }`.
The roller sends the recorded `track` and the map anchor.
- `DICE_THROW` (server→all) — `{ rollId, rollerId, rollerName, specs, track, faceValues?, roll?, private?, trayCenter }`.
The server picks `faceValues` (CSPRNG), appends the `DiceRoll` to the public log, and relays the
track. Every client replays the track and labels each die's landing face with its `faceValue`. For a
**secret** roll the full message (with `faceValues`/`roll`) goes only to the DM; everyone else gets a
copy with those **omitted**, so their dice render blank.

All of this is WebSocket-only (a few KB per throw) — **no Cloudflare R2 / storage usage**. Geometry
and audio are generated in code; there are no dice asset files.

## Module map (`src/dice3d/`)

- `diceGeometry.ts` — procedural polyhedra + runtime canvas number textures. Per-die number
decals are exposed so a die's faces can be relabeled per throw. `createDiceMaterial()` is the
single swap point for future textured "skins".
- `diceEngine.ts` — Three.js scene + Rapier world; hidden pre-simulation recorder, recorded-track
playback, per-face relabeling, blank rendering (`hideDieNumbers`) for secret rolls, fixed
window-independent physics box, per-roll `THREE.Group` anchored to the map at its `trayCenter`
(scaled by a per-client, zoom-independent `k` — `recomputeScale`), viewport-driven camera
(`setMapProjection`) + pane `clip-path`, settle/linger/fade, render-on-demand loop, audio hooks.
- `diceProtocol.ts` — shared transport types (`DieSpec`, `DiceTrack`, cursor), `decomposeDie`
(d100 → percentile d10 + d10), and pure result interpretation. No DOM/Three imports so the server
can use it.
- `diceAudio.ts` — Web Audio API; procedurally synthesized dice clatter (no audio files), volume
scaled by impact strength, with a mute preference.
- `useDiceArena.ts` — React controller: lazy-loads the engine, arms/throws dice, runs the
pre-sim, sends/receives tracks + cursor + `trayCenter`, and feeds in the map-area element plus the
live map projection (`setProjection` ← `MapCanvas`'s `onViewportChange`).



## Reused existing app code

- `src/lib/dice.ts` — `secureRandInt` + `rollDiceExpression` (text-input rolls still work).
- `src/components/DicePanel.tsx` — quick buttons arm 3D dice, plus Throw / tray toggle / mute; the
shared and secret roll logs are unchanged.
- `partykit/server.ts` — authoritative results + relay, alongside the existing `ROLL_DICE` path.



## Verification

Run `npm run partykit:dev` + `npm run dev`, open two windows (DM + player), and confirm: a thrown
die comes to rest already showing its number with no visible rotation; the path looks identical in
both windows; the roller's cursor shows during the roll and hides after; dice stay within the map
pane even when panels resize; d100 reads 1–100; with the DM's **Secret** toggle on, players see the
dice tumble **blank** (no numbers) while the DM sees the value and it logs only to the secret log;
results are uniform. `npm run build` passes and adds no R2 usage.