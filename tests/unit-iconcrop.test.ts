// Crop-modal unit test: the IconCrop <-> CropRect conversion helpers that let the crop
// modal edit a focal-point+zoom crop as a draggable rectangle over the full image. The
// key invariant is that rect -> crop -> rect (and crop -> rect -> crop) round-trip, so the
// modal never distorts the stored crop and every existing read-only render stays correct.
import {
  MAX_ICON_ZOOM,
  clampCropRect,
  iconCropToRect,
  rectToIconCrop,
  type CropRect,
  type IconCrop,
} from "@lib/types";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const cropApprox = (a: IconCrop, b: IconCrop) =>
  approx(a.x, b.x, 1e-4) && approx(a.y, b.y, 1e-4) && approx(a.zoom, b.zoom, 1e-4);
const inUnit = (r: CropRect) =>
  r.left >= -1e-9 && r.top >= -1e-9 && r.left + r.width <= 1 + 1e-9 && r.top + r.height <= 1 + 1e-9;

// Image aspects: landscape, portrait, square. Frame aspects: square (the app's case) + a
// non-square frame to exercise the helper's generality.
const imgAspects = [16 / 9, 4 / 3, 1, 3 / 4, 9 / 16];
const frameAspects = [1, 1.5, 0.5];

// --- crop -> rect -> crop round-trips for any pan-able crop (zoom > 1) -------
// At zoom 1 the cover-constraining axis has no pan room, so its focal coord isn't
// recoverable (it normalizes to 0.5); every zoom > 1 gives both axes room.
for (const Ai of imgAspects) {
  for (const Af of frameAspects) {
    for (const zoom of [1.25, 2, 3.5, MAX_ICON_ZOOM]) {
      for (const x of [0, 0.25, 0.5, 0.75, 1]) {
        for (const y of [0, 0.5, 1]) {
          const crop: IconCrop = { x, y, zoom };
          const rect = iconCropToRect(crop, Ai, Af);
          const back = rectToIconCrop(rect, Ai, Af);
          check(
            `roundtrip crop Ai=${Ai.toFixed(2)} Af=${Af} z=${zoom} (${x},${y})`,
            cropApprox(crop, back),
            `-> ${JSON.stringify(back)}`,
          );
          check(`rect stays inside image Ai=${Ai.toFixed(2)} Af=${Af} z=${zoom} (${x},${y})`, inUnit(rect));
          // Aspect lock: the box's displayed aspect equals the frame aspect.
          check(
            `rect aspect locked Ai=${Ai.toFixed(2)} Af=${Af} z=${zoom}`,
            approx((rect.width * Ai) / rect.height, Af, 1e-6),
          );
        }
      }
    }
  }
}

// --- zoom 1: full-cover box, focal collapses to centered on the tight axis ----
{
  const rect = iconCropToRect({ x: 0.9, y: 0.2, zoom: 1 }, 16 / 9, 1); // landscape, constrained by height
  const back = rectToIconCrop(rect, 16 / 9, 1);
  check("zoom1 landscape: height fills frame", approx(rect.height, 1));
  check("zoom1 landscape: x (free axis) recovers", approx(back.x, 0.9, 1e-4), `x=${back.x}`);
  check("zoom1 landscape: y (tight axis) centers", approx(back.y, 0.5), `y=${back.y}`);
  check("zoom1 landscape: zoom = 1", approx(back.zoom, 1));
}

// --- clampCropRect: enforces aspect, zoom range, and image bounds -------------
{
  // Oversized + off-aspect + out of bounds -> snapped to a valid, in-bounds, aspect box.
  const c = clampCropRect({ left: -0.5, top: 0.8, width: 3, height: 0.1 }, 4 / 3, 1);
  check("clamp: in bounds", inUnit(c), JSON.stringify(c));
  check("clamp: aspect locked", approx((c.width * (4 / 3)) / c.height, 1, 1e-6));
  const z = rectToIconCrop(c, 4 / 3, 1).zoom;
  check("clamp: zoom within [1, MAX]", z >= 1 - 1e-9 && z <= MAX_ICON_ZOOM + 1e-9, `zoom=${z}`);

  // A box tinier than the max zoom allows is grown back to the min size (= max zoom).
  const tiny = clampCropRect({ left: 0.4, top: 0.4, width: 0.001, height: 0.001 }, 1, 1);
  check("clamp: min size = 1/MAX_ICON_ZOOM", approx(Math.min(tiny.width, tiny.height), 1 / MAX_ICON_ZOOM, 1e-9));
}

// --- guards: degenerate aspects fall back to a full-frame crop ----------------
{
  const full = iconCropToRect({ x: 0.3, y: 0.7, zoom: 2 }, 0, 1);
  check("guard: bad imgAspect -> full frame", full.left === 0 && full.top === 0 && full.width === 1 && full.height === 1);
  const def = rectToIconCrop({ left: 0.1, top: 0.1, width: 0.5, height: 0.5 }, Number.NaN, 1);
  check("guard: bad imgAspect -> default crop", cropApprox(def, { x: 0.5, y: 0.5, zoom: 1 }));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
