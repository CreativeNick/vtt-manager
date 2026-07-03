# Sound effects

Drop `dice-roll.mp3` (or another browser-supported audio file, then update `SOUND_URL`
in `src/lib/rollSound.ts`) here to use a real dice-roll sound for non-3D rolls. Until a
file is present, a synthesized "rattle" placeholder plays automatically. Keep clips small
(a short roll is ~20–60KB) — they ship in the app bundle, not R2.
