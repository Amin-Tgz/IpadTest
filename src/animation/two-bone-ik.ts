export interface Point2 { x: number; y: number }

export interface TwoBoneSolution {
  rootRotation: number;
  jointRotation: number;
  reachable: boolean;
}

const degrees = (radians: number): number => radians * 180 / Math.PI;
const normalize = (angle: number): number => ((angle + 180) % 360 + 360) % 360 - 180;

/** Solves additive rotations relative to the limb's hand-drawn rest pose. */
export function solveTwoBoneIK(
  root: Point2,
  middle: Point2,
  end: Point2,
  target: Point2,
  bendDirection: -1 | 1 = 1,
): TwoBoneSolution {
  const upper = Math.max(0.001, Math.hypot(middle.x - root.x, middle.y - root.y));
  const lower = Math.max(0.001, Math.hypot(end.x - middle.x, end.y - middle.y));
  const targetDistance = Math.hypot(target.x - root.x, target.y - root.y);
  const distance = Math.max(Math.abs(upper - lower) + 0.001, Math.min(upper + lower - 0.001, targetDistance));
  const targetAngle = Math.atan2(target.y - root.y, target.x - root.x);
  const rootOffset = Math.acos(Math.max(-1, Math.min(1, (upper * upper + distance * distance - lower * lower) / (2 * upper * distance))));
  const desiredUpper = targetAngle - bendDirection * rootOffset;
  const restUpper = Math.atan2(middle.y - root.y, middle.x - root.x);
  const desiredInner = Math.acos(Math.max(-1, Math.min(1, (upper * upper + lower * lower - distance * distance) / (2 * upper * lower))));
  const desiredElbow = bendDirection * (Math.PI - desiredInner);
  const restLower = Math.atan2(end.y - middle.y, end.x - middle.x);
  const restElbow = normalize(degrees(restLower - restUpper));
  return {
    rootRotation: normalize(degrees(desiredUpper - restUpper)),
    jointRotation: normalize(degrees(desiredElbow) - restElbow),
    reachable: targetDistance <= upper + lower && targetDistance >= Math.abs(upper - lower),
  };
}
