import { StrokeStore, type Stroke, type StrokePoint } from "../drawing/stroke-store.js";
import { PALETTE } from "../app/constants.js";

function circlePoints(cx: number, cy: number, r: number, count: number): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, pressure: 0.5, time: 0 });
  }
  return pts;
}

function linePoints(x1: number, y1: number, x2: number, y2: number): StrokePoint[] {
  return [
    { x: x1, y: y1, pressure: 0.5, time: 0 },
    { x: x2, y: y2, pressure: 0.5, time: 0 },
  ];
}

function makeStroke(id: string, points: StrokePoint[], entityId: string): Stroke {
  return {
    id,
    points,
    color: PALETTE.primaryInk,
    baseWidth: 4,
    tool: "pen",
    createdAt: Date.now(),
    worldSpace: true,
    entityId,
    active: false,
    groupId: null,
  };
}

export function buildSampleCharacter(store: StrokeStore, originX: number, baselineY: number): string {
  const entityId = "sample_character";
  const x = originX;
  const cx = x;

  const headCy = baselineY - 196;
  const neckY = baselineY - 150;
  const hipY = baselineY - 96;
  const kneeY = baselineY - 46;
  const footY = baselineY - 4;

  const strokes: Stroke[] = [
    makeStroke("sample_head", circlePoints(cx, headCy, 34, 28), entityId),
    makeStroke("sample_eye_l", circlePoints(cx - 11, headCy - 5, 4.5, 10), entityId),
    makeStroke("sample_eye_r", circlePoints(cx + 11, headCy - 5, 4.5, 10), entityId),
    makeStroke(
      "sample_mouth",
      [
        { x: cx - 7, y: headCy + 17, pressure: 0.5, time: 0 },
        { x: cx, y: headCy + 21, pressure: 0.5, time: 0 },
        { x: cx + 7, y: headCy + 17, pressure: 0.5, time: 0 },
      ],
      entityId,
    ),
    makeStroke("sample_neck", linePoints(cx, headCy + 34, cx, neckY + 6), entityId),
    makeStroke("sample_torso", linePoints(cx, neckY + 6, cx, hipY + 6), entityId),
    makeStroke("sample_arm_l", linePoints(cx, neckY + 20, cx - 40, hipY + 2), entityId),
    makeStroke("sample_arm_r", linePoints(cx, neckY + 20, cx + 40, hipY + 2), entityId),
    makeStroke("sample_leg_l", linePoints(cx, hipY + 6, cx - 22, kneeY), entityId),
    makeStroke("sample_leg_l2", linePoints(cx - 22, kneeY, cx - 24, footY), entityId),
    makeStroke("sample_leg_r", linePoints(cx, hipY + 6, cx + 22, kneeY), entityId),
    makeStroke("sample_leg_r2", linePoints(cx + 22, kneeY, cx + 24, footY), entityId),
    makeStroke("sample_foot_l", linePoints(cx - 38, footY, cx - 8, footY), entityId),
    makeStroke("sample_foot_r", linePoints(cx + 8, footY, cx + 38, footY), entityId),
  ];

  strokes.forEach((s) => store.add(s));
  return entityId;
}
