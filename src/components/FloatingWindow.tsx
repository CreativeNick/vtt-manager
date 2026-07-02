import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type WindowPos = { x: number; y: number };

// Shared z-order stack for all open windows (module-level so windows rendered
// anywhere in the tree stack correctly against each other).
const zStack = new Map<string, number>();
let zCounter = 40;

function bringToFront(id: string): number {
  zCounter += 1;
  zStack.set(id, zCounter);
  return zCounter;
}

function isTopmost(id: string): boolean {
  let topId: string | null = null;
  let topZ = -1;
  for (const [key, z] of zStack) {
    if (z > topZ) {
      topZ = z;
      topId = key;
    }
  }
  return topId === id;
}

const positionKey = (id: string) => `cm-window-pos:${id}`;

function loadStoredPos(id: string): WindowPos | null {
  try {
    const raw = localStorage.getItem(positionKey(id));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as WindowPos;
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
      return parsed;
    }
  } catch {
    // Ignore corrupt storage; fall back to the default position.
  }
  return null;
}

function storePos(id: string, pos: WindowPos) {
  try {
    localStorage.setItem(positionKey(id), JSON.stringify(pos));
  } catch {
    // Storage full/unavailable — position simply won't persist.
  }
}

/// <summary>
/// Keeps at least the title bar reachable: the window may hang off the right or
/// bottom edge but can never be dragged fully out of the viewport.
/// </summary>
function clampPos(pos: WindowPos): WindowPos {
  const margin = 48;
  return {
    x: Math.min(Math.max(pos.x, margin - 320), window.innerWidth - margin),
    y: Math.min(Math.max(pos.y, 0), window.innerHeight - margin),
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

type FloatingWindowProps = {
  /** Stable id — used for z-ordering and the persisted position. */
  id: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Initial position when no stored position exists. */
  defaultPos: (viewportWidth: number, viewportHeight: number) => WindowPos;
  width?: number;
  /** When set, shows a "return to dock" button in the title bar. */
  onDock?: () => void;
};

/// <summary>
/// A draggable floating window over the map: title-bar drag, click-to-front
/// z-ordering, Esc closes the topmost window, and position remembered per id.
/// Content panels (sheet, dice, scenes, party, …) all render inside one of these.
/// </summary>
export function FloatingWindow({
  id,
  title,
  onClose,
  children,
  defaultPos,
  width = 340,
  onDock,
}: FloatingWindowProps) {
  const [pos, setPos] = useState<WindowPos>(() =>
    clampPos(loadStoredPos(id) ?? defaultPos(window.innerWidth, window.innerHeight)),
  );
  const [z, setZ] = useState(() => bringToFront(id));
  const dragOffsetRef = useRef<WindowPos | null>(null);

  useEffect(() => {
    return () => {
      zStack.delete(id);
    };
  }, [id]);

  // Never strand a window off-screen when the browser resizes.
  useEffect(() => {
    const onResize = () => setPos((current) => clampPos(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTopmost(id) && !isTypingTarget(event.target)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [id, onClose]);

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      dragOffsetRef.current = { x: event.clientX - pos.x, y: event.clientY - pos.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pos],
  );

  const onDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) {
      return;
    }
    setPos(clampPos({ x: event.clientX - offset.x, y: event.clientY - offset.y }));
  }, []);

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragOffsetRef.current) {
        return;
      }
      dragOffsetRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setPos((current) => {
        storePos(id, current);
        return current;
      });
    },
    [id],
  );

  return (
    <div
      className="window"
      style={{ left: pos.x, top: pos.y, zIndex: z, width }}
      onPointerDownCapture={() => setZ(bringToFront(id))}
    >
      <div
        className="window-header"
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="window-title">{title}</span>
        <span className="row" style={{ gap: "0.15rem" }}>
          {onDock ? (
            <button
              className="btn-ghost icon-btn"
              title="Return to sidebar"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onDock}
            >
              ⇥
            </button>
          ) : null}
          <button
            className="btn-ghost icon-btn"
            title="Close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            ✕
          </button>
        </span>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
