# Sound Design

Design doc for the platform's sound effects: reactive dice & coin audio, UI clicks, token
pickup/place, and a DM-selectable "start initiative" sound. Sound files are sourced by hand
(Pixabay etc.), dropped into `public/sounds/`, and ship with the app bundle. The running list
of found/candidate sounds lives in [SOUND_EFFECTS.md](SOUND_EFFECTS.md).

---

## 1. The key insight: dice sound sync is already free

The 3D dice system does **not** run physics on every player's machine. When someone throws:

1. The roller's client runs a *hidden* physics simulation to completion in one go
   (`presimulate()`, [src/dice/engine.ts:691](src/dice/engine.ts#L691)) and records the whole
   tumble as a motion track — positions/rotations at 30 fps **plus a list of impacts**
   (`{frame, strength}`) captured from Rapier collision events, which are already enabled
   ([engine.ts:755](src/dice/engine.ts#L755), drained at [engine.ts:769](src/dice/engine.ts#L769)).
2. The track is sent to the server (`DICE_THROW_REQUEST`), the server picks the actual face
   values with a CSPRNG (physics never decides results), and broadcasts `DICE_THROW` with the
   track to **every** client.
3. Every client replays the identical track. During playback, `advanceTrack()`
   ([engine.ts:1044](src/dice/engine.ts#L1044)) fires `onImpact(strength, coin)` at the exact
   recorded frames → `DiceAudio.impact()` ([src/dice/audio.ts:70](src/dice/audio.ts#L70)).

**Consequence:** reactive dice audio needs *zero* new networking. Every collision moment and
its intensity is already delivered to every client, perfectly synced to the visuals. The work
is (a) playing real samples instead of the current procedural synth, and (b) recording *richer*
data into the track (what surface was hit, rolling motion) so the audio can react with more
nuance.

### What exists today

| Piece | Where | Notes |
|---|---|---|
| 3D roll synth | [src/dice/audio.ts](src/dice/audio.ts) (`DiceAudio`) | Procedural Web Audio: sine "thud" + filtered-noise "clack"; metallic ring for coins. Strength scales volume/brightness. 20 ms rate limit. |
| Text-roll sound | [src/lib/rollSound.ts](src/lib/rollSound.ts) | **The pattern to copy everywhere:** probes for `/sounds/dice-roll.mp3`; if present uses it, otherwise falls back to synth. No file exists yet, so it always synths today. |
| Impact data | `DiceImpact {frame, strength}` in [src/lib/dice3d.ts:64](src/lib/dice3d.ts#L64) | strength = impacting die's speed normalized to 0..1. No surface info, no rolling info yet. |
| Mute | "Dice sound" toggle in [src/components/SettingsPanel.tsx:168](src/components/SettingsPanel.tsx#L168), persisted per-campaign | The settings idiom to extend. |
| Sound folder | `public/sounds/` (only a README) | Served at site root by Vite → referenced as `/sounds/...`. Files ship in the bundle, so keep them small. |

---

## 2. Architecture: one shared SFX layer

New module **`src/lib/sfx.ts`** — a single small manager that everything routes through.

```
AudioContext (one, shared, lazily created)
  └─ master GainNode  ← master volume slider
       ├─ "dice"   bus (GainNode) ← toggle   (existing dice+coin sounds move here)
       ├─ "tokens" bus (GainNode) ← toggle
       ├─ "ui"     bus (GainNode) ← toggle
       └─ "events" bus (GainNode) ← toggle   (initiative + future alerts)
```

Core pieces:

- **Sample loader.** `fetch()` + `decodeAudioData()` into `AudioBuffer`s, cached by URL.
  Use `AudioBufferSourceNode` for playback — *not* `<audio>` elements — because SFX need
  low latency, overlapping instances (three dice landing at once), and per-play pitch control.
  Lazy-load on first use per category so the map screen doesn't fetch dice sounds it may
  never need.
- **Variants + humanization.** `play(name, {gain, pitchJitter})` picks randomly among
  `name-1.mp3 … name-N.mp3` (avoiding immediate repeats) and applies a random
  `playbackRate` of roughly ±5–8 %. This is the single biggest trick for making repeated
  sounds feel natural instead of like a machine gun.
- **Graceful fallback.** If a file 404s or fails to decode, fall back to the existing synth
  (dice/coin) or stay silent (ui/tokens) — exactly the `rollSound.ts` probe pattern. Sounds
  can be added to the folder incrementally; nothing ever breaks.
- **Autoplay unlock.** Browsers block audio until a user gesture. The global button-click
  listener (§4) doubles as the unlock: first `pointerdown` anywhere calls `ctx.resume()`.
  (`DiceAudio` already does this on dice grab — keep that too.)
- **Settings persistence.** Per-device, per-campaign via
  [src/lib/campaignStore.ts](src/lib/campaignStore.ts) (`cm:{roomId}:sfx` JSON blob:
  master volume + 4 category booleans), same idiom as the existing `dice-muted` key.
  Exposed to panels through `PanelContext` like `ctx.dice` is today
  ([src/panels/registry.tsx](src/panels/registry.tsx)).
- **`DiceAudio` integration.** Refactor `DiceAudio` to accept the shared context + dice bus
  instead of owning its own `AudioContext` (browsers cap concurrent contexts, and one master
  volume should govern everything). Its synth methods stay as the fallback layer.

### Folder layout

```
public/sounds/
  dice/        impact-1.mp3 … impact-4.mp3     die hits the surface (soft→hard variants)
               clack-1.mp3, clack-2.mp3        die hits another die (Phase B)
               roll-loop.mp3                   seamless 1–2 s loop of a die rolling (Phase B)
               throw.mp3                       short shake/whoosh at release (optional)
  coin/        flip.mp3                        the Pixabay "coin flip + shimmer" pick
               drop.mp3                        the Pixabay "coin drop" pick
  tokens/      pickup-1.mp3, pickup-2.mp3      soft lift/slide
               place-1.mp3, place-2.mp3        felt/wood thunk
  ui/          click.mp3                       very subtle tick
  initiative/  horn.mp3, swords.mp3, drums.mp3, bell.mp3   (DM picks one; see §6)
  dice-roll.mp3                                text-roll rattle (used automatically by rollSound.ts)
```

---

## 3. Dice & coin — reactive real audio

### Phase A — samples on the existing track (no format changes)

Works with today's `impacts[]`; ships value immediately.

- **Impacts → samples.** In `DiceAudio.impact(strength, coin)`, replace the synth call with
  a sample pick driven by strength: `strength < 0.4` → soft impact set, else hard set;
  `gain = 0.15 + strength * 0.85`; ±6 % pitch jitter. Keep the 20 ms rate limiter
  ([audio.ts:75](src/dice/audio.ts#L75)) — a 6-dice throw generates a flurry of contacts and
  the limiter is what keeps it from stacking into a roar.
- **Throw whoosh.** Play `dice/throw.mp3` once when playback starts (roller *and* remote
  clients — hook it at `playTrack()` start so everyone hears the roll begin).
- **Coin mapping** (uses the two sounds already picked in SOUND_EFFECTS.md):
  - `coin/flip.mp3` at track start — the flip + shimmer covers the airborne spin. The coin's
    fake depth-arc playback already computes `coinApexFrame`/`coinLandFrame`
    ([engine.ts:831-848](src/dice/engine.ts#L831-L848)).
  - `coin/drop.mp3` at the first impact (`coinLandFrame` comes from `track.impacts[0]`).
  - Coins have restitution 0.02 (they land dead, no bounce), so one drop sound is accurate.
  - If the flip sample is longer than short throws, start it slightly into the file or fade
    it out at the land frame so flip and drop don't overlap awkwardly.
- **Free win:** drop a `public/sounds/dice-roll.mp3` in and text rolls (non-3D fallback path)
  get real audio with **zero code changes** — `rollSound.ts` already probes for it.

### Phase B — richer track data (surface hits + rolling)

Extend what the pre-sim records so audio can distinguish *how* dice are moving. All changes
are in the recording side ([engine.ts:767-778](src/dice/engine.ts#L767-L778)) + the shared
types; playback consumes the new fields locally. Because roller and viewers share one track,
sync still comes for free.

1. **Surface classification.** Today `colliderToIndex` only tracks die colliders
     ([engine.ts:724](src/dice/engine.ts#L724)). Also record the floor and wall collider
     handles, then classify each contact pair:
     - die ↔ floor → `impact` (the main tock)
     - die ↔ wall → `wall` (duller thud — or reuse impact set at lower gain + lowpass)
     - die ↔ die → `clack` (sharper, higher-pitched click — very satisfying, worth its own samples)

     Extend `DiceImpact` → `{frame, strength, kind?: "floor" | "wall" | "die", die?: number}`
     (optional fields keep old tracks readable). The per-die index also fixes a today-gap:
     mixed rolls (coin + dice) flag `coin` per-*roll*, not per-*impact* — with `die` we can
     ring the coin only when the *coin* lands.
2. **True contact force (optional, nice-to-have).** Strength is currently the body's linear
     speed. Adding `RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS` next to `COLLISION_EVENTS` and
     draining `drainContactForceEvents()` gives real force magnitudes — better separation of
     "grazing tick" vs "slam". Only do this if speed-based strength feels wrong in practice.
3. **Rolling segments.** For the "moving/rolling across the board" sound: during the pre-sim
     step loop, per die per frame, detect *rolling* = (in contact with floor) ∧ (angular
     velocity above a threshold) ∧ (linear speed below the impact threshold). Merge consecutive
     frames into segments and bake them into the track:

     ```ts
     rolls?: Array<{ die: number; start: number; end: number; intensity: number }>
     ```

     Playback drives a looped `roll-loop.mp3` through a per-die gain node: fade in ~50 ms at
     segment start, gain follows intensity, fade out at segment end. Randomize the loop start
     offset per play so two dice rolling never phase-lock. One shared loop instance with a
     summed gain is fine (cheaper, sounds the same in practice).
4. **Validation.** The server sanitizes incoming tracks — `sanitizeThrow()`
     ([src/lib/dice3d.ts:170](src/lib/dice3d.ts#L170)) **must be updated** to accept/clamp the
     new optional fields, or it will strip them (or reject throws) before broadcast. Keep new
     fields optional so mid-deploy old/new clients coexist.

---

## 4. UI button clicks — one hook for the whole app

There is no shared `Button` component (buttons are ad-hoc `<button>` + CSS classes), so the
sound attaches at the root instead of at 100 call sites:

- A delegated **`pointerdown`** listener on the app root
  ([src/App.tsx](src/App.tsx), the `.app` div) — `pointerdown` feels snappier than `click`
  and coincides with the visual press state.
- Handler: `const btn = (e.target as Element).closest("button")` → play `ui/click.mp3` unless
  the button is `disabled` or matches the opt-out attribute **`data-silent`**.
- Opt-outs: dice tray buttons that trigger their own roll sounds
  ([src/components/DiceTray.tsx](src/components/DiceTray.tsx)), and anything else that turns
  out to double-fire. Add `data-silent` case by case.
- Keep it *very* quiet (see mixing table) with ±8 % pitch jitter and a ~60 ms rate limit so
  rapid clicking doesn't chatter.
- This listener is also the global **audio unlock** point (§2).

---

## 5. Token pickup / place — local only

Only the person dragging hears these (decided; can be synced later if it ever feels worth it).
The hooks already exist in `TokenNode`'s Konva group:

- **Pickup** → `onDragStart` ([src/components/MapCanvas.tsx:666](src/components/MapCanvas.tsx#L666)).
  Important: play *after* the existing early-return guard (shift-drag = pointer arrow,
  rotate gesture) so aiming an arrow doesn't "lift" a token audibly.
- **Place** → `onDragEnd` ([MapCanvas.tsx:676](src/components/MapCanvas.tsx#L676)).
- **New token placed** via the place gesture → `onPlaceToken`
  ([MapCanvas.tsx:2000](src/components/MapCanvas.tsx#L2000)) reuses the place sound.

Sound character: pickup = soft slide/lift (like a wooden piece leaving felt); place = gentle
felt/wood thunk. Two variants each + pitch jitter, routed to the "tokens" bus. Konva gives no
drop velocity, so place volume is fixed — the jitter carries the variation.

---

## 6. Start initiative — DM-selectable, everyone hears it

- **Sound library.** 3–5 curated options in `public/sounds/initiative/` (war horn, sword
  shing, war drums, bell — sourced by hand). A small manifest in code lists
  `{id, label, url}` so adding a file + one manifest line adds an option.
- **DM's choice is synced state.** New optional `GameState` field (e.g.
  `initiativeSoundId: string`), set via a new DM-gated message (e.g.
  `SET_INITIATIVE_SOUND`), mirroring the existing `SET_UI_OVERRIDE` /
  `SET_TOKEN_DEFAULTS` pattern (senders in `useDmActions`,
  [src/hooks/useGameRoom.ts:458-533](src/hooks/useGameRoom.ts#L458-L533); server enforcement
  via the DM-gated switch at [partykit/server.ts:1602](partykit/server.ts#L1602)).
- **Picker UI.** In the Combat panel's pre-combat view
  ([src/components/InitiativeTracker.tsx:37-43](src/components/InitiativeTracker.tsx#L37-L43)) —
  that view is already DM-only, right next to the "Roll for initiative!" button, with a ▶
  preview button per option (preview plays locally only, `data-silent` on those buttons).
- **Trigger.** No new network event needed: every client already learns combat started when
  `state.combat` transitions `null → non-null` in the `STATE` broadcast (server handler at
  [partykit/server.ts:1746](partykit/server.ts#L1746)). A client-side `useEffect` watching
  that transition plays `state.initiativeSoundId` on the **events** bus.
  Guard: only fire on an observed *transition* — a client joining mid-combat sees combat
  already set on its first state and must stay silent.

---

## 7. Settings

In [SettingsPanel.tsx](src/components/SettingsPanel.tsx), a "Sound" section (all per-device,
persisted per-campaign via `campaignStore`):

- **Master volume** — one slider (0–100 %), scales everything including dice.
- **Dice & coin** — the existing "Dice sound" toggle, relabeled/moved into this section.
- **Tokens** — pickup/place toggle.
- **UI clicks** — the global button tick toggle.
- **Events** — initiative (and future alerts like "your turn") toggle.

Four toggles + one slider. Deliberately *not* per-sound volume sliders — the mixing table
(§9) bakes sensible relative levels into the code; more knobs would just be clutter.

---

## 8. Asset shopping list

What to hunt for (Pixabay/freesound; keep links in [SOUND_EFFECTS.md](SOUND_EFFECTS.md)).
Format for everything: **MP3, mono, 96–128 kbps, tightly trimmed** (no leading silence —
it reads as lag). Total budget ~1–2 MB since files ship in the bundle.

| File(s) | Search terms | Count | Length | Notes |
|---|---|---|---|---|
| `dice/impact-1..4` | "dice hit table", "single die drop wood" | 3–4 | <0.3 s | Need a *single* die hit, not a handful. Mix 1–2 soft + 2 hard. |
| `dice/clack-1..2` | "dice click", "dice clack together" | 2 | <0.2 s | Die-on-die. Phase B. |
| `dice/roll-loop` | "dice rolling loop", "die tumbling" | 1 | 1–2 s | Must loop seamlessly (crossfade the ends in an editor if needed). Phase B. |
| `dice/throw` | "dice shake throw", "whoosh soft" | 1 | <0.5 s | Optional but sells the throw. |
| `coin/flip` | — already picked | 1 | — | Pixabay #85750 in SOUND_EFFECTS.md. |
| `coin/drop` | — already picked | 1 | — | Pixabay #422703 in SOUND_EFFECTS.md. |
| `tokens/pickup-1..2` | "board game piece pick up", "chess piece slide" | 2 | <0.3 s | Soft, unobtrusive. |
| `tokens/place-1..2` | "board game piece place", "chess piece felt" | 2 | <0.3 s | The satisfying thunk. |
| `ui/click` | "ui click subtle", "soft tick" | 1 | <0.15 s | The quietest sound in the app. |
| `initiative/*` | "war horn", "sword unsheath shing", "battle drums", "gong" | 3–5 | 1–3 s | Distinct moods; DM picks. |
| `dice-roll.mp3` | "dice roll table short" | 1 | ~1 s | Root of `/sounds/` — auto-used by text rolls today. |

---

## 9. Mixing guidelines

Loudness hierarchy (relative gain applied in code, assuming samples normalized to similar
peak levels first — normalize on import with any editor, e.g. Audacity):

| Category | Relative level | Rationale |
|---|---|---|
| Dice & coin | 1.0 (reference) | The star of the show; the roll *is* the event. |
| Events (initiative) | ~0.9 | An announcement — loud-ish, but it's 1–3 s and rare. |
| Tokens | ~0.5 | Frequent during play; should register, not announce. |
| UI clicks | ~0.2 | Felt more than heard. If someone notices it, it's too loud. |

Rules of thumb already proven by the dice synth, to keep:

- **Rate-limit every category** (dice 20 ms, ui ~60 ms, tokens ~80 ms) so bursts don't stack.
- **Pitch-jitter every play** (±5–8 %); randomize among variants, never repeat the same
  variant twice in a row.
- **Strength → gain, not strength → new sounds** for small differences; switch sample *sets*
  only at a coarse soft/hard split.

---

## 10. Roadmap

| Phase | Scope | Touches | Network changes |
|---|---|---|---|
| **1. SFX foundation** | `src/lib/sfx.ts` (context, buses, loader, settings), Settings UI (4 toggles + volume), global button click, token pickup/place | `sfx.ts` (new), `SettingsPanel.tsx`, `App.tsx`, `MapCanvas.tsx`, `registry.tsx`, `campaignStore.ts` | none |
| **2. Dice/coin samples** | Sample-based impacts on existing `impacts[]`, coin flip/drop mapping, throw whoosh, drop in `dice-roll.mp3`, `DiceAudio` on shared context | `src/dice/audio.ts`, `useDiceOverlay.ts`, `engine.ts` (playTrack hook) | none |
| **3. Richer track** | Surface classification (floor/wall/die + per-die index), rolling segments + loop, optional contact forces | `engine.ts` (presim), `dice3d.ts` (types + `sanitizeThrow`), `audio.ts` | track format (optional fields, backward-compatible) |
| **4. Initiative sound** | Manifest, DM picker w/ preview in Combat panel, synced `initiativeSoundId`, combat-start transition playback | `InitiativeTracker.tsx`, `useGameRoom.ts`, `partykit/server.ts`, `src/lib/types.ts` | new `SET_*` message + `GameState` field |

Phase 1 and 2 are independent enough to land in either order; 3 depends on 2, 4 depends only
on 1. Sounds can be dropped into `public/sounds/` at any time — anything missing falls back
to synth or silence.
