import type { CharacterAnalysis } from "../ai/schemas.js";
import type { CaptureMapping } from "../ai/normalization.js";
import { imageToWorldX, imageToWorldY } from "../ai/normalization.js";
import type { StrokeStore } from "../drawing/stroke-store.js";
import type { IdMap } from "../drawing/id-map.js";
import { strokesInsideBox } from "../drawing/id-map.js";
import { FALLBACK_JOINT_PARENT, JOINT_IDS, type JointId } from "../app/constants.js";

export interface JointManifest {
  id: JointId;
  x: number;
  y: number;
  parent: JointId | null;
  confidence: number;
}

export interface FaceManifest {
  leftEye?: { x: number; y: number };
  rightEye?: { x: number; y: number };
  leftEyebrow?: { x: number; y: number };
  rightEyebrow?: { x: number; y: number };
  mouth?: { x: number; y: number };
}

export interface PartManifest {
  part: string;
  strokeIds: string[];
  polygon?: Array<{ x: number; y: number }>;
  confidence?: number;
  source?: "ai" | "local" | "manual";
}

export interface SegmentOverride {
  part: string;
  polygon: Array<{ x: number; y: number }>;
}

export interface CharacterManifest {
  version: "1.0" | "2.0" | "3.0";
  joints: JointManifest[];
  face: FaceManifest;
  parts: PartManifest[];
  includedStrokeIds: string[];
  segmentOverrides?: SegmentOverride[];
  createdAt: number;
}

export function jointsFromAnalysis(
  analysis: CharacterAnalysis,
  mapping: CaptureMapping,
): JointManifest[] {
  const seen = new Map<string, JointManifest>();
  for (const joint of analysis.character.joints) {
    if (seen.has(joint.id)) continue;
    const valid = JOINT_IDS.includes(joint.id as JointId);
    seen.set(joint.id, {
      id: valid ? (joint.id as JointId) : ("root" as JointId),
      x: imageToWorldX(joint.x, mapping),
      y: imageToWorldY(joint.y, mapping),
      parent: joint.parent as JointId | null,
      confidence: joint.confidence,
    });
  }
  return [...seen.values()];
}

export function faceFromAnalysis(
  analysis: CharacterAnalysis,
  mapping: CaptureMapping,
): FaceManifest {
  const face: FaceManifest = {};
  const anchors = analysis.character.face;
  if (anchors.leftEye) {
    face.leftEye = {
      x: imageToWorldX(anchors.leftEye.x, mapping),
      y: imageToWorldY(anchors.leftEye.y, mapping),
    };
  }
  if (anchors.rightEye) {
    face.rightEye = {
      x: imageToWorldX(anchors.rightEye.x, mapping),
      y: imageToWorldY(anchors.rightEye.y, mapping),
    };
  }
  if (anchors.leftEyebrow) {
    face.leftEyebrow = {
      x: imageToWorldX(anchors.leftEyebrow.x, mapping),
      y: imageToWorldY(anchors.leftEyebrow.y, mapping),
    };
  }
  if (anchors.rightEyebrow) {
    face.rightEyebrow = {
      x: imageToWorldX(anchors.rightEyebrow.x, mapping),
      y: imageToWorldY(anchors.rightEyebrow.y, mapping),
    };
  }
  if (anchors.mouth) {
    face.mouth = {
      x: imageToWorldX(anchors.mouth.x, mapping),
      y: imageToWorldY(anchors.mouth.y, mapping),
    };
  }
  return face;
}

export type CharacterStrokeFilter = (stroke: { entityId: string | null; id: string }) => boolean;

export const isUserStroke: CharacterStrokeFilter = (s) => s.entityId === null;

export function buildManifest(
  analysis: CharacterAnalysis,
  mapping: CaptureMapping,
  store: StrokeStore,
  idMap: IdMap,
  filter: CharacterStrokeFilter = isUserStroke,
): CharacterManifest {
  const joints = jointsFromAnalysis(analysis, mapping);
  const face = faceFromAnalysis(analysis, mapping);
  const boxWorld = {
    x: imageToWorldX(analysis.character.boundingBox.x, mapping),
    y: imageToWorldY(analysis.character.boundingBox.y, mapping),
    width: analysis.character.boundingBox.width / mapping.scale,
    height: analysis.character.boundingBox.height / mapping.scale,
  };

  const strokes = store.all().filter((s) => s.active && filter(s));
  const included = strokesInsideBox(
    strokes,
    { x: boxWorld.x, y: boxWorld.y, width: boxWorld.width, height: boxWorld.height },
  );

  const parts: PartManifest[] = [];
  const covered = new Set<string>();
  for (const region of analysis.character.partRegions) {
    const polygonWorld = region.polygon.map(([x, y]) => ({
      x: imageToWorldX(x, mapping),
      y: imageToWorldY(y, mapping),
    }));
    const strokeIds = idMap.sampleStrokesInPolygon(store, polygonWorld);
    const present = strokes
      .filter((stroke) => strokeIds.has(stroke.id) || stroke.points.some((point) => pointInPolygon(point, polygonWorld)))
      .map((stroke) => stroke.id);
    if (present.length > 0) {
      const coveredSamples = strokes
        .filter((stroke) => present.includes(stroke.id))
        .flatMap((stroke) => stroke.points)
        .filter((point) => pointInPolygon(point, polygonWorld)).length;
      const totalSamples = Math.max(1, strokes.filter((stroke) => present.includes(stroke.id)).flatMap((stroke) => stroke.points).length);
      parts.push({
        part: region.part,
        strokeIds: present,
        polygon: polygonWorld,
        confidence: Math.max(0.35, Math.min(1, coveredSamples / totalSamples)),
        source: "ai",
      });
      present.forEach((id) => covered.add(id));
    }
  }

  for (const inferred of inferSkeletonParts(joints, strokes)) {
    const family = partFamily(inferred.part);
    if (parts.some((part) => partFamily(part.part) === family && (part.confidence ?? 0) >= 0.55)) continue;
    parts.push({ ...inferred, confidence: inferred.confidence ?? 0.72, source: "local" });
    inferred.strokeIds.forEach((id) => covered.add(id));
  }

  const uncoveredIncluded = [...included].filter((id) => !covered.has(id));
  if (uncoveredIncluded.length > 0) {
    parts.push({ part: "body", strokeIds: uncoveredIncluded, confidence: 0.25, source: "local" });
  }

  return {
    version: "3.0",
    joints,
    face,
    parts,
    includedStrokeIds: [...included],
    segmentOverrides: [],
    createdAt: Date.now(),
  };
}

function inferSkeletonParts(
  joints: JointManifest[],
  strokes: Array<{ id: string; points: Array<{ x: number; y: number }> }>,
): PartManifest[] {
  const byId = new Map(joints.map((joint) => [joint.id, joint]));
  const ys = joints.map((joint) => joint.y);
  const height = ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 180;
  const radius = Math.max(7, Math.min(22, height * 0.045));
  const regions: Array<{ part: string; polygon: Array<{ x: number; y: number }> }> = [];
  const segment = (part: string, from: JointManifest | undefined, to: JointManifest | undefined, width = radius): void => {
    if (from && to) regions.push({ part, polygon: capsulePolygon(from, to, width) });
  };

  segment("left_arm", byId.get("left_shoulder"), byId.get("left_elbow"));
  segment("left_hand", byId.get("left_elbow"), byId.get("left_hand"), radius * 0.9);
  segment("right_arm", byId.get("right_shoulder"), byId.get("right_elbow"));
  segment("right_hand", byId.get("right_elbow"), byId.get("right_hand"), radius * 0.9);
  segment("left_leg", byId.get("left_hip"), byId.get("left_knee"), radius * 1.1);
  segment("left_foot", byId.get("left_knee"), byId.get("left_foot"), radius * 1.05);
  segment("right_leg", byId.get("right_hip"), byId.get("right_knee"), radius * 1.1);
  segment("right_foot", byId.get("right_knee"), byId.get("right_foot"), radius * 1.05);

  const head = byId.get("head");
  if (head) {
    const neck = byId.get("neck") ?? byId.get("torso");
    const headRadius = Math.max(radius * 1.8, neck ? Math.hypot(head.x - neck.x, head.y - neck.y) * 0.72 : 0);
    regions.push({ part: "head", polygon: circlePolygon(head, Math.min(headRadius, height * 0.18), 12) });
  }

  const torsoPoints = ["left_shoulder", "right_shoulder", "neck", "torso", "root", "left_hip", "right_hip"]
    .map((id) => byId.get(id as JointId))
    .filter((joint): joint is JointManifest => joint !== undefined);
  if (torsoPoints.length > 0) regions.push({ part: "torso", polygon: paddedBounds(torsoPoints, radius * 1.15) });

  return regions.map((region) => ({
    part: region.part,
    polygon: region.polygon,
    confidence: 0.72,
    source: "local" as const,
    strokeIds: strokes
      .filter((stroke) => stroke.points.some((point) => pointInPolygon(point, region.polygon)))
      .map((stroke) => stroke.id),
  })).filter((region) => region.strokeIds.length > 0);
}

function capsulePolygon(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
): Array<{ x: number; y: number }> {
  const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const nx = (-(to.y - from.y) / distance) * radius;
  const ny = ((to.x - from.x) / distance) * radius;
  return [
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny },
  ];
}

function circlePolygon(
  center: { x: number; y: number },
  radius: number,
  samples: number,
): Array<{ x: number; y: number }> {
  return Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function paddedBounds(points: Array<{ x: number; y: number }>, padding: number): Array<{ x: number; y: number }> {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;
  return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
}

function pointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x) inside = !inside;
  }
  return inside;
}

function partFamily(part: string): string {
  const name = part.toLowerCase();
  if (name.includes("head") || name.includes("face") || name.includes("hair")) return "head";
  if (name.includes("torso") || name.includes("body") || name.includes("chest") || name.includes("neck")) return "torso";
  for (const side of ["left", "right"] as const) {
    if (!name.includes(side)) continue;
    if (name.includes("hand") || name.includes("finger") || name.includes("thumb")) return `${side}_hand`;
    if (name.includes("arm") || name.includes("shoulder") || name.includes("elbow")) return `${side}_arm`;
    if (name.includes("foot") || name.includes("ankle")) return `${side}_foot`;
    if (name.includes("leg") || name.includes("hip") || name.includes("knee")) return `${side}_leg`;
  }
  return name;
}

export function migrateManifest(manifest: CharacterManifest): CharacterManifest {
  if (manifest.version === "3.0") {
    return { ...manifest, segmentOverrides: manifest.segmentOverrides ?? [] };
  }
  return {
    ...manifest,
    version: "3.0",
    parts: manifest.parts.map((part) => ({
      ...part,
      confidence: part.confidence ?? (part.polygon ? 0.65 : 0.35),
      source: part.source ?? "local",
    })),
    segmentOverrides: manifest.segmentOverrides ?? [],
  };
}

export function verifyManifest(manifest: CharacterManifest): boolean {
  const ids = new Set(manifest.joints.map((j) => j.id));
  if (ids.size !== manifest.joints.length) return false;
  for (const joint of manifest.joints) {
    if (joint.parent !== null && !ids.has(joint.parent)) return false;
  }
  const roots = manifest.joints.filter((j) => j.parent === null);
  if (roots.length !== 1) return false;

  const children = new Map<string, string[]>();
  for (const joint of manifest.joints) {
    if (joint.parent !== null) {
      const list = children.get(joint.parent) ?? [];
      list.push(joint.id);
      children.set(joint.parent, list);
    }
  }

  const visited = new Set<string>();
  const stack: string[] = [roots[0].id];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) return false;
    visited.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return visited.size === manifest.joints.length;
}

export function ensureValidParents(manifest: CharacterManifest): CharacterManifest {
  const present = new Set(manifest.joints.map((j) => j.id));
  for (const joint of manifest.joints) {
    if (joint.id === "root") {
      joint.parent = null;
      continue;
    }
    if (joint.parent === null) {
      joint.parent = FALLBACK_JOINT_PARENT[joint.id];
    }
    const fallback = FALLBACK_JOINT_PARENT[joint.id];
    if (joint.parent !== null && !present.has(joint.parent) && fallback && present.has(fallback)) {
      joint.parent = fallback;
    }
  }
  return manifest;
}

export function missingJoints(manifest: CharacterManifest): JointId[] {
  const present = new Set(manifest.joints.map((j) => j.id));
  return JOINT_IDS.filter((id) => !present.has(id));
}
