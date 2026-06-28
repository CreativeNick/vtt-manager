import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Group, Image, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { DEFAULT_SCENE_BACKGROUND, DEFAULT_VIEWPORT, type GameState, type MapLayer, type Token, type Viewport } from "../lib/types";
import { canPlayerSeeScene } from "../lib/types";
import type { useDmActions } from "../hooks/useGameRoom";
import {
  fillFog,
  fogCanvasToDataUrl,
  loadFogCanvas,
  paintFogBrush,
  type FogBrushMode,
} from "../lib/fogCanvas";
import {
  clampPlayerViewport,
  fitViewportToScene,
  isDefaultViewport,
  loadImageForCanvas,
  moveMapLayer,
  moveSceneCenter,
  normalizeScene,
  tokenDiameterForGridSize,
  viewportForNormalizedScene,
} from "../lib/sceneUtils";
import {
  getSessionViewport,
  saveSessionViewport,
  type SessionViewportMode,
} from "../lib/sessionViewportMemory";
import {
  ANNOTATION_MIN_LENGTH,
  annotationOpacity,
  annotationPathLength,
  appendAnnotationSample,
  trimAnnotationPoints,
} from "../lib/mapAnnotation";

type MapCanvasProps = {
  state: GameState;
  sceneId: string;
  isDm: boolean;
  playerSlotId?: string | null;
  dm: ReturnType<typeof useDmActions>;
  onMoveToken?: (tokenId: string, x: number, y: number) => void;
  onAddAnnotation?: (sceneId: string, points: number[], color: string) => void;
  annotationColor?: string;
  fogMode: boolean;
  fogPreview: boolean;
  fogBrushMode: FogBrushMode;
  sceneEditMode: boolean;
  viewCommand: { type: "fit" | "reset"; id: number } | null;
  onSettingsViewportChange?: (viewport: Viewport) => void;
};

type MapLayerImageProps = {
  layer: MapLayer;
  selected: boolean;
  draggable: boolean;
  onDragEnd: (layerId: string, x: number, y: number) => void;
};

/// <summary>
/// Renders a single positioned map image layer on the scene canvas.
/// </summary>
function MapLayerImage({ layer, selected, draggable, onDragEnd }: MapLayerImageProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadImageForCanvas(layer.url)
      .then((img) => {
        if (!cancelled) {
          setImage(img);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImage(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [layer.url]);

  if (!image) {
    return null;
  }

  return (
    <Group
      x={layer.x}
      y={layer.y}
      draggable={draggable}
      dragDistance={6}
      onDragEnd={(event) => {
        onDragEnd(layer.id, event.target.x(), event.target.y());
      }}
    >
      <Image image={image} x={0} y={0} width={layer.width} height={layer.height} />
      {selected ? (
        <Rect
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          stroke="#6b8afd"
          strokeWidth={3}
          dash={[8, 4]}
          listening={false}
        />
      ) : null}
    </Group>
  );
}

type SceneOriginMarkerProps = {
  armLength: number;
};

/// <summary>
/// Draws a crosshair at scene (0, 0) so the DM can see the world origin while editing.
/// </summary>
function SceneOriginMarker({ armLength }: SceneOriginMarkerProps) {
  const arm = Math.max(24, armLength);
  const labelOffset = arm + 14;

  return (
    <Group listening={false}>
      <Line
        points={[-arm, 0, arm, 0]}
        stroke="#4ade80"
        strokeWidth={2}
        listening={false}
      />
      <Line
        points={[0, -arm, 0, arm]}
        stroke="#4ade80"
        strokeWidth={2}
        listening={false}
      />
      <Circle
        x={0}
        y={0}
        radius={6}
        fill="rgba(74,222,128,0.35)"
        stroke="#4ade80"
        strokeWidth={2}
        listening={false}
      />
      <Text
        text="Origin (0, 0)"
        x={-48}
        y={labelOffset}
        width={96}
        align="center"
        fontSize={12}
        fill="#4ade80"
        listening={false}
      />
    </Group>
  );
}

type SceneCenterHandleProps = {
  centerX: number;
  centerY: number;
  armLength: number;
  onDragEnd: (centerX: number, centerY: number) => void;
};

/// <summary>
/// Draggable scene center marker; position is stored on the scene and does not move map images.
/// </summary>
function SceneCenterHandle({ centerX, centerY, armLength, onDragEnd }: SceneCenterHandleProps) {
  const arm = Math.max(18, armLength * 0.6);
  const labelOffset = arm + 12;

  return (
    <Group
      x={centerX}
      y={centerY}
      draggable
      dragDistance={6}
      onDragEnd={(event) => {
        onDragEnd(event.target.x(), event.target.y());
      }}
    >
      <Line
        points={[-arm, 0, arm, 0]}
        stroke="#c9a227"
        strokeWidth={2}
        listening={false}
      />
      <Line
        points={[0, -arm, 0, arm]}
        stroke="#c9a227"
        strokeWidth={2}
        listening={false}
      />
      <Circle
        x={0}
        y={0}
        radius={10}
        fill="rgba(201, 162, 39, 0.45)"
        stroke="#c9a227"
        strokeWidth={2}
      />
      <Text
        text="Scene center — drag to position"
        x={-84}
        y={labelOffset}
        width={168}
        align="center"
        fontSize={11}
        fill="#e8d5a3"
        listening={false}
      />
    </Group>
  );
}

type FogOverlayProps = {
  fogDataUrl: string | null;
  mapWidth: number;
  mapHeight: number;
  opacity?: number;
  playerOpaque?: boolean;
};

/// <summary>
/// Renders the fog mask over the map so players (and DM preview) only see revealed areas.
/// </summary>
function FogOverlay({
  fogDataUrl,
  mapWidth,
  mapHeight,
  opacity = 1,
  playerOpaque = false,
}: FogOverlayProps) {
  const [fogImage, setFogImage] = useState<HTMLImageElement | null>(null);
  const overlayOpacity = playerOpaque ? 1 : opacity;

  useEffect(() => {
    if (!fogDataUrl) {
      setFogImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setFogImage(img);
    img.src = fogDataUrl;
  }, [fogDataUrl]);

  if (!fogImage) {
    return (
      <Rect
        x={0}
        y={0}
        width={mapWidth}
        height={mapHeight}
        fill="#000000"
        opacity={overlayOpacity}
        listening={false}
      />
    );
  }

  return (
    <Image
      image={fogImage}
      x={0}
      y={0}
      width={mapWidth}
      height={mapHeight}
      opacity={overlayOpacity}
      listening={false}
    />
  );
}

type MapTokenProps = {
  token: Token;
  gridSize: number;
  showHoverOutline: boolean;
};

/// <summary>
/// Renders a map token sized to exactly half of one grid cell.
/// </summary>
function MapToken({ token, gridSize, showHoverOutline }: MapTokenProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const tokenDiameter = tokenDiameterForGridSize(gridSize);
  const tokenRadius = tokenDiameter / 2;
  const labelFontSize = Math.max(10, Math.round(gridSize / 4.5));
  const labelWidth = Math.max(72, gridSize * 1.5);

  useEffect(() => {
    if (!token.imageUrl) {
      setImage(null);
      return;
    }
    let cancelled = false;
    void loadImageForCanvas(token.imageUrl)
      .then((img) => {
        if (!cancelled) {
          setImage(img);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImage(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token.imageUrl]);

  const tokenOutlineColor = "rgba(8, 6, 5, 0.95)";
  const tokenOutlineWidth = Math.max(1, Math.round(labelFontSize * 0.22));
  const ringRadius = tokenRadius - tokenOutlineWidth / 2;
  const labelGap = 2;
  const labelY = tokenRadius + labelGap;
  const tightLabelWidth = Math.min(
    labelWidth,
    Math.ceil(token.label.length * labelFontSize * 0.58) + tokenOutlineWidth * 2 + 4,
  );

  return (
    <>
      {showHoverOutline ? (
        <Circle
          radius={tokenRadius + 3}
          stroke="#ffffff"
          strokeWidth={2}
          listening={false}
        />
      ) : null}
      {image ? (
        <Group
          listening={false}
          clipFunc={(ctx) => {
            ctx.arc(0, 0, tokenRadius, 0, Math.PI * 2);
          }}
        >
          <Image
            image={image}
            x={-tokenRadius}
            y={-tokenRadius}
            width={tokenDiameter}
            height={tokenDiameter}
            listening={false}
          />
          <Circle
            radius={ringRadius}
            stroke={tokenOutlineColor}
            strokeWidth={tokenOutlineWidth}
            listening={false}
          />
        </Group>
      ) : (
        <>
          <Circle radius={tokenRadius} fill={token.color} listening={false} />
          <Circle
            radius={ringRadius}
            stroke={tokenOutlineColor}
            strokeWidth={tokenOutlineWidth}
            listening={false}
          />
        </>
      )}
      <Text
        text={token.label}
        x={-tightLabelWidth / 2}
        y={labelY}
        width={tightLabelWidth}
        fontSize={labelFontSize}
        fill="#f0e6d2"
        stroke={tokenOutlineColor}
        strokeWidth={tokenOutlineWidth}
        fillAfterStrokeEnabled
        align="center"
        ellipsis
        listening={false}
      />
    </>
  );
}

type MapTokenNodeProps = {
  token: Token;
  gridSize: number;
  draggable: boolean;
  onDragEnd: (x: number, y: number) => void;
};

/// <summary>
/// Wraps a map token with drag handling and hover feedback for draggable tokens.
/// </summary>
function MapTokenNode({ token, gridSize, draggable, onDragEnd }: MapTokenNodeProps) {
  const [hovered, setHovered] = useState(false);
  const tokenRadius = tokenDiameterForGridSize(gridSize) / 2;

  const setMapCursor = (event: KonvaEventObject<MouseEvent>, cursor: string) => {
    const stage = event.target.getStage();
    if (stage) {
      stage.container().style.cursor = cursor;
    }
  };

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={draggable}
      onMouseEnter={(event) => {
        if (!draggable) {
          return;
        }
        setHovered(true);
        setMapCursor(event, "grab");
      }}
      onMouseLeave={(event) => {
        setHovered(false);
        if (draggable) {
          setMapCursor(event, "");
        }
      }}
      onDragStart={(event) => {
        if (draggable) {
          setMapCursor(event, "grabbing");
        }
      }}
      onDragEnd={(event) => {
        if (draggable) {
          setMapCursor(event, "grab");
        }
        onDragEnd(event.target.x(), event.target.y());
      }}
    >
      <Circle radius={tokenRadius} fill="rgba(0,0,0,0.001)" />
      <MapToken token={token} gridSize={gridSize} showHoverOutline={hovered && draggable} />
    </Group>
  );
}

type MapAnnotationArrowProps = {
  points: number[];
  opacity: number;
};

/// <summary>
/// Renders a freehand annotation arrow on the map canvas.
/// </summary>
function MapAnnotationArrow({ points, opacity }: MapAnnotationArrowProps) {
  return (
    <>
      <Arrow
        points={points}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        stroke="rgba(8, 6, 5, 0.95)"
        fill="rgba(8, 6, 5, 0.95)"
        strokeWidth={6}
        pointerLength={14}
        pointerWidth={12}
        opacity={opacity}
        dash={[10, 6]}
        listening={false}
      />
      <Arrow
        points={points}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        stroke="#f0e6d2"
        fill="#f0e6d2"
        strokeWidth={3}
        pointerLength={12}
        pointerWidth={10}
        opacity={opacity}
        dash={[10, 6]}
        listening={false}
      />
    </>
  );
}

const FOG_SYNC_MS = 50;
const BRUSH_RADIUS = 48;
const ANNOTATION_COMMIT_GRACE_MS = 500;
const ANNOTATION_MATCH_TOLERANCE = 2;

type SceneGridProps = {
  width: number;
  height: number;
  gridSize: number;
};

/// <summary>
/// Expands grid bounds to cover the visible viewport, snapped to grid cell boundaries.
/// </summary>
function computeVisibleGridBounds(
  viewport: Viewport,
  stageWidth: number,
  stageHeight: number,
  gridSize: number,
) {
  const visibleLeft = -viewport.x / viewport.scale;
  const visibleTop = -viewport.y / viewport.scale;
  const visibleRight = (stageWidth - viewport.x) / viewport.scale;
  const visibleBottom = (stageHeight - viewport.y) / viewport.scale;
  const pad = gridSize * 2;
  const x = Math.floor((visibleLeft - pad) / gridSize) * gridSize;
  const y = Math.floor((visibleTop - pad) / gridSize) * gridSize;
  const right = Math.ceil((visibleRight + pad) / gridSize) * gridSize;
  const bottom = Math.ceil((visibleBottom + pad) / gridSize) * gridSize;
  return { x, y, width: right - x, height: bottom - y };
}

/// <summary>
/// Renders orthogonal grid lines; each line is its own Konva Line so segments are not connected.
/// </summary>
function SceneGrid({ width, height, gridSize }: SceneGridProps) {
  const verticals: number[] = [];
  for (let x = 0; x <= width; x += gridSize) {
    verticals.push(x);
  }

  const horizontals: number[] = [];
  for (let y = 0; y <= height; y += gridSize) {
    horizontals.push(y);
  }

  return (
    <>
      {verticals.map((x) => (
        <Line
          key={`grid-v-${x}`}
          points={[x, 0, x, height]}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1}
          listening={false}
        />
      ))}
      {horizontals.map((y) => (
        <Line
          key={`grid-h-${y}`}
          points={[0, y, width, y]}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1}
          listening={false}
        />
      ))}
    </>
  );
}

/// <summary>
/// Returns true when the pointer event hit a Konva node that is currently draggable (e.g. a token).
/// </summary>
function isOnDraggableNode(event: KonvaEventObject<PointerEvent>) {
  const stage = event.target.getStage();
  let node: Konva.Node | null = event.target;
  while (node) {
    if (node !== stage && "draggable" in node && node.draggable()) {
      return true;
    }
    node = node.getParent();
  }
  return false;
}

/// <summary>
/// Returns true when two annotation polylines share the same endpoints within tolerance.
/// </summary>
function annotationsMatch(a: number[], b: number[], tolerance = ANNOTATION_MATCH_TOLERANCE) {
  if (a.length < 4 || b.length < 4) {
    return false;
  }
  const dxStart = Math.abs(a[0] - b[0]);
  const dyStart = Math.abs(a[1] - b[1]);
  const axEnd = a[a.length - 2];
  const ayEnd = a[a.length - 1];
  const bxEnd = b[b.length - 2];
  const byEnd = b[b.length - 1];
  return (
    dxStart <= tolerance &&
    dyStart <= tolerance &&
    Math.abs(axEnd - bxEnd) <= tolerance &&
    Math.abs(ayEnd - byEnd) <= tolerance
  );
}

/// <summary>
/// Konva canvas for the shared battle map; DM drives shared scene state, players view locally.
/// </summary>
export function MapCanvas({
  state,
  sceneId,
  isDm,
  playerSlotId,
  dm,
  fogMode,
  fogPreview,
  fogBrushMode,
  sceneEditMode,
  viewCommand,
  onSettingsViewportChange,
  onMoveToken,
  onAddAnnotation,
  annotationColor = "#fcd34d",
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [localViewport, setLocalViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [localFogDataUrl, setLocalFogDataUrl] = useState<string | null>(null);
  const [fogReady, setFogReady] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [draftAnnotation, setDraftAnnotation] = useState<number[] | null>(null);
  const [fadeClock, setFadeClock] = useState(() => Date.now());
  const isPanning = useRef(false);
  const isPaintingFog = useRef(false);
  const isDrawingAnnotation = useRef(false);
  const annotationPoints = useRef<number[]>([]);
  const lastPointer = useRef({ x: 0, y: 0 });
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fogInitKeyRef = useRef("");
  const fogSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsViewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFogSceneIdRef = useRef<string | null>(null);
  const sceneNavRef = useRef<string | null>(null);
  const pendingAnnotationCommitRef = useRef(false);
  const annotationCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<Viewport>(localViewport);
  viewportRef.current = localViewport;
  const roomId = state.roomId;
  const viewerId = isDm ? "dm" : (playerSlotId ?? "player");
  const viewportMode: SessionViewportMode = sceneEditMode ? "edit" : "play";

  const persistSessionViewport = useCallback(
    (next: Viewport, scene = sceneId, mode: SessionViewportMode = viewportMode) => {
      saveSessionViewport(roomId, viewerId, scene, mode, next);
    },
    [roomId, sceneId, viewerId, viewportMode],
  );

  const rawScene = state.scenes.find((scene) => scene.id === sceneId);
  const activeScene = rawScene ? normalizeScene(rawScene) : undefined;
  const sceneTokens = state.tokens.filter((token) => token.sceneId === sceneId);
  const mapWidth = activeScene?.width ?? 800;
  const mapHeight = activeScene?.height ?? 600;
  const sceneBackground = activeScene?.backgroundColor ?? DEFAULT_SCENE_BACKGROUND;
  const viewport = localViewport;
  const showFog = Boolean(
    activeScene?.fogEnabled && (!isDm || (fogPreview && !sceneEditMode)),
  );
  const dmFogPreviewOpacity = 0.5;
  const fogOverlayOpacity = isDm && fogPreview && !sceneEditMode ? dmFogPreviewOpacity : 1;
  const playerShowFog = Boolean(activeScene?.fogEnabled);
  const fogActiveForView = isDm ? showFog : playerShowFog;
  const canvasBackground = fogActiveForView ? "#000000" : sceneBackground;
  const fogDataUrl = isDm ? (localFogDataUrl ?? activeScene?.fogDataUrl ?? null) : (activeScene?.fogDataUrl ?? null);
  const canPan = isDm || !isDm;
  const canZoom = isDm || !isDm;
  const playerSlot =
    !isDm && playerSlotId
      ? state.playerSlots.find((slot) => slot.id === playerSlotId)
      : undefined;
  const sceneHidden =
    !isDm && playerSlot && !canPlayerSeeScene(playerSlot, sceneId);

  const sceneAnnotations = useMemo(
    () =>
      (state.annotations ?? []).filter(
        (annotation) =>
          annotation.sceneId === sceneId && annotationOpacity(annotation.createdAt, fadeClock) > 0,
      ),
    [fadeClock, sceneId, state.annotations],
  );

  const canAnnotate = Boolean(onAddAnnotation) && !sceneEditMode && !(isDm && fogMode);
  const localAnnotationOwnerId = isDm ? "dm" : (playerSlotId ?? null);

  useEffect(() => {
    if (sceneAnnotations.length === 0 && !draftAnnotation) {
      return;
    }
    const timer = setInterval(() => setFadeClock(Date.now()), 50);
    return () => clearInterval(timer);
  }, [draftAnnotation, sceneAnnotations.length]);

  const gridBounds = useMemo(() => {
    const gridSize = activeScene?.gridSize ?? 50;
    if (gridSize <= 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    return computeVisibleGridBounds(viewport, size.width, size.height, gridSize);
  }, [activeScene?.gridSize, viewport, size.width, size.height]);

  const markerArmLength = activeScene?.gridSize ?? 50;
  const sceneCenterX = activeScene?.centerX ?? mapWidth / 2;
  const sceneCenterY = activeScene?.centerY ?? mapHeight / 2;


  useEffect(() => {
    setSelectedLayerId(null);
  }, [sceneId]);

  useEffect(() => {
    return () => {
      persistSessionViewport(viewportRef.current);
    };
  }, [persistSessionViewport, sceneId, viewportMode]);

  useEffect(() => {
    if (!activeScene || size.width <= 0 || size.height <= 0) {
      return;
    }

    const navKey = `${viewportMode}:${sceneId}:${size.width}x${size.height}`;
    const sceneChanged = !sceneNavRef.current?.startsWith(`${viewportMode}:${sceneId}:`);
    const sizeReady = sceneNavRef.current === null;
    const modeChanged =
      sceneNavRef.current !== null && !sceneNavRef.current.startsWith(`${viewportMode}:`);

    if (!sceneChanged && !sizeReady && !modeChanged) {
      return;
    }

    sceneNavRef.current = navKey;

    const normalizedViewport = viewportForNormalizedScene(
      activeScene,
      size.width,
      size.height,
    );
    const savedSessionViewport = getSessionViewport(
      roomId,
      viewerId,
      sceneId,
      viewportMode,
    );
    const savedEditViewport =
      viewportMode === "edit" && !isDefaultViewport(activeScene.defaultViewport)
        ? activeScene.defaultViewport
        : null;

    let next =
      savedSessionViewport ??
      (viewportMode === "edit" ? savedEditViewport : null) ??
      normalizedViewport;
    if (!isDm && !sceneEditMode) {
      next = clampPlayerViewport(next, activeScene, size.width, size.height);
    }
    viewportRef.current = next;
    setLocalViewport(next);

    if (sceneEditMode) {
      onSettingsViewportChange?.(next);
    } else if (isDm && !savedSessionViewport) {
      dm.updateViewport(next);
    }
  }, [
    activeScene,
    dm,
    isDm,
    onSettingsViewportChange,
    roomId,
    sceneEditMode,
    sceneId,
    size.height,
    size.width,
    viewerId,
    viewportMode,
  ]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeScene || mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    const initKey = `${activeScene.id}:${mapWidth}x${mapHeight}`;

    if (fogInitKeyRef.current !== initKey) {
      fogInitKeyRef.current = initKey;
      setFogReady(false);

      const canvas = document.createElement("canvas");
      fogCanvasRef.current = canvas;

      void loadFogCanvas(canvas, mapWidth, mapHeight, activeScene.fogDataUrl).then(() => {
        if (fogInitKeyRef.current !== initKey) {
          return;
        }
        setLocalFogDataUrl(fogCanvasToDataUrl(canvas));
        setFogReady(true);
      });
      return;
    }

    if (activeScene.fogDataUrl === null && fogCanvasRef.current) {
      fillFog(fogCanvasRef.current);
      setLocalFogDataUrl(fogCanvasToDataUrl(fogCanvasRef.current));
    }
  }, [activeScene?.id, activeScene?.fogDataUrl, mapWidth, mapHeight]);

  useEffect(() => {
    return () => {
      if (fogSyncTimerRef.current) {
        clearTimeout(fogSyncTimerRef.current);
      }
      if (settingsViewportTimerRef.current) {
        clearTimeout(settingsViewportTimerRef.current);
      }
      if (annotationCommitTimerRef.current) {
        clearTimeout(annotationCommitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !pendingAnnotationCommitRef.current ||
      !draftAnnotation ||
      !localAnnotationOwnerId
    ) {
      return;
    }
    const committed = sceneAnnotations.some(
      (annotation) =>
        annotation.playerId === localAnnotationOwnerId &&
        annotation.sceneId === sceneId &&
        annotationsMatch(annotation.points, draftAnnotation),
    );
    if (!committed) {
      return;
    }
    pendingAnnotationCommitRef.current = false;
    if (annotationCommitTimerRef.current) {
      clearTimeout(annotationCommitTimerRef.current);
      annotationCommitTimerRef.current = null;
    }
    setDraftAnnotation(null);
  }, [draftAnnotation, localAnnotationOwnerId, sceneAnnotations, sceneId]);

  const saveSettingsViewport = useCallback(
    (next: Viewport) => {
      if (!activeScene) {
        return;
      }
      onSettingsViewportChange?.(next);
      if (settingsViewportTimerRef.current) {
        clearTimeout(settingsViewportTimerRef.current);
      }
      settingsViewportTimerRef.current = setTimeout(() => {
        settingsViewportTimerRef.current = null;
        dm.updateScene({ ...activeScene, defaultViewport: next });
      }, 150);
    },
    [activeScene, dm, onSettingsViewportChange],
  );

  useEffect(() => {
    if (!viewCommand || !sceneEditMode || !activeScene) {
      return;
    }
    const next =
      viewCommand.type === "reset"
        ? { ...DEFAULT_VIEWPORT }
        : fitViewportToScene(activeScene, size.width, size.height);
    viewportRef.current = next;
    setLocalViewport(next);
    persistSessionViewport(next);
    saveSettingsViewport(next);
  }, [viewCommand?.id]);

  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - viewport.x) / viewport.scale,
        y: (screenY - viewport.y) / viewport.scale,
      };
    },
    [viewport],
  );

  const setViewport = useCallback(
    (next: Viewport) => {
      let resolved = next;
      if (!isDm && !sceneEditMode && activeScene) {
        resolved = clampPlayerViewport(resolved, activeScene, size.width, size.height);
      }
      viewportRef.current = resolved;
      setLocalViewport(resolved);
      persistSessionViewport(resolved);
      if (isDm && sceneEditMode) {
        saveSettingsViewport(resolved);
        return;
      }
      if (isDm) {
        dm.updateViewport(resolved);
      }
    },
    [
      activeScene,
      dm,
      isDm,
      persistSessionViewport,
      saveSettingsViewport,
      sceneEditMode,
      size.height,
      size.width,
    ],
  );

  const scheduleFogSync = useCallback(
    (sceneId: string) => {
      pendingFogSceneIdRef.current = sceneId;
      if (fogSyncTimerRef.current) {
        return;
      }
      fogSyncTimerRef.current = setTimeout(() => {
        fogSyncTimerRef.current = null;
        const canvas = fogCanvasRef.current;
        const syncSceneId = pendingFogSceneIdRef.current;
        if (!canvas || !syncSceneId) {
          return;
        }
        dm.updateFog(syncSceneId, fogCanvasToDataUrl(canvas));
      }, FOG_SYNC_MS);
    },
    [dm],
  );

  const applyFogBrush = useCallback(
    (screenX: number, screenY: number) => {
      if (!activeScene || !fogCanvasRef.current || !fogReady) {
        return;
      }
      const world = screenToWorld(screenX, screenY);
      const radius = BRUSH_RADIUS / viewport.scale;
      paintFogBrush(fogCanvasRef.current, world.x, world.y, radius, fogBrushMode);
      const dataUrl = fogCanvasToDataUrl(fogCanvasRef.current);
      setLocalFogDataUrl(dataUrl);
      scheduleFogSync(activeScene.id);
    },
    [activeScene, fogBrushMode, fogReady, scheduleFogSync, screenToWorld, viewport.scale],
  );

  const handleLayerDragEnd = useCallback(
    (layerId: string, x: number, y: number) => {
      if (!activeScene) {
        return;
      }
      dm.updateScene(moveMapLayer(activeScene, layerId, x, y));
    },
    [activeScene, dm],
  );

  const handleSceneCenterDragEnd = useCallback(
    (centerX: number, centerY: number) => {
      if (!activeScene) {
        return;
      }
      dm.updateScene(moveSceneCenter(activeScene, Math.round(centerX), Math.round(centerY)));
    },
    [activeScene, dm],
  );

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    if (!canZoom) {
      return;
    }
    event.evt.preventDefault();
    const stage = event.target.getStage();
    if (!stage) {
      return;
    }
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    const scaleBy = 1.08;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const nextScale = Math.min(4, Math.max(0.2, viewport.scale * (direction > 0 ? scaleBy : 1 / scaleBy)));
    const mousePointTo = {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };
    setViewport({
      scale: nextScale,
      x: pointer.x - mousePointTo.x * nextScale,
      y: pointer.y - mousePointTo.y * nextScale,
    });
  };

  const handlePointerDown = (event: KonvaEventObject<PointerEvent>) => {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }

    if (event.evt.button === 1) {
      event.evt.preventDefault();
      isPanning.current = true;
      lastPointer.current = pointer;
      return;
    }

    if (isDm && sceneEditMode && event.evt.button === 0) {
      if (!isOnDraggableNode(event)) {
        isPanning.current = true;
        lastPointer.current = pointer;
      }
      return;
    }

    if (isDm && fogMode && activeScene?.fogEnabled && event.evt.button === 0) {
      isPaintingFog.current = true;
      applyFogBrush(pointer.x, pointer.y);
      return;
    }

    if (
      canAnnotate &&
      event.evt.button === 0 &&
      event.evt.shiftKey &&
      !isOnDraggableNode(event)
    ) {
      event.evt.preventDefault();
      const world = screenToWorld(pointer.x, pointer.y);
      isDrawingAnnotation.current = true;
      pendingAnnotationCommitRef.current = false;
      if (annotationCommitTimerRef.current) {
        clearTimeout(annotationCommitTimerRef.current);
        annotationCommitTimerRef.current = null;
      }
      annotationPoints.current = [world.x, world.y];
      setDraftAnnotation([world.x, world.y]);
      return;
    }

    if (canPan && event.evt.button === 0 && !isOnDraggableNode(event)) {
      isPanning.current = true;
      lastPointer.current = pointer;
      return;
    }

    if (isDm && event.evt.button === 2) {
      const world = screenToWorld(pointer.x, pointer.y);
      dm.setPing(world.x, world.y);
    }
  };

  const handlePointerMove = (event: KonvaEventObject<PointerEvent>) => {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }

    if (isDrawingAnnotation.current && (event.evt.buttons & 1) !== 0) {
      const world = screenToWorld(pointer.x, pointer.y);
      const next = appendAnnotationSample(annotationPoints.current, world.x, world.y);
      if (next.length !== annotationPoints.current.length) {
        annotationPoints.current = trimAnnotationPoints(next);
        setDraftAnnotation(annotationPoints.current);
      }
      return;
    }

    if (isPanning.current) {
      const dx = pointer.x - lastPointer.current.x;
      const dy = pointer.y - lastPointer.current.y;
      lastPointer.current = pointer;
      const current = viewportRef.current;
      setViewport({
        ...current,
        x: current.x + dx,
        y: current.y + dy,
      });
      return;
    }

    if (isDm && fogMode && activeScene?.fogEnabled && !sceneEditMode && isPaintingFog.current && (event.evt.buttons & 1) !== 0) {
      applyFogBrush(pointer.x, pointer.y);
    }
  };

  const handlePointerUp = (event?: KonvaEventObject<PointerEvent>) => {
    if (isDrawingAnnotation.current) {
      const stage = event?.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (pointer && activeScene && onAddAnnotation) {
        const world = screenToWorld(pointer.x, pointer.y);
        const points = trimAnnotationPoints(
          appendAnnotationSample(annotationPoints.current, world.x, world.y),
        );
        if (annotationPathLength(points) >= ANNOTATION_MIN_LENGTH) {
          onAddAnnotation(activeScene.id, points, annotationColor);
          pendingAnnotationCommitRef.current = true;
          if (annotationCommitTimerRef.current) {
            clearTimeout(annotationCommitTimerRef.current);
          }
          annotationCommitTimerRef.current = setTimeout(() => {
            pendingAnnotationCommitRef.current = false;
            setDraftAnnotation(null);
            annotationCommitTimerRef.current = null;
          }, ANNOTATION_COMMIT_GRACE_MS);
        } else {
          setDraftAnnotation(null);
        }
      } else {
        setDraftAnnotation(null);
      }
      isDrawingAnnotation.current = false;
      annotationPoints.current = [];
    }

    if (isPaintingFog.current && activeScene && fogCanvasRef.current) {
      dm.updateFog(activeScene.id, fogCanvasToDataUrl(fogCanvasRef.current));
    }
    isPanning.current = false;
    isPaintingFog.current = false;
  };

  const ping = state.ping && state.ping.sceneId === sceneId ? state.ping : null;

  const fogBadgeText =
    fogBrushMode === "reveal"
      ? "Reveal brush — paint to clear fog for players"
      : "Hide brush — paint to add fog back";

  return (
    <div
      ref={containerRef}
      className={`map-canvas ${isDm ? "dm" : "player"} ${fogMode ? "fog-mode" : ""} ${sceneEditMode ? "scene-edit" : ""}`}
      style={{ backgroundColor: canvasBackground }}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => {
        if (event.button === 1) {
          event.preventDefault();
        }
      }}
    >
      {sceneHidden ? (
        <div className="scene-hidden-overlay">
          <p>The DM has not shared this scene with you.</p>
        </div>
      ) : (
      <Stage
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={(event) => {
          if (isDm && sceneEditMode && event.target === event.target.getStage()) {
            setSelectedLayerId(null);
          }
        }}
      >
        <Layer>
          <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
            {isDm && sceneEditMode ? (
              <Rect
                x={0}
                y={0}
                width={mapWidth}
                height={mapHeight}
                fill={sceneBackground}
                listening={false}
              />
            ) : null}
            {activeScene?.layers.map((layer) => (
              <Group
                key={layer.id}
                onClick={(event) => {
                  if (isDm && sceneEditMode) {
                    event.cancelBubble = true;
                    setSelectedLayerId(layer.id);
                  }
                }}
              >
                <MapLayerImage
                  layer={layer}
                  selected={sceneEditMode && selectedLayerId === layer.id}
                  draggable={isDm && sceneEditMode && selectedLayerId === layer.id}
                  onDragEnd={handleLayerDragEnd}
                />
              </Group>
            ))}
            {isDm && sceneEditMode ? <SceneOriginMarker armLength={markerArmLength} /> : null}
            {isDm && sceneEditMode ? (
              <SceneCenterHandle
                centerX={sceneCenterX}
                centerY={sceneCenterY}
                armLength={markerArmLength}
                onDragEnd={handleSceneCenterDragEnd}
              />
            ) : null}
            {activeScene?.showGrid && activeScene.gridSize > 0 ? (
              <Group x={gridBounds.x} y={gridBounds.y}>
                <SceneGrid
                  width={gridBounds.width}
                  height={gridBounds.height}
                  gridSize={activeScene.gridSize}
                />
              </Group>
            ) : null}
            {(isDm ? showFog : playerShowFog) && activeScene ? (
              <FogOverlay
                fogDataUrl={fogDataUrl}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                opacity={fogOverlayOpacity}
                playerOpaque={!isDm}
              />
            ) : null}
            {sceneTokens.map((token) => {
              const isOwnToken = !isDm && token.ownerPlayerId === playerSlotId;
              const canDragToken =
                (isDm && !fogMode && !sceneEditMode) || (isOwnToken && !sceneEditMode);

              return (
                <MapTokenNode
                  key={token.id}
                  token={token}
                  gridSize={activeScene?.gridSize ?? 50}
                  draggable={canDragToken}
                  onDragEnd={(x, y) => {
                    if (isDm) {
                      dm.moveToken(token.id, x, y);
                      return;
                    }
                    onMoveToken?.(token.id, x, y);
                  }}
                />
              );
            })}
            {ping ? (
              <Circle
                x={ping.x}
                y={ping.y}
                radius={18}
                stroke="#ffeb3b"
                strokeWidth={3}
                fill="rgba(255,235,59,0.25)"
                listening={false}
              />
            ) : null}
            {sceneAnnotations.map((annotation) => (
              <MapAnnotationArrow
                key={annotation.id}
                points={annotation.points}
                opacity={annotationOpacity(annotation.createdAt, fadeClock)}
              />
            ))}
            {draftAnnotation && draftAnnotation.length >= 4 ? (
              <MapAnnotationArrow
                points={draftAnnotation}
                opacity={0.85}
              />
            ) : null}
            {isDm && sceneEditMode ? (
              <Rect
                x={0}
                y={0}
                width={mapWidth}
                height={mapHeight}
                stroke="rgba(107,138,253,0.5)"
                strokeWidth={2}
                dash={[12, 6]}
                listening={false}
              />
            ) : null}
          </Group>
        </Layer>
      </Stage>
      )}
      {!sceneHidden && !sceneEditMode && activeScene && activeScene.gridSize > 0 ? (
        <div className="map-scale-overlay" aria-label="Map scale">
          <div
            className="map-scale-bar"
            style={{ width: Math.max(24, activeScene.gridSize * viewport.scale) }}
          />
          <span className="map-scale-caption">1 yard</span>
        </div>
      ) : null}
      {!isDm && !sceneHidden ? (
        <div className="player-badge">
          Drag to pan · scroll to zoom · drag your token · Shift+drag to annotate
        </div>
      ) : null}
      {isDm && canAnnotate ? (
        <div className="player-badge">Shift+drag to annotate · right-click to ping</div>
      ) : null}
      {isDm && fogPreview && !sceneEditMode && activeScene?.fogEnabled ? (
        <div className="fog-badge">Fog preview on — semi-transparent for you; players see full fog</div>
      ) : null}
      {isDm && !fogPreview && !sceneEditMode && activeScene?.fogEnabled ? (
        <div className="fog-badge xray-badge">X-ray on — fog hidden for you only</div>
      ) : null}
      {isDm && sceneEditMode ? (
        <div className="fog-badge scene-edit-badge">
          Settings — click an image to select it, then drag to move; drag elsewhere to pan
        </div>
      ) : null}
      {isDm && fogMode && !sceneEditMode && activeScene?.fogEnabled ? (
        <div className="fog-badge fog-brush-badge">
          {fogBadgeText} · middle mouse to pan
        </div>
      ) : null}
    </div>
  );
}
