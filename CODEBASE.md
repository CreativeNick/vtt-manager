# Campaign Manager — Codebase Guide & Bare-Bones Revamp Plan

Part 1 documents how the entire codebase works today (a reference map). Part 2 is the plan for
stripping it down to a bare-bones, FoundryVTT-style foundation.

---

# PART 1 — How the entire codebase works

## Stack & topology
- **Frontend:** Vite + React 19 + Konva/react-konva (2D map), TypeScript. Deployed to
  **Cloudflare Pages** (`dist/`).
- **Realtime:** **PartyKit** — a DM-authoritative WebSocket server holding one `GameState` per
  room, persisted in Durable Object storage.
- **Assets:** **Cloudflare R2** bucket (`UPLOADS`) for uploaded map images, token images,
  portraits, campaign icons, plus a shared campaign registry JSON. Served via **Cloudflare Pages
  Functions**.
- **3D dice:** Three.js + Rapier (WASM) physics, lazy-loaded, in `src/dice3d/`.
- **Dev:** two processes — `npm run partykit:dev` (port 1999) and `npm run dev` (Vite). Vite
  proxies `/parties/*` → PartyKit and a custom plugin mirrors R2 uploads/registry to `public/`.

Data flow at a glance:
```
Browser (React) ──WS──> PartyKit GameServer ──> Durable Object storage ("state")
   │  (state sync, DM-authoritative)                 ▲
   │                                                 └ seeds from public/campaign/scenes.json on first run
   └──HTTP──> Pages Functions /api/upload-* ──> R2 (UPLOADS)  ; /maps,/tokens,... serve from R2 w/ static fallback
```

## Realtime server — `partykit/server.ts` (794 lines)
- `class GameServer implements Party.Server`. Holds `this.state: GameState` in memory and
  persists to `this.room.storage.put("state", …)`. Per-connection metadata in
  `this.clients: Map<id, {role, playerId, displayName, joined}>`.
- **`onStart`** — loads persisted state; if empty, seeds via `loadCampaignFromDisk()`
  (`partykit/loadCampaign.ts`) from `public/campaign/scenes.json`, else blank scenes. Normalizes
  scenes, clears transient fields, reschedules annotation expiry timers.
- **`onConnect`** — registers client (role=null, joined=false) and sends a lobby `STATE`.
- **`onClose`** — removes client, clears DM if it was the DM, resyncs `connectedPlayers`, broadcasts.
- **`onMessage`** — parses `ClientMessage`, checks `meta.joined` + role permissions, mutates
  state, then `broadcastState()`.
- **Auth:** `validateRoomKey()` against optional `room.env[ROOM_KEY]`; single-DM enforced via
  `state.dmClientId` (+ `clearStaleDm()`); `isDm()`/slot-ownership checks gate every action.
- **`broadcastState()`** — normalizes + persists + sends full `STATE` to each connection with its
  own `yourClientId`/`yourRole`. `persistState()` strips ephemeral fields (`dmClientId`,
  `connectedPlayers`) and caps `publicDiceLog` to 50.
- **Viewport throttle:** DM pan/zoom coalesced to ~66 ms (`scheduleViewportBroadcast`).
- **Annotations:** max 24 total / 3 active per player, auto-expire ~5 s (server-side timers).
- **Dice:** `ROLL_DICE` (text expr, CSPRNG `secureRandInt`, public log or DM-only
  `DM_DICE_ROLL`); `DICE_THROW_REQUEST`/`DICE_MOTION`/`DICE_THROW` power the 3D arena
  (server picks authoritative `faceValues`; secret rolls broadcast blank to non-DM).

## Client realtime hook — `src/hooks/useGameRoom.ts` (475 lines)
- Wraps `PartySocket` (party name hardcoded `"main"`). Host = `VITE_PARTYKIT_HOST` in prod, else
  the Vite proxy in dev.
- Exposes `state`, `status` (`connecting→connected→joined`), `error`, `yourClientId`, `yourRole`,
  `yourPlayerId`, `privateDiceLog`, and methods `join`, `send`, `rollDice`, `throwDice`,
  `sendDiceMotion`, `subscribeDice`.
- Handles inbound `STATE`/`JOINED`/`ERROR`/`DM_DICE_ROLL`/`DICE_THROW`/`DICE_MOTION`.
- Helpers: `useDmActions(room)` (memoized DM ops — setScene, addToken, addAnnotation, …) and
  `usePlayerSheet(room)` (your sheet + `UPDATE_MY_SHEET`).

## Shared types — `src/lib/types.ts` (818 lines)
`GameState = { roomId, dmClientId, activeSceneId, scenes[], tokens[], viewport, playerSlots[],
characterSheets{slotId→sheet}, connectedPlayers[], ping|null, annotations[], publicDiceLog[],
sheetTemplate, tokenTemplates[] }`.
- `Scene` = id, name, `layers: MapLayer[]`, width/height, centerX/Y, `playerPanLimit`, gridSize,
  showGrid, `fogEnabled`, `fogDataUrl`, defaultViewport, backgroundColor.
- `Token` = id, sceneId, x, y, label, color, kind(`player|enemy`), imageUrl, ownerPlayerId.
- `CharacterSheet` = 5e fields + `abilityScores`/`skillMods`/`saveMods` keyed by
  `SheetTemplate` def ids; `SheetTemplate` = customizable abilities/skills/saves.
- `PlayerSlot` = id, name, `visibleSceneIds[]` (per-player scene access).
- Extensive `normalize*` migration helpers keep old saved states loadable.

**Full message protocol:**
- **Client→Server:** `JOIN`(dm/player), `UPDATE_VIEWPORT`, `SET_SCENE`, `ADD_SCENE`,
  `UPDATE_SCENE`, `REMOVE_SCENE`, `ADD_TOKEN`, `MOVE_TOKEN`, `UPDATE_TOKEN`, `REMOVE_TOKEN`,
  `UPDATE_MY_SHEET`, `SET_PING`, `CLEAR_PING`, `ADD_ANNOTATION`, `UPDATE_FOG`, `IMPORT_CAMPAIGN`,
  `ADD_PLAYER_SLOT`, `UPDATE_PLAYER_SLOT`, `REMOVE_PLAYER_SLOT`, `ADD_TOKEN_TEMPLATE`,
  `UPDATE_TOKEN_TEMPLATE`, `REMOVE_TOKEN_TEMPLATE`, `ROLL_DICE`, `UPDATE_SHEET_TEMPLATE`,
  `DICE_MOTION`, `DICE_THROW_REQUEST`.
- **Server→Client:** `STATE`, `ERROR`, `JOINED`, `DM_DICE_ROLL`, `DICE_MOTION`, `DICE_THROW`.

## Assets — Cloudflare Pages Functions + R2
- Upload APIs: `functions/api/upload-{portrait,token-image,map-image,campaign-icon}.ts` →
  `functions/_shared/imageUpload.ts` → `env.UPLOADS.put(key, bytes)`. Keys:
  `portraits/${slotId}.ext`, `tokens/${tokenId}.ext`, `maps/${sceneId}-${layerId}.ext`,
  `campaign-icons/${roomId}.ext`.
- Serving: `functions/{maps,tokens,portraits,campaign-icons}/[filename].ts` →
  `serveStoredImageOrNext` (R2 first, static `public/` fallback, 1-yr immutable cache).
- Client: `src/lib/uploadAsset.ts` (POSTs data URLs), `src/lib/imageDataUrl.ts`
  (`parseImageDataUrl`). `wrangler.toml` binds R2 `UPLOADS`; `functions/env.d.ts` types it.

## Registry & persistence
- `src/lib/campaignRegistry.ts` — shared campaign list via `/api/campaign-rooms`
  (R2 `registry/rooms.json`), `functions/_shared/campaignRegistryStorage.ts`.
- `src/lib/savedCampaigns.ts` — per-browser history + cached room keys (localStorage).
- `src/lib/campaignManifest.ts` / `partykit/loadCampaign.ts` — seed scenes from
  `public/campaign/scenes.json`. `src/lib/devSaveCampaign.ts` posts back in dev.
- `src/lib/sessionViewportMemory.ts` — per-tab zoom/pan memory across scene switches.

## Dev plumbing — `vite.config.ts` + dev plugin
- Proxies `/parties/*` → `http://127.0.0.1:1999`.
- `devCampaignSavePlugin` adds `/__dev/upload-*`, `/__dev/campaign-rooms`, `/__dev/save-campaign`
  handlers that write to `public/` — mirroring R2/Pages Functions for local dev.

## Frontend shell & the two pages
- **Entry:** `src/main.tsx` → `src/App.tsx` (348 lines). State-routed (no URL router):
  no `session` → `<JoinScreen>`; joined → in-campaign layout. DM view is a 4-tab enum
  `main|players|scenes|tokens` — these are **sub-views**, not separate pages. Modals:
  CreateCampaign (portal), SceneSettings.
- **Lobby — `JoinScreen.tsx` (644 lines):** two-column — campaign list/search/create (left),
  role (DM name / player slot) + connection status (right). Create modal uploads an icon and
  registers the room.
- **Campaign layout:** locked `app-header` (DM tabs OR `PlayerSceneToolbar` + meta chips) over
  `ResizableSplit(main = map-section + DMToolbar footer | middle = DicePanel rail |
  sidebar = context panel)`. A full-window `.dice-arena` overlay hosts the 3D dice, clipped to the
  map pane.
- **`MapCanvas.tsx` (1555 lines):** Konva `<Stage>` — background/grid, map layers, tokens,
  annotations, fog. Modes: player pan/select, DM play, DM scene-edit, fog paint. Emits
  `onViewportChange` (feeds dice arena) and token/annotation callbacks.

## Feature systems
- **Character sheets:** `CharacterSheet.tsx` (649) + `SheetTemplateEditor.tsx` (228) +
  `NumberInput.tsx`. Debounced `UPDATE_MY_SHEET`; portrait upload; DM party view; customizable
  template.
- **Tokens:** `TokenLibraryPanel.tsx` (302) + `AddTokenPopover.tsx` (291) + `lib/tokenTemplate.ts`
  (reusable templates + inline placement).
- **Scenes/map libs:** `lib/sceneUtils.ts` (479 — normalize, layers, viewport/zoom math, image
  compression to fit WS limit, grid sizing), `lib/fogCanvas.ts` (fog mask), `lib/mapAnnotation.ts`
  (transient drawings).
- **Dice:** `lib/dice.ts` (parser + CSPRNG) + `src/dice3d/*` (engine 1137, geometry 678,
  useDiceArena 518, protocol 236, audio 122) + `DicePanel.tsx` (283). Server-authoritative,
  provably-fair, recorded-track replay; secret rolls; map-anchored, zoom-independent.
- **Misc:** `JoinIcons.tsx` (lobby SVGs), `SceneAccessPanel.tsx` (per-player scene visibility),
  `PlayerSceneToolbar.tsx` (player scene switch), `ResizableSplit.tsx` (splitter).

## Styling & deployment
- **Styling:** one ~2,950-line vanilla CSS file `src/index.css` (CSS variables, semantic
  classes, media queries). No Tailwind / CSS modules.
- **Deploy:** `.github/workflows/deploy.yml` — `partykit deploy --domain`, sync bundled
  `public/maps/*` to R2, `npm run build` with `VITE_PARTYKIT_HOST`, `wrangler pages deploy dist`.

## File map (source)
```
partykit/            server.ts, loadCampaign.ts
functions/           api/upload-*.ts, _shared/{imageUpload,campaignRegistryStorage}.ts,
                     {maps,tokens,portraits,campaign-icons}/[filename].ts, api/campaign-rooms.ts, env.d.ts
src/                 main.tsx, App.tsx, index.css, vite-env.d.ts
src/hooks/           useGameRoom.ts, useDebouncedCallback.ts
src/lib/             types.ts, sceneUtils.ts, dice.ts, fogCanvas.ts, mapAnnotation.ts,
                     tokenTemplate.ts, uploadAsset.ts, imageDataUrl.ts, campaignRegistry.ts,
                     campaignManifest.ts, savedCampaigns.ts, devSaveCampaign.ts, sessionViewportMemory.ts
src/components/      App panels: MapCanvas, DMToolbar, DicePanel, CharacterSheet, SheetTemplateEditor,
                     TokenLibraryPanel, AddTokenPopover, SceneSettingsModal, SceneAccessPanel,
                     PlayerSceneToolbar, JoinScreen, JoinIcons, ResizableSplit, NumberInput
src/dice3d/          diceEngine.ts, diceGeometry.ts, useDiceArena.ts, diceProtocol.ts, diceAudio.ts
config               vite.config.ts (+ dev plugin), wrangler.toml, partykit.json, tsconfig.json, package.json
```

---

# PART 2 — Bare-Bones Revamp Plan

## Why
The app is feature-heavy and its campaign UI is a locked header + resizable sidebar/rail. Goal:
**strip to a strong, minimal foundation** to build on, while **preserving the Cloudflare +
PartyKit realtime/asset plumbing**, and make the campaign page **FoundryVTT-style** — a full-bleed
map with **floating clusters of buttons/panels** (ref: `design_example/headerless_game_board`).
Only the two pages exist (lobby + campaign); DM tabs become floating panels.

### Decisions
- **Dice → simple text roller:** keep `src/lib/dice.ts` + a roll log; **strip all 3D**
  (`src/dice3d/`, physics, audio).
- **Keep:** character sheets (hard-coded 5e; **no** template editor).
- **Strip:** fog of war, token library/templates, map annotations & DM pings.
- **Styling:** fresh minimal **vanilla CSS** (replace `index.css`; no Tailwind).
- Always kept: full-screen map, pan/zoom, DM-authoritative sync, token place/move, scenes +
  switching, character sheets, text dice.

## Keep / Strip / Rewrite

**KEEP as-is (the foundation — necessary Cloudflare + PartyKit):**
`functions/**`, `wrangler.toml`, `partykit.json`, `.github/workflows/deploy.yml`, `.env.example`,
`partykit/loadCampaign.ts`, `src/lib/{uploadAsset,imageDataUrl,campaignRegistry,campaignManifest,
savedCampaigns,devSaveCampaign,sessionViewportMemory,dice}.ts`, `src/hooks/useDebouncedCallback.ts`,
`src/components/NumberInput.tsx`, `vite.config.ts` (+ dev plugin), `tsconfig.json`.

**STRIP (delete):**
- 3D dice: `src/dice3d/` (all) + dice-arena wiring in `App.tsx`
- `src/lib/fogCanvas.ts`, `src/lib/mapAnnotation.ts`, `src/lib/tokenTemplate.ts`
- `src/components/{TokenLibraryPanel,AddTokenPopover,SheetTemplateEditor,SceneAccessPanel,
  PlayerSceneToolbar,ResizableSplit,JoinIcons}.tsx`
- `src/index.css` (replaced)

**REWRITE (smaller for reduced scope + floating layout):**
- `src/lib/types.ts` — trimmed schema (below)
- `partykit/server.ts` — drop stripped handlers, keep core
- `src/hooks/useGameRoom.ts` — drop dice throw/motion; keep join/send/state/rollDice
- `src/App.tsx` — new shell + floating overlay
- `src/components/MapCanvas.tsx` — full-bleed pan/zoom/tokens/grid only (big shrink)
- `src/components/CharacterSheet.tsx` — hard-coded 5e, no template editor
- `src/components/DicePanel.tsx` — text input + roll button + log
- `src/components/SceneSettingsModal.tsx` — add/remove scene, upload map, grid toggle
- `src/components/DMToolbar.tsx` → floating tool cluster(s)
- new `src/index.css` (fresh minimal)

## Target UI — floating clusters
Model `design_example/headerless_game_board`: map is a fixed full-viewport background; UI is an
overlay that ignores pointer events except on its children.
```
<div class="app">
  <MapCanvas/>                 // fixed inset:0, z:0 — whole screen
  <div class="overlay">        // fixed inset:0, pointer-events:none, z:10
     <TopLeftCluster/>         // campaign name, Leave→lobby, online/status chips
     <LeftToolCluster/>        // DM only: Add Token, Scene switcher, Scene settings
     <RightPanels/>            // toggle-open floating cards: Character Sheet, Dice (input+roll+log)
     <BottomCluster/>          // quick Roll + status HUD (optional)
  </div>
  {modal && <Portal><SceneSettingsModal/></Portal>}
</div>
```
- Add one reusable primitive `FloatingCluster` with an `anchor` prop
  (`top-left|left|right|bottom-right|…`) rendering a `pointer-events:auto` box — every cluster
  uses it, so adding clusters later is trivial.
- Players: read-only map mirroring the DM's active scene + viewport, own sheet panel, dice panel,
  move own token. DM: tool cluster + party-sheet view + scene settings.

## Reduced schema (`types.ts` + server)
- **`GameState` keeps:** roomId, dmClientId, activeSceneId, scenes, tokens, viewport, playerSlots,
  characterSheets, connectedPlayers, publicDiceLog. **Drop:** ping, annotations, tokenTemplates,
  customizable sheetTemplate (replace with a hard-coded 5e constant).
- **`Scene`:** single background map image (collapse `layers[]` → one `mapUrl`+size, keeping the
  `maps/${sceneId}-${layerId}` upload key working with a fixed layerId), width/height, centerX/Y,
  gridSize, showGrid, defaultViewport, backgroundColor. **Drop:** fogEnabled, fogDataUrl,
  playerPanLimit(optional).
- **`PlayerSlot`:** drop `visibleSceneIds` (players mirror DM).
- **Client→Server keeps:** JOIN, UPDATE_VIEWPORT, SET_SCENE, ADD/UPDATE/REMOVE_SCENE,
  ADD/MOVE/UPDATE/REMOVE_TOKEN, UPDATE_MY_SHEET, ADD/UPDATE/REMOVE_PLAYER_SLOT, ROLL_DICE
  (optional IMPORT_CAMPAIGN). **Drop:** SET_PING, CLEAR_PING, ADD_ANNOTATION, UPDATE_FOG,
  *_TOKEN_TEMPLATE, UPDATE_SHEET_TEMPLATE, DICE_MOTION, DICE_THROW_REQUEST.
- **Server→Client keeps:** STATE, ERROR, JOINED, DM_DICE_ROLL. **Drop:** DICE_MOTION, DICE_THROW.
- Remove the `../dice3d/diceProtocol` import + annotation/token-template re-exports from
  `types.ts`; keep `DiceRoll`.

## Execution steps (ordered)
1. **Branch + doc.** Branch `bare-bones` off `dice-ui`; write this `CODEBASE.md`; baseline `npm run build`.
2. **Reduce schema.** Rewrite `types.ts` to trimmed state/messages + hard-coded 5e template.
   Simplify `sceneUtils.ts` (single map image; keep viewport/zoom/grid/compression; drop
   fog/layer-array helpers).
3. **Trim server.** Delete fog/ping/annotation(+timers)/token-template/sheet-template/3D-dice
   handlers; keep JOIN/auth, viewport throttle, scenes, tokens, sheets, slots, ROLL_DICE
   (+DM_DICE_ROLL), persistence/broadcast.
4. **Trim hook.** Remove dice throw/motion; keep state/status/join/send/rollDice/useDmActions/
   usePlayerSheet.
5. **Delete stripped files** (list above).
6. **New styling + primitive.** Fresh `index.css` (reset, dark vars, full-bleed map, `.overlay`,
   `.floating-cluster`) + `FloatingCluster` component.
7. **Rebuild `MapCanvas.tsx`** full-bleed: pan/zoom, DM viewport broadcast + player mirror, single
   background image, grid, tokens (place/select/move-own). Remove fog/annotation/ping/scene-edit.
8. **Rebuild `App.tsx`** shell: lobby vs campaign; campaign = `<MapCanvas/>` + overlay clusters.
   Map role logic → cluster visibility.
9. **Simplify panels:** `CharacterSheet.tsx` (hard-coded 5e, keep portrait upload + minimal slot
   mgmt), `DicePanel.tsx` (text roller + public/secret log), `SceneSettingsModal.tsx`, `DMToolbar`
   → floating tool cluster.
10. **Simplify lobby** `JoinScreen.tsx`: registry list, create-campaign modal (icon upload),
    DM/player + slot pick — plain markup, no `JoinIcons`.
11. **Typecheck/build** (`npm run build`), fix fallout, then manual multiplayer verification.

## Verification
- `npm run build` (tsc + vite build) passes — no unused-import/type errors after strip; grep
  shows no imports of `src/dice3d/*`, `fogCanvas`, `mapAnnotation`, `tokenTemplate`, or removed
  message types.
- `npm run partykit:dev` + `npm run dev`; two windows (DM `?role=dm` + player):
  - **Lobby:** create campaign (icon uploads), appears in list; DM joins by name, player by slot.
  - **Map:** DM pans/zooms → player **mirrors** view + active scene; DM uploads map image, switches
    scenes.
  - **Tokens:** DM place/move/remove; player moves **only their own**; live for both.
  - **Sheet:** player edits (debounced), portrait upload works, DM sees it in party view.
  - **Dice:** `1d20+5` → shared log; DM secret roll → DM log only; no 3D canvas mounted.
  - **Layout:** map full-bleed; controls are floating clusters (no header bar, no resizable
    sidebar); clusters block map-drag only over their own boxes.
- R2/PartyKit config untouched → deploy path unchanged.
