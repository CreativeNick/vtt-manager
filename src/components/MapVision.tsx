import { memo, useEffect, useMemo, useState } from "react";
import { Circle, Group, Label, Layer, Line, Rect, Tag, Text, Wedge } from "react-konva";
import type Konva from "konva";
import type { Light, Scene, Token } from "../lib/types";
import { computeVisibility, wallsToSegments, type Point } from "../lib/visibility";

/// <summary>
/// Phase 6 dynamic vision + Phase 6.6 lighting revamp. Two Konva layers:
/// - `VisionMaskLayer` — a darkness sheet above the tokens, erased (destination-out)
///   inside each viewer token's line-of-sight polygon where its darkvision or a light
///   reaches. Sitting above tokens, it also hides tokens standing in the dark.
/// - `WallsLightsEditor` — the DM's wall/door lines and light markers, interactive only
///   while the matching tool is active.
///
/// Phase 6.6: light reveals are radial GRADIENTS (smooth bright→dim→dark falloff) instead
/// of hard circles, honour a light's color/emission-angle/animation, and the scene has a
/// continuous 0..1 darkness level (day↔night) rather than a binary on/off.
/// </summary>

/** Builds a Konva clip path from a visibility polygon (world coords). */
function polygonClip(poly: Point[]): (ctx: Konva.Context) => void {
  return (ctx) => {
    ctx.beginPath();
    if (poly.length > 0) {
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i += 1) {
        ctx.lineTo(poly[i].x, poly[i].y);
      }
    }
    ctx.closePath();
  };
}

// ---------------------------------------------------------------------------
// Phase 6.6 lighting helpers (pure — no per-frame allocation beyond small arrays)
// ---------------------------------------------------------------------------

/** Parses #rgb / #rrggbb (falls back to null so an unparseable color just skips its tint). */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Radial-gradient prop bundle shared by the erase and tint passes (Circle & Wedge). */
function radialFill(radiusPx: number, stops: Array<number | string>) {
  return {
    fillRadialGradientStartPoint: { x: 0, y: 0 },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndPoint: { x: 0, y: 0 },
    fillRadialGradientEndRadius: radiusPx,
    fillRadialGradientColorStops: stops,
  };
}

/**
 * Erase stops for a `destination-out` reveal. Source alpha = how much darkness is removed:
 * 1 (fully lit) through the bright core, then — with gradual illumination — a smooth ramp to
 * 0 (dark) at the dim edge. `peak` (≤1) lets an animation dim the whole light.
 */
function eraseStops(brightFrac: number, gradual: boolean, peak: number) {
  const a = clamp01(peak);
  const solid = `rgba(0,0,0,${a})`;
  const bf = Math.min(Math.max(brightFrac, 0), 0.98);
  return gradual
    ? [0, solid, bf, solid, 1, "rgba(0,0,0,0)"]
    : [0, solid, 0.985, solid, 1, "rgba(0,0,0,0)"];
}

/** Additive color stops for the tint pass (same falloff shape as the erase). */
function tintStops(
  rgb: { r: number; g: number; b: number },
  brightFrac: number,
  gradual: boolean,
  strength: number,
) {
  const a = clamp01(strength);
  const solid = `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  const clear = `rgba(${rgb.r},${rgb.g},${rgb.b},0)`;
  const bf = Math.min(Math.max(brightFrac, 0), 0.98);
  return gradual ? [0, solid, bf, solid, 1, clear] : [0, solid, 0.985, solid, 1, clear];
}

/** Per-frame radius/brightness modulation for a light's animation (cheap trig, no sweep). */
function animModulation(light: Light, time: number): { radiusMul: number; peak: number } {
  const a = light.animation;
  if (!a || a.type === "none" || time === 0) return { radiusMul: 1, peak: 1 };
  const speed = a.speed ?? 1;
  const intensity = a.intensity ?? 0.5;
  const t = time * speed;
  if (a.type === "pulse") {
    // Slow breathe: radius & brightness swell together.
    const s = Math.sin(t * 2) * 0.5 + 0.5; // 0..1
    return { radiusMul: 1 - 0.3 * intensity * (1 - s), peak: 1 - 0.4 * intensity * (1 - s) };
  }
  // Flicker (torch/candle): summed incommensurate sines → pseudo-random jitter in ~[-1,1].
  const f = Math.sin(t * 11) * 0.5 + Math.sin(t * 17.3) * 0.3 + Math.sin(t * 29.7) * 0.2;
  return {
    radiusMul: 1 + 0.1 * intensity * f,
    peak: Math.min(1, 1 - 0.3 * intensity * (0.5 - 0.5 * f)),
  };
}

/** True if any enabled light on the scene wants to animate. */
function sceneHasAnimatedLight(scene: Scene): boolean {
  return scene.lights.some(
    (l) => l.enabled && l.animation && l.animation.type !== "none" && (l.animation.speed ?? 1) > 0,
  );
}

/**
 * A wall-clock time (seconds) that ticks ~30fps ONLY while `active`, and never while the OS
 * asks to reduce motion — idle/animation-free scenes schedule no frames at all.
 */
function useAnimationClock(active: boolean): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let raf = 0;
    let last = performance.now();
    const frame = 1000 / 30;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - last >= frame) {
        last = now;
        setTime(now / 1000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return time;
}

/**
 * The reveal shape(s) for one light: a `destination-out` gradient (bright→dim→dark falloff),
 * plus — when the light has a color — an additive tint gradient of the same shape. Renders a
 * `Wedge` for directed lights (emission angle < 360) and a `Circle` otherwise.
 */
function LightReveal({ light, ftToPx, time }: { light: Light; ftToPx: number; time: number }) {
  const { radiusMul, peak } = animModulation(light, time);
  const dimPx = Math.max(0, light.dimR * ftToPx * radiusMul);
  if (dimPx <= 0) return null;
  const brightFrac = light.dimR > 0 ? Math.min(light.brightR / light.dimR, 1) : 1;
  const gradual = light.gradual !== false;
  const angle = light.angle ?? 360;
  const rgb = light.color ? hexToRgb(light.color) : null;
  const tintStrength = (light.colorIntensity ?? 0.5) * peak;

  // A Wedge for directed lights, a Circle for full-circle ones — same gradient either way.
  const renderShape = (op: "destination-out" | "lighter", stops: Array<number | string>) => {
    const fill = radialFill(dimPx, stops);
    return angle < 360 ? (
      <Wedge
        x={light.x}
        y={light.y}
        radius={dimPx}
        angle={angle}
        rotation={(light.rotation ?? 0) - angle / 2}
        globalCompositeOperation={op}
        {...fill}
      />
    ) : (
      <Circle x={light.x} y={light.y} radius={dimPx} globalCompositeOperation={op} {...fill} />
    );
  };

  return (
    <>
      {renderShape("destination-out", eraseStops(brightFrac, gradual, peak))}
      {rgb && tintStrength > 0.01
        ? renderShape("lighter", tintStops(rgb, brightFrac, gradual, tintStrength))
        : null}
    </>
  );
}

/** Resolves the scene's effective darkness (0 day … 1 dark), migrating the legacy boolean. */
function sceneDarkness(scene: Scene, override?: number): number {
  if (override !== undefined) return clamp01(override);
  if (scene.darkness !== undefined) return clamp01(scene.darkness);
  return scene.globalIllumination ? 0 : 1;
}

export const VisionMaskLayer = memo(function VisionMaskLayer({
  scene,
  tokens,
  ftToPx,
  darkness,
  animationsEnabled = true,
}: {
  scene: Scene;
  /** The viewer's vision-enabled tokens on this scene. */
  tokens: Token[];
  /** World px per foot (scene.gridSize / feetPerSquare). */
  ftToPx: number;
  /** Displayed ambient darkness 0..1 (tweened by MapCanvas for smooth day↔night). */
  darkness?: number;
  /** Client toggle (low-end escape hatch): when false, no per-frame light animation. */
  animationsEnabled?: boolean;
}) {
  const segments = useMemo(() => wallsToSegments(scene.walls), [scene.walls]);
  const enabledLights = useMemo(() => scene.lights.filter((light) => light.enabled), [scene.lights]);
  const time = useAnimationClock(animationsEnabled && sceneHasAnimatedLight(scene));
  const dark = sceneDarkness(scene, darkness);
  const ambientReveal = 1 - dark; // how much the map shows in a viewer's LOS before lights
  // A box big enough to contain every reveal circle anywhere on the map, so a token's LOS
  // polygon (which its reveals are clipped to) covers the whole visible-from-token area.
  const halfExtent = Math.hypot(scene.width, scene.height) + 20;

  // LOS-gated (user's choice): a viewer only sees within its own line of sight. Recompute
  // the sweep only when a viewer token moves or the walls change (MapCanvas re-renders
  // often), so key off a stable signature.
  const tokenKey = tokens
    .map((t) => `${t.id}:${Math.round(t.x)}:${Math.round(t.y)}:${t.vision?.rangeFt ?? 0}`)
    .join("|");
  const polys = useMemo(
    () => tokens.map((t) => computeVisibility({ x: t.x, y: t.y }, segments, halfExtent)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokenKey, segments, halfExtent],
  );

  return (
    <Layer listening={false}>
      <Rect x={-2000} y={-2000} width={scene.width + 4000} height={scene.height + 4000} fill="#04050a" />
      {tokens.map((token, index) => {
        const poly = polys[index];
        if (!poly || poly.length < 3) {
          return null;
        }
        const darkvisionR = (token.vision?.rangeFt ?? 0) * ftToPx;
        // Within this viewer's line of sight: ambient day-light ∪ its darkvision ∪ every lit area.
        return (
          <Group key={token.id} clipFunc={polygonClip(poly)}>
            {ambientReveal > 0.001 ? (
              <Rect
                x={-2000}
                y={-2000}
                width={scene.width + 4000}
                height={scene.height + 4000}
                fill="#000"
                opacity={ambientReveal}
                globalCompositeOperation="destination-out"
              />
            ) : null}
            {darkvisionR > 0 ? (
              <Circle
                x={token.x}
                y={token.y}
                radius={darkvisionR}
                globalCompositeOperation="destination-out"
                {...radialFill(darkvisionR, eraseStops(0.75, true, 1))}
              />
            ) : null}
            {enabledLights.map((light) => (
              <LightReveal key={light.id} light={light} ftToPx={ftToPx} time={time} />
            ))}
          </Group>
        );
      })}
    </Layer>
  );
});

/// <summary>
/// Per-enabled-light wall-clipped coverage polygon (its LOS ∩ dim radius). Memoized on a
/// (lights, walls) signature — the sweep is the expensive bit.
/// </summary>
function useLightCoverage(scene: Scene, ftToPx: number): Array<{ light: Light; poly: Point[] }> {
  const segments = useMemo(() => wallsToSegments(scene.walls), [scene.walls]);
  const enabledLights = useMemo(() => scene.lights.filter((light) => light.enabled), [scene.lights]);
  const key = enabledLights
    .map((l) => `${l.id}:${Math.round(l.x)}:${Math.round(l.y)}:${l.dimR}`)
    .join("|");
  return useMemo(
    () =>
      enabledLights.map((light) => ({
        light,
        poly: computeVisibility({ x: light.x, y: light.y }, segments, light.dimR * ftToPx + scene.gridSize),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, segments, ftToPx, scene.gridSize],
  );
}

/// <summary>
/// The DM's dynamic-lighting overview (shown when a scene has dynamic lighting on and the
/// DM is NOT previewing the player view): the map is dimmed and every light's wall-clipped
/// pool — plus any vision token's darkvision — is cut fully bright, so the DM immediately
/// sees which areas their lights illuminate. Unlike the player mask this is NOT gated by a
/// token's line of sight; it's the omniscient "here's my lighting" view.
/// </summary>
export const DmLightingOverlay = memo(function DmLightingOverlay({
  scene,
  tokens,
  ftToPx,
  darkness,
  animationsEnabled = true,
}: {
  scene: Scene;
  /** Vision-enabled tokens on the scene (for darkvision pools). */
  tokens: Token[];
  ftToPx: number;
  /** Displayed ambient darkness 0..1 (tweened by MapCanvas for smooth day↔night). */
  darkness?: number;
  /** Client toggle (low-end escape hatch): when false, no per-frame light animation. */
  animationsEnabled?: boolean;
}) {
  const coverage = useLightCoverage(scene, ftToPx);
  const segments = useMemo(() => wallsToSegments(scene.walls), [scene.walls]);
  const time = useAnimationClock(animationsEnabled && sceneHasAnimatedLight(scene));
  // Keep the DM's map readable during setup: dim scales with darkness but never fully blacks out.
  const baseOpacity = Math.min(0.62, sceneDarkness(scene, darkness));
  const halfExtent = Math.hypot(scene.width, scene.height) + 20;
  const tokenKey = tokens
    .map((t) => `${t.id}:${Math.round(t.x)}:${Math.round(t.y)}:${t.vision?.rangeFt ?? 0}`)
    .join("|");
  const tokenPolys = useMemo(
    () => tokens.map((t) => computeVisibility({ x: t.x, y: t.y }, segments, halfExtent)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokenKey, segments, halfExtent],
  );

  if (baseOpacity <= 0.001) return null;

  return (
    <Layer listening={false}>
      {/* Dim (not black) so the DM still sees the whole map faintly. */}
      <Rect
        x={-2000}
        y={-2000}
        width={scene.width + 4000}
        height={scene.height + 4000}
        fill="#04050a"
        opacity={baseOpacity}
      />
      {coverage.map(({ light, poly }) =>
        poly.length < 3 ? null : (
          <Group key={light.id} clipFunc={polygonClip(poly)}>
            <LightReveal light={light} ftToPx={ftToPx} time={time} />
          </Group>
        ),
      )}
      {tokens.map((token, index) => {
        const poly = tokenPolys[index];
        const darkvisionR = (token.vision?.rangeFt ?? 0) * ftToPx;
        if (!poly || poly.length < 3 || darkvisionR <= 0) {
          return null;
        }
        return (
          <Group key={token.id} clipFunc={polygonClip(poly)}>
            <Circle
              x={token.x}
              y={token.y}
              radius={darkvisionR}
              globalCompositeOperation="destination-out"
              {...radialFill(darkvisionR, eraseStops(0.75, true, 1))}
            />
          </Group>
        );
      })}
    </Layer>
  );
});

export const WallsLightsEditor = memo(function WallsLightsEditor({
  scene,
  ftToPx,
  wallsActive,
  lightsActive,
  onDeleteWall,
  onToggleDoor,
  onMoveLight,
  onDeleteLight,
  onConfigureLight,
}: {
  scene: Scene;
  ftToPx: number;
  wallsActive: boolean;
  lightsActive: boolean;
  onDeleteWall: (id: string) => void;
  onToggleDoor: (id: string) => void;
  onMoveLight: (light: Light) => void;
  onDeleteLight: (id: string) => void;
  /** Open the per-light config panel (double-click). */
  onConfigureLight?: (light: Light) => void;
}) {
  // Hover hint: shows the "double-click / right-click / drag" affordances above a marker.
  const [hoveredLightId, setHoveredLightId] = useState<string | null>(null);

  return (
    <Layer listening={wallsActive || lightsActive}>
      {scene.walls.map((wall) => {
        const isDoor = wall.kind === "door";
        const open = isDoor && wall.open;
        const stroke = isDoor ? (open ? "#8ce99a" : "#e0a458") : "#8fb7ff";
        return (
          <Line
            key={wall.id}
            name="map-handle"
            points={[wall.x1, wall.y1, wall.x2, wall.y2]}
            stroke={stroke}
            strokeWidth={isDoor ? 4 : 3}
            opacity={open ? 0.55 : 0.9}
            dash={open ? [10, 8] : undefined}
            hitStrokeWidth={wallsActive ? 16 : 0}
            listening={wallsActive}
            onClick={() => {
              if (isDoor) {
                onToggleDoor(wall.id);
              }
            }}
            onContextMenu={(e) => {
              e.evt.preventDefault();
              onDeleteWall(wall.id);
            }}
          />
        );
      })}

      {scene.lights.map((light) => {
        const angle = light.angle ?? 360;
        const dimPx = light.dimR * ftToPx;
        const brightPx = light.brightR * ftToPx;
        const directed = angle < 360;
        const wedgeRot = (light.rotation ?? 0) - angle / 2;
        const ringStroke = light.color ?? "#ffd166";
        return (
          <Group
            key={light.id}
            x={light.x}
            y={light.y}
            draggable={lightsActive}
            onMouseEnter={() => lightsActive && setHoveredLightId(light.id)}
            onMouseLeave={() => setHoveredLightId((id) => (id === light.id ? null : id))}
            onDragEnd={(e) => onMoveLight({ ...light, x: e.target.x(), y: e.target.y() })}
            onDblClick={() => onConfigureLight?.(light)}
            onContextMenu={(e) => {
              e.evt.preventDefault();
              onDeleteLight(light.id);
            }}
          >
            {/* Faint reach rings (or wedges) so the DM sees a light's coverage + facing. */}
            {directed ? (
              <>
                <Wedge
                  radius={brightPx}
                  angle={angle}
                  rotation={wedgeRot}
                  stroke={ringStroke}
                  strokeWidth={1}
                  opacity={0.35}
                  listening={false}
                />
                <Wedge
                  radius={dimPx}
                  angle={angle}
                  rotation={wedgeRot}
                  stroke={ringStroke}
                  strokeWidth={1}
                  opacity={0.18}
                  dash={[8, 8]}
                  listening={false}
                />
              </>
            ) : (
              <>
                <Circle radius={brightPx} stroke={ringStroke} strokeWidth={1} opacity={0.35} listening={false} />
                <Circle
                  radius={dimPx}
                  stroke={ringStroke}
                  strokeWidth={1}
                  opacity={0.18}
                  dash={[8, 8]}
                  listening={false}
                />
              </>
            )}
            <Circle
              name="map-handle"
              radius={9}
              fill={light.enabled ? (light.color ?? "#ffd166") : "#7a7a7a"}
              stroke="#1a1408"
              strokeWidth={1.5}
              hitStrokeWidth={lightsActive ? 14 : 0}
            />
            {hoveredLightId === light.id ? (
              <Label y={-30} offsetX={112} listening={false}>
                <Tag fill="#1a1408" opacity={0.92} cornerRadius={3} />
                <Text
                  text="Dbl-click: edit · R-click: delete · drag: move"
                  fontSize={11}
                  padding={5}
                  fill="#ffd166"
                  width={224}
                  align="center"
                />
              </Label>
            ) : null}
          </Group>
        );
      })}
    </Layer>
  );
});
