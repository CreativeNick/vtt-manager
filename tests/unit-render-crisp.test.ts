// Render-quality (blur fix) unit test: the √2 zoom bucketing that sizes token/map image
// caches (imageScaleBucket) and the device-pixel font snapping for board text (snapFontSize).
// Runs against real src/lib code via esbuild (see tests/README.md).
import {
  clampViewportScale,
  imageScaleBucket,
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  snapFontSize,
} from "@lib/sceneUtils";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// 1. imageScaleBucket: powers of √2, never undershoots, bounded overshoot
// ---------------------------------------------------------------------------
{
  check("scale 1 → bucket 1 (exact power)", imageScaleBucket(1) === 1);
  check("scale 2 → bucket 2 (exact power at max zoom)", imageScaleBucket(2) === 2);
  check("scale 0.5 → bucket 0.5 (exact power)", imageScaleBucket(0.5) === 0.5);
  check(
    "scale just past a power rounds UP (1.01 → √2)",
    Math.abs(imageScaleBucket(1.01) - Math.SQRT2) < 1e-12,
  );
  check("degenerate scales fall back to bucket 1", imageScaleBucket(NaN) === 1 && imageScaleBucket(0) === 1 && imageScaleBucket(-3) === 1);
  check(
    "scale beyond max zoom clamps to the max bucket",
    imageScaleBucket(50) === MAX_VIEWPORT_SCALE,
  );
  check(
    "scale below min zoom clamps (bucket covers MIN_VIEWPORT_SCALE)",
    imageScaleBucket(0.01) >= MIN_VIEWPORT_SCALE,
  );

  // The property the cache sizing relies on: bucket ≥ scale (never upscale at draw time)
  // and bucket < scale·√2 (downscale ratio stays inside the clean single-pass range).
  let holds = true;
  for (let s = MIN_VIEWPORT_SCALE; s <= MAX_VIEWPORT_SCALE; s += 0.013) {
    const clamped = clampViewportScale(s);
    const bucket = imageScaleBucket(s);
    if (bucket < clamped - 1e-12 || bucket >= clamped * Math.SQRT2 + 1e-12) {
      holds = false;
      break;
    }
  }
  check("bucket ∈ [scale, scale·√2) across the whole zoom range", holds);
}

// ---------------------------------------------------------------------------
// 2. snapFontSize: integer device-pixel sizes, bounded drift, safe fallbacks
// ---------------------------------------------------------------------------
{
  check("already-integer effective size unchanged (14 @ 1×, dpr 1)", snapFontSize(14, 1, 1) === 14);

  const snapped = snapFontSize(14, 0.66, 1);
  const device = snapped * 0.66;
  check(
    "fractional zoom snaps to whole device px",
    Math.abs(device - Math.round(device)) < 1e-9,
    `effective ${device}`,
  );
  check("snap drift stays small (≤ half device px)", Math.abs(snapped - 14) <= 0.5 / 0.66 + 1e-9);

  const hiDpr = snapFontSize(11, 0.9, 2.5);
  const hiDevice = hiDpr * 0.9 * 2.5;
  check(
    "dpr participates in the snap (11 @ 0.9×, dpr 2.5)",
    Math.abs(hiDevice - Math.round(hiDevice)) < 1e-9,
    `effective ${hiDevice}`,
  );

  check("tiny effective sizes floor at 1 device px", snapFontSize(10, 0.02, 1) === 1 / 0.02);
  check(
    "degenerate inputs return the input size",
    snapFontSize(14, 0, 1) === 14 && snapFontSize(14, NaN, 1) === 14 && snapFontSize(-5, 1, 1) === -5,
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
