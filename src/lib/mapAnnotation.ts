export const ANNOTATION_DURATION_MS = 10_000;
export const ANNOTATION_MIN_LENGTH = 24;
export const ANNOTATION_SAMPLE_DISTANCE = 12;
export const ANNOTATION_MAX_POINTS = 240;

export type MapAnnotation = {
  id: string;
  sceneId: string;
  playerId: string;
  playerName: string;
  color: string;
  /** Flat polyline [x1, y1, x2, y2, ...] in world coordinates. */
  points: number[];
  createdAt: number;
};

/// <summary>
/// Returns true when a flat point array is valid for a shared annotation.
/// </summary>
export function isValidAnnotationPoints(points: unknown): points is number[] {
  return (
    Array.isArray(points) &&
    points.length >= 4 &&
    points.length % 2 === 0 &&
    points.every((value) => Number.isFinite(value))
  );
}

/// <summary>
/// Total length of a flat annotation polyline.
/// </summary>
export function annotationPathLength(points: number[]): number {
  let length = 0;
  for (let index = 2; index < points.length; index += 2) {
    length += Math.hypot(
      points[index] - points[index - 2],
      points[index + 1] - points[index - 1],
    );
  }
  return length;
}

/// <summary>
/// Appends a world point when it is far enough from the previous sample.
/// </summary>
export function appendAnnotationSample(
  points: number[],
  x: number,
  y: number,
  minDistance = ANNOTATION_SAMPLE_DISTANCE,
): number[] {
  if (points.length < 2) {
    return [x, y];
  }
  const lastX = points[points.length - 2];
  const lastY = points[points.length - 1];
  if (Math.hypot(x - lastX, y - lastY) < minDistance) {
    return points;
  }
  return [...points, x, y];
}

/// <summary>
/// Trims an annotation polyline to the configured max point count.
/// </summary>
export function trimAnnotationPoints(points: number[]): number[] {
  if (points.length <= 4) {
    return points;
  }
  if (points.length <= ANNOTATION_MAX_POINTS) {
    return points;
  }
  return points.slice(0, ANNOTATION_MAX_POINTS);
}

/// <summary>
/// Returns opacity for an annotation based on age (1 → 0 over ANNOTATION_DURATION_MS).
/// </summary>
export function annotationOpacity(createdAt: number, now = Date.now()): number {
  const age = now - createdAt;
  if (age >= ANNOTATION_DURATION_MS) {
    return 0;
  }
  if (age < ANNOTATION_DURATION_MS * 0.7) {
    return 1;
  }
  const fadeWindow = ANNOTATION_DURATION_MS * 0.3;
  return 1 - (age - ANNOTATION_DURATION_MS * 0.7) / fadeWindow;
}
