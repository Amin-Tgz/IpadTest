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
  const needsClimb = target?.physicsShape === "stairs" || target?.physicsShape === "slope";
  const crossesSurface = target?.physicsShape === "platform" || /bridge|پل/i.test(target?.type ?? "");
  const x = target
    ? target.bounds.x + ((needsClimb || crossesSurface)
      ? (resolvedDirection > 0 ? target.bounds.width + 28 : -28)
      : target.bounds.width / 2)
    : rootX + resolvedDirection * Math.max(140, Math.min(320, durationMs * 0.18));
  return { x, direction: resolvedDirection, needsClimb, crossesSurface };
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
