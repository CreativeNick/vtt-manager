# Performance & Optimization Plan — Campaign Manager VTT

> Living checklist for the performance work. Check off items as they land. Full rationale and pros/cons per item below.

## Progress

- [x] **Phase 0** — Safety net & baseline (baseline: initial JS 860.28 kB / 258.36 gzip; build green)
- [x] **Phase 1** — Render hot path (1a viewport WS throttle · 1b token memo · 1c stable vision props · 1e transform window drag) — **verified at runtime, 0 errors** (1d grid-Shape deferred; `bumpStageSmoothing` left dep-less on purpose)
- [x] **Phase 2** — Asset pipeline (2a shared URL→image cache · 2b idle prefetch · 2c branded loading gate · 2d lazy `<img>`) — **verified: gate resolves, board reached, 0 errors**
- [x] **Phase 3** — Upload compression (synced DM "Optimize uploads" toggle, default on; WebP + caps in `readImageFromFile`) — **verified: toggle round-trips through server, WebP encodes smaller, 0 errors**
- [x] **Phase 4** — CSS paint cost (4a per-browser "Reduce visual effects" toggle → `data-fx="lite"` zeroes texture/notch vars · 4b opal-b.png→WebP, **585 KB → 35 KB, 94% smaller**) — **verified: lite mode strips textures + persists across reload, 0 errors**
- [x] **Phase 5** — Build & code splitting (konva → own vendor chunk; main app chunk **865 → 547 kB**; dice three.js/Rapier stay lazy) — build green
- [~] **Phase 6** — R2 cleanup future note added to `IMPLEMENTATION_PLAN.md` ✅ · vision-compute dedupe **DEFERRED** (gameplay-critical LOS; the plan itself deferred the algorithmic work pending exhaustive fog/vision testing)

---

## Context

After a large UI/aesthetic overhaul (commits `31f8b72`, `81ad3ce`, `76ccf87`), the concern is that the VTT now lags — especially on low-end machines. A full read of the codebase (React 19 + Vite + Konva canvas board + Cloudflare R2 for assets) confirms **real, fixable performance problems**, but also that the architecture is fundamentally sound (Konva layer split is good, heavy deps like three.js/Rapier are already lazy-loaded, WebSocket state carries URLs not image bytes).

The lag comes from **three independent sources**, in rough order of impact:

1. **The render hot path** — panning/zooming re-renders the *entire* React app + board every frame because viewport state lives too high, `MapCanvas` isn't memoized, and existing memoization is defeated by fresh inline props/closures.
2. **The asset pipeline** — uploads are stored **raw and uncompressed** (real assets are 4–5 MB portraits shown at 32px), and there is **no shared image cache**, so every token/portrait re-decodes on remount and every scene switch fetches its map cold. There is **no preloading** anywhere.
3. **The CSS paint layer** — a 12-layer "edge-divot" overlay repaints on every window drag/resize, every button carries tiled textures + paint-triggering hover transitions, and a 585 KB opal texture decodes into memory.

**Goal:** materially reduce lag on low-end machines with **zero change to how DMs/players interact** with the app. Every change is either invisible (caching, memoization, compression of the render path) or gated behind a toggle. Behavior parity is verified between each phase.

### Decisions locked in
- **Loading UX:** Build the shared image cache + background prefetch as the foundation, presented via a **brief, hard-capped branded loading screen on first connect only** (reveals the board after ~2.5s max regardless, so it can never become a long gate). **No skeleton framework** — scene switches are instant off the warm cache, and stragglers reuse the app's *existing* graceful placeholders (colored token ring / name-initial fallback).
- **Upload compression:** Implement as a **DM toggle** (campaign setting) that, when on, downscales to resolution caps AND re-encodes to WebP. Only affects *new* uploads. **Default: ON.**
- **R2 storage cleanup:** **Leave deletion logic as-is for now.** Add a note to `IMPLEMENTATION_PLAN.md` documenting auto-orphan-cleanup as a future option (see Phase 6).
- **Visual effects:** Add a **client-side (per-browser) "Visual Effects" toggle, default ON** (today's full look, pixel-identical). When off, a "lite" mode strips the expensive decorative layer — without affecting other players. **Button hover behavior is left unchanged.**

---

## The Optimization Hierarchy

Phases are ordered by **impact ÷ risk**. Highest-impact, lowest-risk work first. Each phase is independently shippable and verified before the next. **Nothing here changes controls, layouts, or gameplay.**

---

### Phase 0 — Safety net & baseline (do first, no product change)

- **First action:** copy this plan to `campaign-manager/PERFORMANCE_PLAN.md` (done).
- Capture a **before** baseline with the `verify` skill (headless Chrome): board renders, pan/zoom, token drag, vision/fog reveal, panels open/close, dice roll, scene switch.
- Note current initial bundle size (`npm run build` output) and a rough FPS feel during pan on a throttled CPU (Chrome DevTools 4×–6× throttle).
- Run `tsc --noEmit` + build as the green bar to return to after each phase.

---

### Phase 1 — Render hot path (BIGGEST perceived win, moderate risk)

**1a. Stop re-rendering the whole app on every pan/zoom frame.**
- `handleViewportChange` (`App.tsx:559`) calls `setViewport` + `dm.updateViewport` synchronously on every drag/wheel event, re-rendering all of `App` and the 2669-line `MapCanvas` each frame.
- Fix: don't push every drag frame into React state. Commit `viewport` to React state on drag/zoom *end*; during the drag, broadcast to players throttled to rAF (~20/s). Wrap `MapCanvas` in `React.memo` (`MapCanvas.tsx:846`).

**1b. Memoize tokens.**
- `TokenNode` (`MapCanvas.tsx:473`) is unmemoized and the token map (`MapCanvas.tsx:2078`) builds fresh inline closures every render.
- Fix: `React.memo(TokenNode)`; replace inline closures with a stable dispatcher (`onTokenEvent(tokenId, kind, ...args)`).

**1c. Stabilize props to the already-memoized vision layers.**
- `VisionMaskLayer` / `DmLightingOverlay` are `memo`'d but fed inline `.filter()` arrays (`MapCanvas.tsx:1838-1849`).
- Fix: `useMemo` those arrays; stabilize grid; add a dependency array to the unconditional `bumpStageSmoothing` effect (`MapCanvas.tsx:879`).

**1d. (Optional) Collapse the grid to one node.**
- Up to ~600 `<Line>` nodes reconciled every render (`MapCanvas.tsx:2051`) → single Konva `Shape` with a `sceneFunc`.

**1e. Smooth pop-up / floating-window dragging — fixes the reported lag.**
- `FloatingWindow.tsx`: positioned via `left`/`top` (`:324-330`) updated in React state every pointer-move (`onDragMove:210`) → repaints whole window + content every frame. Auto-height windows also read `offsetHeight` (`:161`) mid-drag (reflow). Notch overlay repaints each frame.
- Fix: during a drag, move the node with `transform: translate3d()` applied imperatively (skip React state per-move) + `will-change: transform`; commit to `left`/`top` on drop. Capture height once at drag start. Add a `.dragging` class that hides the notch overlay during the drag.

---

### Phase 2 — Asset pipeline: shared cache + preloading + loading UX

**2a. Shared, URL-keyed image cache (foundation).**
- `useImage` (`MapCanvas.tsx:222`) / `loadImageForCanvas` (`sceneUtils.ts:72`) create a new `Image()` per mount; `downscaleCache` is keyed by element so remounts re-decode.
- Fix: module-level `Map<url, Promise<HTMLImageElement>>` → each URL decodes once. Bound with LRU + eviction on campaign change.

**2b. Background prefetch.**
- On connect / scene load, prefetch (via `requestIdleCallback` + `img.decode()`): active scene map + tokens, party portraits, then likely-next scene maps.

**2c. Loading UX — brief capped branded screen on first connect (no skeletons).**
- Branded loading screen on first connect only, gated on active-map + party portraits warm, with a hard ~2.5s timeout. Replaces plain `"Connecting to room…"` (`App.tsx:472`). Stragglers reuse existing fallbacks (`MapCanvas.tsx:521`, `CroppableImage.tsx:91`).

**2d. Lazy-load DOM `<img>` portraits.**
- `CroppableImage` (`:109`) plain `<img>` + Directory (`:345`) eager full-res → add `loading="lazy"` + `decoding="async"`; wire the shared cache where practical.

---

### Phase 3 — Upload compression (DM toggle): fixes lag AND the 10 GB R2 budget

- All uploads funnel through `readImageFromFile` (`sceneUtils.ts:196`), used by every `uploadAsset.ts` helper.
- Add DM setting **"Optimize uploads"** (persisted in game state, default ON).
- When ON, before upload: downscale via existing `downscaleImage` (`sceneUtils.ts:95`) to caps (portraits/tokens ≈ 1024px, maps ≈ 2560px), then `canvas.toBlob("image/webp", 0.85)`. When OFF, upload raw as today.

---

### Phase 4 — CSS paint cost: a "Visual Effects" toggle + a texture re-encode

**4a. "Visual Effects" toggle (default ON).**
- Client-side (per-browser, localStorage) toggle, default ON. When OFF ("lite"), a `:root[data-fx="lite"]` block disables the notch overlays, modal `backdrop-filter` (`index.css:910`), crystal `drop-shadow` (`index.css:2467`), tiled textures (fall back to solid surfaces), and simplifies layout transitions (`index.css:406`, `1759`). Surface it beside the dark-mode toggle. Button hovers unchanged.

**4b. Re-encode heavy PNG textures to WebP (invisible; minor).**
- `opal-b.png` 512×512 / 572 KB, `paper-grain.png` 320×320 / 134 KB (tiled), `ink-speckles.png` already fine. One-time `sharp` conversion at same dimensions (opal ~q82; paper-grain lossless/high-q for seams). Repoint CSS `url()`s (`index.css:2442` + `--paper-layers`). Minor first-load win only.

---

### Phase 5 — Build & code splitting (faster first load)

- `React.lazy` + `Suspense` for DM-only prep pages, the Assets page, and heavy sheet views; add `manualChunks` in `vite.config.ts` to split `konva`/`react-konva` from app code. (Dice/three.js/Rapier already lazy.)

---

### Phase 6 — Vision/lighting compute (deferred / optional — highest risk)

- `computeVisibility` (`visibility.ts:173`) is O(segments²), run per light and per viewer + two more passes for labels/doors (`MapCanvas.tsx:1219`, `1279`).
- **Safe subset (include):** dedupe — compute each viewer's polygon once and reuse; stable memo keys.
- **Algorithmic rewrite (DEFER):** spatial index / reduced seed angles — gameplay-critical, needs exhaustive testing.
- **Docs only:** add an `IMPLEMENTATION_PLAN.md` note recording automatic R2 orphan cleanup as a future option.

---

## Verification (after every phase)

1. `npx tsc --noEmit` + `npm run build` stay green.
2. **`verify` skill** — behavior parity vs. Phase 0 baseline: board, pan/zoom, token drag+snap, vision/fog, panels, dice, scene switch, DM vs player.
3. **Pan/zoom feel** under CPU throttle (4×–6×) — smoother than baseline (Phase 1).
3b. **Pop-up window drag** — under throttle, drag a window with a sheet open; smooth (compositor-only) and still clamps on-screen (Phase 1e).
4. **Player sync** — a second client still receives DM viewport pans/zooms (Phase 1a).
5. **Upload toggle** — ON → small WebP; OFF → byte-identical to today (Phase 3).
6. **Cache/prefetch** — second scene switch is instant; first-load screen reveals within the cap (Phase 2).
7. **Visual parity** — screenshot windows mid-drag, button hover, dice tray; unchanged at rest (Phase 4).
8. Bundle size smaller than Phase 0 baseline (Phase 5).

## Non-goals
- No change to any control, layout, shortcut, or gameplay rule.
- No automatic R2 deletion (documented as future only).
- No migration/re-compression of already-uploaded assets.
- Vision *algorithm* rewrite deferred; only the safe dedupe ships now.
