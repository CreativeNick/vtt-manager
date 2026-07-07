import Konva from "konva";

/// <summary>
/// Board render quality (blur-fix round): one module owns the effective canvas pixel ratio.
///
/// - Default: the device's real `devicePixelRatio` (Konva's own default).
/// - "Hi-res rendering" toggle: floors the ratio at 2 — on a standard-DPI display (dpr 1,
///   where canvas text/images look softest) everything is supersampled 2× for visibly crisper
///   glyph anti-aliasing and image sampling, at ~4× the fill cost. On hi-DPI displays (dpr ≥ 2)
///   the toggle is a no-op.
///
/// `applyRenderPixelRatio` flips LIVE canvases (every mounted Konva stage) and sets the global
/// `Konva.pixelRatio` so canvases created later (conditionally-mounted layers) match. Components
/// read the current ratio reactively via `useSyncExternalStore(subscribeRenderPixelRatio,
/// getRenderPixelRatio)` — no prop threading, and the embedded scene-editor stage updates too.
/// </summary>

const deviceRatio = () =>
  typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

let hiRes = false;
const listeners = new Set<() => void>();

/** The pixel ratio Konva canvases should render at right now. */
export function getRenderPixelRatio(): number {
  return hiRes ? Math.max(deviceRatio(), 2) : deviceRatio();
}

export function subscribeRenderPixelRatio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Re-applies high-quality image smoothing to a stage's canvases. Chrome defaults
 * `imageSmoothingQuality` to "low", which visibly softens every downscaled draw (token
 * portraits, the map). Any canvas RESIZE (stage resize, pixel-ratio change) resets context
 * state back to "low", and layers mounted later (vision mask, light tint, …) start there too —
 * so this must be safe to call often. It reads the live context state to know whether anything
 * actually needs bumping, and returns true when it changed something (→ caller should redraw).
 */
export function bumpStageSmoothing(stage: Konva.Stage): boolean {
  let changed = false;
  const bump = (canvas: { getContext?: () => unknown } | null | undefined) => {
    const ctx = (canvas?.getContext?.() as { _context?: CanvasRenderingContext2D } | undefined)
      ?._context;
    if (ctx && (ctx.imageSmoothingQuality !== "high" || !ctx.imageSmoothingEnabled)) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      changed = true;
    }
  };
  for (const layer of stage.getLayers()) bump(layer.getCanvas());
  bump((stage as unknown as { bufferCanvas?: { getContext?: () => unknown } }).bufferCanvas);
  return changed;
}

type ResizableCanvas = { getPixelRatio(): number; setPixelRatio(ratio: number): void };

/**
 * Turns the hi-res toggle on/off: updates the module state (notifying subscribers), points
 * `Konva.pixelRatio` at the new ratio for future canvases, and re-ratios + redraws every
 * canvas of every mounted stage (board and embedded scene editor alike).
 */
export function applyRenderPixelRatio(on: boolean) {
  hiRes = on;
  const ratio = getRenderPixelRatio();
  Konva.pixelRatio = ratio;
  for (const stage of Konva.stages) {
    let changed = false;
    const reRatio = (canvas: ResizableCanvas | null | undefined) => {
      if (canvas && canvas.getPixelRatio() !== ratio) {
        canvas.setPixelRatio(ratio); // re-sizes the buffer; resets context state
        changed = true;
      }
    };
    for (const layer of stage.getLayers()) reRatio(layer.getCanvas());
    reRatio((stage as unknown as { bufferCanvas?: ResizableCanvas }).bufferCanvas);
    // The resize reset smoothing back to "low" — restore before the redraw.
    if (bumpStageSmoothing(stage) || changed) {
      stage.batchDraw();
    }
  }
  for (const listener of listeners) listener();
}
