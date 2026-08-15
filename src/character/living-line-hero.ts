import { PALETTE, type JointId } from "../app/constants.js";
import type { Stroke, StrokePoint, StrokeStore } from "../drawing/stroke-store.js";
import type { CharacterManifest, FaceManifest, JointManifest, PartManifest } from "./character-manifest.js";

export const LIVING_LINE_HERO_ID = "living_line_hero";

export type HeroVoicePreset = "curious" | "protesting" | "confused" | "effort" | "delighted" | "sad";

export interface HeroPathDefinition {
  id: string;
  part: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface LivingLineHeroDefinition {
  id: typeof LIVING_LINE_HERO_ID;
  paths: HeroPathDefinition[];
  joints: Array<{ id: JointId; x: number; y: number; parent: JointId | null }>;
  face: FaceManifest;
  collisionBounds: { width: number; height: number; rootOffsetY: number };
  attachmentAnchors: readonly JointId[];
}

function cubic(
  from: { x: number; y: number },
  controlA: { x: number; y: number },
  controlB: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const u = 1 - t;
    points.push({
      x: u ** 3 * from.x + 3 * u ** 2 * t * controlA.x + 3 * u * t ** 2 * controlB.x + t ** 3 * to.x,
      y: u ** 3 * from.y + 3 * u ** 2 * t * controlA.y + 3 * u * t ** 2 * controlB.y + t ** 3 * to.y,
    });
  }
  return points;
}

function join(...segments: Array<Array<{ x: number; y: number }>>): Array<{ x: number; y: number }> {
  return segments.flatMap((segment, index) => index === 0 ? segment : segment.slice(1));
}

function loop(cx: number, cy: number, radiusX: number, radiusY: number, count = 28): Array<{ x: number; y: number }> {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radiusX, y: cy + Math.sin(angle) * radiusY };
  });
}

export const LIVING_LINE_HERO: LivingLineHeroDefinition = {
  id: LIVING_LINE_HERO_ID,
  joints: [
    { id: "root", x: 0, y: 0, parent: null },
    { id: "torso", x: 0, y: -30, parent: "root" },
    { id: "neck", x: 0, y: -61, parent: "torso" },
    { id: "head", x: 1, y: -104, parent: "neck" },
    { id: "left_shoulder", x: -13, y: -48, parent: "torso" },
    { id: "left_elbow", x: -29, y: -25, parent: "left_shoulder" },
    { id: "left_hand", x: -41, y: 2, parent: "left_elbow" },
    { id: "right_shoulder", x: 13, y: -48, parent: "torso" },
    { id: "right_elbow", x: 30, y: -24, parent: "right_shoulder" },
    { id: "right_hand", x: 42, y: 3, parent: "right_elbow" },
    { id: "left_hip", x: -7, y: 0, parent: "root" },
    { id: "left_knee", x: -17, y: 36, parent: "left_hip" },
    { id: "left_foot", x: -21, y: 72, parent: "left_knee" },
    { id: "right_hip", x: 7, y: 0, parent: "root" },
    { id: "right_knee", x: 17, y: 37, parent: "right_hip" },
    { id: "right_foot", x: 22, y: 72, parent: "right_knee" },
  ],
  face: {
    leftEye: { x: -9, y: -109 },
    rightEye: { x: 10, y: -108 },
    leftEyebrow: { x: -10, y: -120 },
    rightEyebrow: { x: 11, y: -119 },
    mouth: { x: 2, y: -91 },
  },
  collisionBounds: { width: 54, height: 108, rootOffsetY: 18 },
  attachmentAnchors: ["left_hand", "right_hand", "left_foot", "right_foot", "head"],
  paths: [
    {
      id: "hero_head_loop",
      part: "head",
      width: 4.4,
      points: join(
        cubic({ x: 0, y: -139 }, { x: -31, y: -143 }, { x: -35, y: -113 }, { x: -27, y: -92 }),
        cubic({ x: -27, y: -92 }, { x: -19, y: -72 }, { x: 19, y: -73 }, { x: 29, y: -95 }),
        cubic({ x: 29, y: -95 }, { x: 38, y: -117 }, { x: 27, y: -139 }, { x: 0, y: -139 }),
      ),
    },
    {
      id: "hero_curl",
      part: "head",
      width: 4.1,
      points: cubic({ x: 0, y: -139 }, { x: 13, y: -154 }, { x: 24, y: -144 }, { x: 14, y: -136 }, 9),
    },
    { id: "hero_left_eye", part: "head", width: 4.2, points: loop(-9, -109, 2.1, 3.1, 10) },
    { id: "hero_right_eye", part: "head", width: 4.2, points: loop(10, -108, 2.1, 3.1, 10) },
    { id: "hero_left_brow", part: "left_eyebrow", width: 3.8, points: cubic({ x: -17, y: -118 }, { x: -13, y: -123 }, { x: -7, y: -124 }, { x: -3, y: -120 }, 7) },
    { id: "hero_right_brow", part: "right_eyebrow", width: 3.8, points: cubic({ x: 4, y: -119 }, { x: 9, y: -123 }, { x: 15, y: -121 }, { x: 18, y: -116 }, 7) },
    { id: "hero_mouth", part: "head", width: 3.8, points: cubic({ x: -8, y: -91 }, { x: -3, y: -86 }, { x: 7, y: -85 }, { x: 12, y: -92 }, 9) },
    { id: "hero_spine", part: "torso", width: 4.6, points: cubic({ x: 0, y: -75 }, { x: -5, y: -54 }, { x: 5, y: -24 }, { x: 0, y: 4 }, 18) },
    { id: "hero_left_arm", part: "left_arm", width: 4.2, points: cubic({ x: -4, y: -54 }, { x: -19, y: -49 }, { x: -31, y: -24 }, { x: -41, y: 2 }, 18) },
    { id: "hero_right_arm", part: "right_arm", width: 4.2, points: cubic({ x: 4, y: -53 }, { x: 20, y: -48 }, { x: 34, y: -22 }, { x: 42, y: 3 }, 18) },
    { id: "hero_left_leg", part: "left_leg", width: 4.4, points: cubic({ x: -4, y: 0 }, { x: -13, y: 18 }, { x: -17, y: 52 }, { x: -21, y: 72 }, 20) },
    { id: "hero_right_leg", part: "right_leg", width: 4.4, points: cubic({ x: 4, y: 0 }, { x: 13, y: 20 }, { x: 18, y: 53 }, { x: 22, y: 72 }, 20) },
    { id: "hero_left_foot", part: "left_foot", width: 4.6, points: cubic({ x: -21, y: 72 }, { x: -28, y: 76 }, { x: -36, y: 75 }, { x: -39, y: 72 }, 8) },
    { id: "hero_right_foot", part: "right_foot", width: 4.6, points: cubic({ x: 22, y: 72 }, { x: 29, y: 76 }, { x: 38, y: 75 }, { x: 41, y: 72 }, 8) },
  ],
};

function toWorldPoint(point: { x: number; y: number }, originX: number, originY: number, time: number): StrokePoint {
  return { x: originX + point.x, y: originY + point.y, pressure: 0.5, time };
}

function toStroke(path: HeroPathDefinition, originX: number, originY: number): Stroke {
  return {
    id: path.id,
    points: path.points.map((point, index) => toWorldPoint(point, originX, originY, index * 8)),
    color: PALETTE.primaryInk,
    baseWidth: path.width,
    tool: "pen",
    createdAt: 0,
    worldSpace: true,
    entityId: LIVING_LINE_HERO_ID,
    active: true,
    groupId: LIVING_LINE_HERO_ID,
  };
}

export function installLivingLineHero(
  store: StrokeStore,
  originX: number,
  baselineY: number,
): CharacterManifest {
  const originY = baselineY - 72;
  for (const path of LIVING_LINE_HERO.paths) {
    if (!store.byId(path.id)) store.add(toStroke(path, originX, originY));
  }
  const joints: JointManifest[] = LIVING_LINE_HERO.joints.map((joint) => ({
    ...joint,
    x: originX + joint.x,
    y: originY + joint.y,
    confidence: 1,
  }));
  const translateFace = (point: { x: number; y: number } | undefined) => point
    ? { x: originX + point.x, y: originY + point.y }
    : undefined;
  const parts: PartManifest[] = LIVING_LINE_HERO.paths.map((path) => ({
    part: path.part,
    strokeIds: [path.id],
    confidence: 1,
    source: "local",
  }));
  return {
    version: "3.0",
    joints,
    face: {
      leftEye: translateFace(LIVING_LINE_HERO.face.leftEye),
      rightEye: translateFace(LIVING_LINE_HERO.face.rightEye),
      leftEyebrow: translateFace(LIVING_LINE_HERO.face.leftEyebrow),
      rightEyebrow: translateFace(LIVING_LINE_HERO.face.rightEyebrow),
      mouth: translateFace(LIVING_LINE_HERO.face.mouth),
    },
    parts,
    includedStrokeIds: LIVING_LINE_HERO.paths.map((path) => path.id),
    segmentOverrides: [],
    createdAt: 0,
  };
}
