/// <summary>
/// A tiny, engine-independent dice-roll sound for text (non-3D) rolls. Prefers an audio
/// file at `public/sounds/dice-roll.mp3` if present; otherwise plays a synthesized
/// "rattle" placeholder (a few filtered-noise clacks via the Web Audio API), so the
/// feature works with zero assets and upgrades automatically once a file is dropped in.
/// Respects the same `dice-muted` preference the 3D dice audio uses.
/// </summary>

const MUTE_KEY = "dice-muted";
/** Drop a real dice SFX here (mp3/ogg) and it will be used automatically. */
const SOUND_URL = "/sounds/dice-roll.mp3";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

// Probe for an optional audio file once. Until it's confirmed playable we use the synth.
let fileEl: HTMLAudioElement | null = null;
let fileReady = false;
try {
  fileEl = new Audio(SOUND_URL);
  fileEl.preload = "auto";
  fileEl.addEventListener("canplaythrough", () => {
    fileReady = true;
  });
  fileEl.addEventListener("error", () => {
    fileReady = false;
    fileEl = null;
  });
} catch {
  fileEl = null;
}

function isMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureCtx(): boolean {
  if (ctx) {
    return true;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return false;
  }
  ctx = new Ctor();
  const length = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  noise = buffer;
  return true;
}

/// <summary>Synthesizes a short dice "rattle": several filtered-noise clacks + tocks.</summary>
function synthRattle() {
  if (!ensureCtx() || !ctx || !noise) {
    return;
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  const start = ctx.currentTime;
  const clacks = 5;
  for (let i = 0; i < clacks; i += 1) {
    const t = start + i * (0.05 + Math.random() * 0.05);
    const vol = 0.28 * (1 - i / (clacks + 1));

    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 900 + Math.random() * 1700;
    band.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.13);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150 + Math.random() * 120, t);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }
}

/// <summary>Plays the dice-roll sound (file if available, else the synth placeholder).</summary>
export function playRollSound() {
  if (isMuted()) {
    return;
  }
  if (fileReady && fileEl) {
    // Clone so rapid rolls can overlap; fall back to the synth if playback is blocked.
    const play = fileEl.cloneNode() as HTMLAudioElement;
    play.volume = 0.7;
    play.play().catch(() => synthRattle());
    return;
  }
  synthRattle();
}
