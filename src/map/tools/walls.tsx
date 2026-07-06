import { Line, Rect } from "react-konva";
import { wallFromBrush, type Wall } from "../../lib/types";
import { segmentsIntersect } from "../../lib/visibility";
import type { MapTool, ToolRuntime } from "./types";

/// <summary>
/// Walls & doors tool (DM, Phase 6.9). Two modes (toolbar):
/// - **draw**: click to chain wall segments (each completed segment commits immediately, so the
///   chain is individually undoable); a press-drag-release makes a single segment. Endpoints snap
///   to nearby wall endpoints, then the grid. The current chain vertex + a rubber-band preview
///   render live. Press Esc / switch tools to end the chain.
/// - **select**: drag a marquee to select walls (Shift adds); a click on empty space clears the
///   selection. Selecting, dragging endpoints/segments, config, delete happen on the rendered
///   handles (see WallsLightsEditor in MapVision).
/// </summary>

type Pt = { x: number; y: number };
type WallDraft =
  | { mode: "draw"; last: Pt | null; down: Pt | null; preview: Pt | null }
  | { mode: "marquee"; x0: number; y0: number; x1: number; y1: number };

/** px: a down≈up gesture is a click (chain vertex); a larger delta is a drag (single segment). */
const CLICK_TOL = 6;

/** Build + send one wall segment for the current brush. */
function commitSegment(rt: ToolRuntime, a: Pt, b: Pt): void {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1) {
    return; // degenerate
  }
  const wall: Wall = {
    id: `wall-${crypto.randomUUID().slice(0, 8)}`,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    ...wallFromBrush(rt.wallBrush),
  };
  rt.send({ type: "ADD_WALL", sceneId: rt.scene.id, wall });
}

/** Ids of walls that intersect (or are contained by) the marquee box. */
function wallsInBox(walls: Wall[], box: { x0: number; y0: number; x1: number; y1: number }): string[] {
  const xmin = Math.min(box.x0, box.x1);
  const xmax = Math.max(box.x0, box.x1);
  const ymin = Math.min(box.y0, box.y1);
  const ymax = Math.max(box.y0, box.y1);
  const inside = (x: number, y: number) => x >= xmin && x <= xmax && y >= ymin && y <= ymax;
  const edges: Array<[number, number, number, number]> = [
    [xmin, ymin, xmax, ymin],
    [xmax, ymin, xmax, ymax],
    [xmax, ymax, xmin, ymax],
    [xmin, ymax, xmin, ymin],
  ];
  return walls
    .filter(
      (w) =>
        inside(w.x1, w.y1) ||
        inside(w.x2, w.y2) ||
        edges.some((e) => segmentsIntersect(w.x1, w.y1, w.x2, w.y2, e[0], e[1], e[2], e[3])),
    )
    .map((w) => w.id);
}

export const wallsTool: MapTool = {
  id: "walls",
  label: "Walls & doors",
  icon: "🧱",
  hotkey: "w",
  dmOnly: true,
  cursor: "crosshair",
  onDown: (event, rt) => {
    if (rt.wallMode === "select") {
      rt.setDraft({
        mode: "marquee",
        x0: event.world.x,
        y0: event.world.y,
        x1: event.world.x,
        y1: event.world.y,
      } satisfies WallDraft);
      return;
    }
    const p = rt.snapWallPoint(event.world.x, event.world.y);
    const prev = rt.draft as WallDraft | null;
    const last = prev && prev.mode === "draw" ? prev.last : null;
    rt.setDraft({ mode: "draw", last, down: p, preview: p } satisfies WallDraft);
  },
  onMove: (event, rt) => {
    const draft = rt.draft as WallDraft | null;
    if (!draft) {
      return;
    }
    if (draft.mode === "marquee") {
      rt.setDraft({ ...draft, x1: event.world.x, y1: event.world.y });
      return;
    }
    rt.setDraft({ ...draft, preview: rt.snapWallPoint(event.world.x, event.world.y) });
  },
  onUp: (event, rt) => {
    const draft = rt.draft as WallDraft | null;
    if (!draft) {
      return;
    }
    if (draft.mode === "marquee") {
      const dragged = Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) > CLICK_TOL;
      rt.onWallSelect(dragged ? wallsInBox(rt.scene.walls, draft) : [], event.shiftKey);
      rt.setDraft(null);
      return;
    }
    const up = rt.snapWallPoint(event.world.x, event.world.y);
    const down = draft.down ?? up;
    const dragged = Math.hypot(up.x - down.x, up.y - down.y) > CLICK_TOL;
    if (draft.last === null) {
      if (dragged) {
        // Press-drag-release: commit one segment, then keep chaining from its end.
        commitSegment(rt, down, up);
        rt.setDraft({ mode: "draw", last: up, down: null, preview: up } satisfies WallDraft);
      } else {
        // First click starts the chain.
        rt.setDraft({ mode: "draw", last: down, down: null, preview: down } satisfies WallDraft);
      }
      return;
    }
    // Extend the chain: commit last→up, continue from up.
    commitSegment(rt, draft.last, up);
    rt.setDraft({ mode: "draw", last: up, down: null, preview: up } satisfies WallDraft);
  },
  renderDraft: (draft) => {
    const d = draft as WallDraft | null;
    if (!d) {
      return null;
    }
    if (d.mode === "marquee") {
      return (
        <Rect
          x={Math.min(d.x0, d.x1)}
          y={Math.min(d.y0, d.y1)}
          width={Math.abs(d.x1 - d.x0)}
          height={Math.abs(d.y1 - d.y0)}
          stroke="#ffd166"
          strokeWidth={1}
          dash={[6, 4]}
          fill="rgba(255,209,102,0.08)"
          listening={false}
        />
      );
    }
    if (d.last && d.preview) {
      return (
        <Line
          points={[d.last.x, d.last.y, d.preview.x, d.preview.y]}
          stroke="#7cc4ff"
          strokeWidth={3}
          dash={[8, 6]}
          listening={false}
        />
      );
    }
    return null;
  },
};
