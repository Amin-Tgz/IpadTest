import type { Attachment } from "../character/attachments.js";
import { toLocalPoints } from "../character/attachments.js";
import type { JointId } from "../app/constants.js";
import { PALETTE } from "../app/constants.js";

export function buildShoeAttachment(
  anchor: { x: number; y: number },
  boneId: JointId,
  side: "left" | "right",
): Attachment {
  const dir = side === "left" ? -1 : 1;
  const points: Array<{ x: number; y: number }> = [];
  const w = 34;
  const h = 20;
  const step = 5;
  for (let x = 0; x <= w; x += step) {
    points.push({ x: x - w / 2, y: 0 });
  }
  points.push({ x: w / 2 + 6, y: 2 });
  points.push({ x: w / 2 + 10, y: 8 });
  points.push({ x: w / 2 + 4, y: h });
  for (let x = w - step; x >= 0; x -= step) {
    points.push({ x: x - w / 2, y: h });
  }
  points.push({ x: -w / 2 - 8, y: h - 4 });
  points.push({ x: -w / 2 - 12, y: h - 12 });
  points.push({ x: -w / 2 - 8, y: -h + 8 });
  points.push({ x: -w / 2, y: -h + 8 });

  const scaled = points.map((p) => ({ x: p.x * dir, y: p.y + 2 }));
  return {
    id: `shoe_${side}`,
    kind: "wearable",
    boneId,
    localPoints: toLocalPoints(scaled, { x: 0, y: 0 }),
    color: PALETTE.primaryInk,
    baseWidth: 4,
    drawOrder: 7,
  };
}

export function buildRodAttachment(anchor: { x: number; y: number }): Attachment {
  const length = 170;
  const points: Array<{ x: number; y: number }> = [];
  const step = 6;
  for (let d = 0; d <= length; d += step) {
    points.push({ x: d, y: 0 });
  }
  points.push({ x: length - 8, y: -10 });
  points.push({ x: length - 14, y: -18 });

  return {
    id: "rod",
    kind: "held_tool",
    boneId: "right_hand",
    localPoints: toLocalPoints(points, { x: 0, y: 0 }),
    color: PALETTE.primaryInk,
    baseWidth: 3.5,
    drawOrder: 7,
  };
}

export function buildFishLineAttachment(anchor: { x: number; y: number }, target: { x: number; y: number }): Attachment {
  const points = [
    { x: 0, y: 0 },
    { x: target.x - anchor.x, y: target.y - anchor.y },
  ];
  return {
    id: "fish_line",
    kind: "held_tool",
    boneId: "right_hand",
    localPoints: toLocalPoints(points, { x: 0, y: 0 }),
    color: PALETTE.primaryInk,
    baseWidth: 2,
    drawOrder: 6,
  };
}
