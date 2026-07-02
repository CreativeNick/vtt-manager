import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import { CONDITIONS, type GameState, type HitPoints, type Viewport } from "../lib/types";
import {
  clampViewportScale,
  loadImageForCanvas,
  tokenRadiusForGridSize,
} from "../lib/sceneUtils";

const CURRENT_TURN_COLOR = "#e9c176";

const CONDITION_EMOJI = new Map<string, string>(
  CONDITIONS.map((condition) => [condition.id, condition.emoji]),
);

function hpBarColor(ratio: number): string {
  if (ratio > 0.5) return "#7bc488";
  if (ratio > 0.25) return "#e5a34a";
  return "#e5686b";
}

type MapCanvasProps = {
  state: GameState;
  sceneId: string;
  isDm: boolean;
  yourPlayerId: string | null;
  viewport: Viewport;
  /** Provided for the DM (pan/zoom enabled); omitted for players (read-only mirror). */
  onViewportChange?: (viewport: Viewport) => void;
  onMoveToken: (tokenId: string, x: number, y: number) => void;
  onSelectToken?: (tokenId: string | null) => void;
  selectedTokenId?: string | null;
  /** When set, the next map click places a token at the returned world coords. */
  onPlaceToken?: (x: number, y: number) => void;
};

/// <summary>
/// Loads an image URL into an HTMLImageElement for Konva, or null while loading.
/// </summary>
function useImage(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    let active = true;
    loadImageForCanvas(url)
      .then((loaded) => {
        if (active) setImg(loaded);
      })
      .catch(() => {
        if (active) setImg(null);
      });
    return () => {
      active = false;
    };
  }, [url]);
  return img;
}

/// <summary>
/// Tracks the browser window size so the Konva stage fills the viewport.
/// </summary>
function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/// <summary>
/// A single token: colored circle with optional portrait image, label, and
/// combat state — current-turn ring, HP bar (from the linked sheet), condition
/// badges, and a desaturated skull overlay at 0 HP.
/// </summary>
function TokenNode({
  token,
  radius,
  draggable,
  selected,
  isCurrentTurn,
  hp,
  showHpValues,
  onSelect,
  onMove,
}: {
  token: GameState["tokens"][number];
  radius: number;
  draggable: boolean;
  selected: boolean;
  isCurrentTurn: boolean;
  /** HP to display under the token, or null to show no bar. */
  hp: HitPoints | null;
  showHpValues: boolean;
  onSelect?: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const img = useImage(token.imageUrl);
  const dead = hp !== null && hp.max > 0 && hp.current <= 0;
  const showBar = hp !== null && hp.max > 0;
  const ratio = showBar ? Math.min(Math.max(hp.current / hp.max, 0), 1) : 0;
  const badges = token.conditions
    .map((id) => CONDITION_EMOJI.get(id))
    .filter(Boolean) as string[];
  const badgeText =
    badges.length > 4 ? `${badges.slice(0, 4).join("")}+${badges.length - 4}` : badges.join("");
  const labelY = radius + (showBar ? 9 : 2);

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={draggable}
      opacity={dead ? 0.55 : 1}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onMove(e.target.x(), e.target.y())}
    >
      {isCurrentTurn ? (
        <Circle radius={radius + 4} stroke={CURRENT_TURN_COLOR} strokeWidth={2.5} listening={false} />
      ) : null}
      {img ? (
        <Circle
          radius={radius}
          fillPatternImage={img}
          fillPatternScale={{ x: (radius * 2) / img.width, y: (radius * 2) / img.height }}
          fillPatternOffset={{ x: img.width / 2, y: img.height / 2 }}
          stroke={selected ? "#4a9eff" : token.color}
          strokeWidth={selected ? 3 : 2}
        />
      ) : (
        <Circle
          radius={radius}
          fill={token.color}
          stroke={selected ? "#4a9eff" : "#00000066"}
          strokeWidth={selected ? 3 : 2}
        />
      )}
      {dead ? (
        <Text
          text="💀"
          fontSize={radius * 1.1}
          align="center"
          width={radius * 4}
          offsetX={radius * 2}
          y={-radius * 0.55}
          listening={false}
        />
      ) : null}
      {badgeText ? (
        <Text
          text={badgeText}
          fontSize={Math.max(9, radius * 0.55)}
          align="center"
          width={radius * 6}
          offsetX={radius * 3}
          y={-radius - Math.max(12, radius * 0.7)}
          listening={false}
        />
      ) : null}
      {showBar ? (
        <>
          <Rect
            x={-radius}
            y={radius + 3}
            width={radius * 2}
            height={4}
            cornerRadius={2}
            fill="rgba(0,0,0,0.6)"
            listening={false}
          />
          <Rect
            x={-radius}
            y={radius + 3}
            width={radius * 2 * ratio}
            height={4}
            cornerRadius={2}
            fill={hpBarColor(ratio)}
            listening={false}
          />
          {showHpValues ? (
            <Text
              text={`${hp.current}/${hp.max}`}
              fontSize={Math.max(8, radius * 0.45)}
              fill="#e6e6e8"
              align="center"
              width={radius * 4}
              offsetX={radius * 2}
              y={radius + 8}
              listening={false}
            />
          ) : null}
        </>
      ) : null}
      <Text
        text={token.label}
        fontSize={Math.max(10, radius * 0.7)}
        fill="#e6e6e8"
        align="center"
        width={radius * 4}
        offsetX={radius * 2}
        y={labelY + (showHpValues && showBar ? Math.max(8, radius * 0.45) + 1 : 0)}
        listening={false}
      />
    </Group>
  );
}

/// <summary>
/// Full-bleed tactical map: single background image, grid, and tokens. The DM pans/zooms
/// (broadcast to players); players render the shared viewport read-only but can drag their
/// own token.
/// </summary>
export function MapCanvas({
  state,
  sceneId,
  isDm,
  yourPlayerId,
  viewport,
  onViewportChange,
  onMoveToken,
  onSelectToken,
  selectedTokenId,
  onPlaceToken,
}: MapCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const { width: stageW, height: stageH } = useWindowSize();
  const scene = state.scenes.find((item) => item.id === sceneId) ?? state.scenes[0];
  const mapImg = useImage(scene?.mapUrl ?? null);

  const canControlView = Boolean(onViewportChange);
  const placing = Boolean(onPlaceToken);
  const radius = tokenRadiusForGridSize(scene?.gridSize ?? 50);

  const gridLines = useMemo(() => {
    const lines: number[][] = [];
    if (!scene || !scene.showGrid || scene.gridSize <= 0) {
      return lines;
    }
    const { width, height, gridSize } = scene;
    if (width / gridSize + height / gridSize > 600) {
      return lines; // guard against pathological grid counts
    }
    for (let x = 0; x <= width; x += gridSize) {
      lines.push([x, 0, x, height]);
    }
    for (let y = 0; y <= height; y += gridSize) {
      lines.push([0, y, width, y]);
    }
    return lines;
  }, [scene]);

  if (!scene) {
    return <div className="map-root" />;
  }

  const sceneTokens = state.tokens.filter((token) => token.sceneId === scene.id);
  const currentTurnTokenId =
    state.combat?.entries[state.combat.turnIndex]?.tokenId ?? null;

  const emitViewportFromStage = () => {
    const stage = stageRef.current;
    if (!stage || !onViewportChange) return;
    onViewportChange({ x: stage.x(), y: stage.y(), scale: stage.scaleX() });
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    if (!canControlView || !onViewportChange) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const oldScale = viewport.scale;
    const worldX = (pointer.x - viewport.x) / oldScale;
    const worldY = (pointer.y - viewport.y) / oldScale;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = clampViewportScale(oldScale * (direction > 0 ? 1.1 : 1 / 1.1));
    onViewportChange({
      scale: newScale,
      x: pointer.x - worldX * newScale,
      y: pointer.y - worldY * newScale,
    });
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (placing) {
      const point = stageRef.current?.getRelativePointerPosition();
      if (point && onPlaceToken) {
        onPlaceToken(point.x, point.y);
      }
      return;
    }
    if (e.target === e.target.getStage()) {
      onSelectToken?.(null);
    }
  };

  const stageDraggable = canControlView && !placing;

  return (
    <div className="map-root">
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={stageDraggable}
        onDragMove={emitViewportFromStage}
        onDragEnd={emitViewportFromStage}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={scene.width} height={scene.height} fill={scene.backgroundColor} />
          {mapImg ? (
            <KonvaImage image={mapImg} x={0} y={0} width={scene.width} height={scene.height} />
          ) : null}
          {gridLines.map((points, index) => (
            <Line key={index} points={points} stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
          ))}
        </Layer>
        <Layer>
          {sceneTokens.map((token) => {
            const draggable = isDm || token.ownerPlayerId === yourPlayerId;
            const sheetHp = token.sheetId ? state.sheets[token.sheetId]?.data.hp : undefined;
            // DM always sees bars; players only when the DM turned the display on.
            // (Redaction keeps hp available for showHp tokens even on hidden sheets.)
            const hp = sheetHp && (isDm || token.showHp !== "none") ? sheetHp : null;
            return (
              <TokenNode
                key={token.id}
                token={token}
                radius={radius}
                draggable={draggable}
                selected={selectedTokenId === token.id}
                isCurrentTurn={currentTurnTokenId === token.id}
                hp={hp}
                showHpValues={token.showHp === "values"}
                onSelect={() => onSelectToken?.(token.id)}
                onMove={(x, y) => onMoveToken(token.id, x, y)}
              />
            );
          })}
        </Layer>
      </Stage>
      {!scene.mapUrl ? <div className="map-empty">No map image for “{scene.name}”</div> : null}
    </div>
  );
}
