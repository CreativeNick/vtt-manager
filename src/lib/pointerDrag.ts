/**
 * Pointer-event-based drag and drop. Native HTML5 drag proved unreliable here
 * (aborts on subtle DOM/render timing), so drags are driven entirely by
 * pointer events: a floating ghost follows the cursor and the drop target is
 * hit-tested with elementFromPoint on release.
 */

export type PointerDrop = {
  /** Topmost element under the pointer at release (ghost is pointer-transparent). */
  element: Element | null;
  clientX: number;
  clientY: number;
};

type PointerDragOptions = {
  /** Text shown in the drag ghost. */
  label: string;
  /** Pixels of movement before the drag actually starts (clicks stay clicks). */
  threshold?: number;
  onStart?: () => void;
  /** Fired as the pointer moves, with the element currently under it. */
  onHover?: (element: Element | null) => void;
  /** Fired on release — only if the drag actually started. */
  onDrop: (drop: PointerDrop) => void;
  /** Always fired last (drop or cancel). */
  onEnd?: () => void;
};

let lastDragEndedAt = 0;

/** True right after a drag finished — lets click handlers ignore the click that follows a drop. */
export function wasRecentDrag(): boolean {
  return Date.now() - lastDragEndedAt < 300;
}

/// <summary>
/// Begins tracking a potential drag from a pointerdown. The drag starts once
/// the pointer moves past the threshold; releasing earlier is a normal click.
/// </summary>
export function startPointerDrag(
  event: { clientX: number; clientY: number; button?: number },
  options: PointerDragOptions,
): void {
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  const startX = event.clientX;
  const startY = event.clientY;
  const threshold = options.threshold ?? 4;

  let started = false;
  let ghost: HTMLDivElement | null = null;

  const elementUnder = (x: number, y: number) => document.elementFromPoint(x, y);

  const begin = () => {
    started = true;
    ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = options.label;
    document.body.appendChild(ghost);
    document.body.classList.add("pointer-dragging");
    options.onStart?.();
  };

  const moveGhost = (x: number, y: number) => {
    if (ghost) {
      ghost.style.left = `${x + 14}px`;
      ghost.style.top = `${y + 10}px`;
    }
  };

  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("keydown", onKey);
    ghost?.remove();
    document.body.classList.remove("pointer-dragging");
    if (started) {
      lastDragEndedAt = Date.now();
      options.onHover?.(null);
      options.onEnd?.();
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!started) {
      if (Math.abs(e.clientX - startX) < threshold && Math.abs(e.clientY - startY) < threshold) {
        return;
      }
      begin();
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    options.onHover?.(elementUnder(e.clientX, e.clientY));
  };

  const onUp = (e: PointerEvent) => {
    if (started) {
      options.onDrop({
        element: elementUnder(e.clientX, e.clientY),
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }
    cleanup();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cleanup();
    }
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("keydown", onKey);
}
