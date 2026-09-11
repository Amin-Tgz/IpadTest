export interface InteractionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MovementTargetObject {
  id: string;
  type: string;
  bounds: InteractionBounds;
  physicsShape: string | null;
}

export function movementDestination(
  rootX: number,
  direction: "left" | "right" | "up" | "down" | null,
  durationMs: number,
  target: MovementTargetObject | null,
): { x: number; direction: -1 | 1; needsClimb: boolean; crossesSurface: boolean } {
  const resolvedDirection: -1 | 1 = direction === "left"
    ? -1
    : direction === "right"
      ? 1
      : target && target.bounds.x < rootX ? -1 : 1;
  const needsClimb = target?.physicsShape === "stairs" || target?.physicsShape === "slope" || target?.physicsShape === "ladder";
  const crossesSurface = target?.physicsShape === "platform" || /bridge|پل/i.test(target?.type ?? "");
  const solid = target !== null && SOLID_SHAPES.has(target.physicsShape ?? "");
  let x: number;
  if (!target) {
    x = rootX + resolvedDirection * Math.max(140, Math.min(320, durationMs * 0.18));
  } else if (needsClimb || crossesSurface) {
    x = target.bounds.x + (resolvedDirection > 0 ? target.bounds.width + 28 : -28);
  } else if (solid) {
    x = rootX <= target.bounds.x + target.bounds.width / 2
      ? target.bounds.x - SOLID_CLEARANCE
      : target.bounds.x + target.bounds.width + SOLID_CLEARANCE;
  } else {
    x = target.bounds.x + target.bounds.width / 2;
  }
  return { x, direction: resolvedDirection, needsClimb, crossesSurface };
}

const SOLID_SHAPES = new Set(["obstacle", "dynamic"]);
const SOLID_CLEARANCE = 36;

export type JumpDestination =
  | { kind: "toward"; x: number }
  | { kind: "drop"; direction: -1 | 1 | null }
  | { kind: "hop" };

/**
 * Where a requested jump lands: at the tip of a drawn arrow, on a drawn
 * object, or off whatever the hero stands on in the requested direction.
 */
export function jumpDestination(
  rootX: number,
  direction: "left" | "right" | "up" | "down" | null,
  target: { bounds: InteractionBounds; physical: boolean } | null,
): JumpDestination {
  if (target) {
    const { bounds } = target;
    if (target.physical) return { kind: "toward", x: bounds.x + bounds.width / 2 };
    const leftEnd = bounds.x;
    const rightEnd = bounds.x + bounds.width;
    if (direction === "right") return { kind: "toward", x: rightEnd };
    if (direction === "left") return { kind: "toward", x: leftEnd };
    return { kind: "toward", x: Math.abs(rightEnd - rootX) >= Math.abs(leftEnd - rootX) ? rightEnd : leftEnd };
  }
  if (direction === "left") return { kind: "drop", direction: -1 };
  if (direction === "right") return { kind: "drop", direction: 1 };
  if (direction === "down") return { kind: "drop", direction: null };
  return { kind: "hop" };
}

export function farthestToolPoint(
  hand: { x: number; y: number },
  pointGroups: Array<Array<{ x: number; y: number }>>,
): { x: number; y: number } {
  return pointGroups.flat().reduce((farthest, point) =>
    Math.hypot(point.x - hand.x, point.y - hand.y) > Math.hypot(farthest.x - hand.x, farthest.y - hand.y)
      ? point
      : farthest,
  hand);
}

export function fishingHookPosition(
  rodTip: { x: number; y: number },
  waterPoint: { x: number; y: number },
  pullProgress: number,
): { x: number; y: number } {
  const progress = Math.max(0, Math.min(1, pullProgress));
  const raised = { x: rodTip.x + 10, y: rodTip.y + 48 };
  return {
    x: waterPoint.x + (raised.x - waterPoint.x) * progress,
    y: waterPoint.y + (raised.y - waterPoint.y) * progress,
  };
}
