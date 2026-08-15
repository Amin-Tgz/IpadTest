import type { StrokeStore, Stroke } from "../drawing/stroke-store.js";
import { resampleUniform } from "../drawing/stroke-resampler.js";
import type { CharacterManifest, JointManifest, FaceManifest, PartManifest } from "./character-manifest.js";
import type { JointId } from "../app/constants.js";
import type { EntityTransform } from "./entity-transform.js";

export interface RigJoint {
  id: JointId;
  restX: number;
  restY: number;
  parent: JointId | null;
}

export interface RigPoint {
  x: number;
  y: number;
  pressure: number;
  /** Dominant semantic bone, retained for editor and manifest compatibility. */
  jointId: JointId;
  /** One or two deformation bones. Weights always sum to one. */
  influences: Array<{ jointId: JointId; weight: number }>;
}

export interface RigStroke {
  id: string;
  color: string;
  baseWidth: number;
  points: RigPoint[];
}

export interface RigFaceGroup {
  kind: "leftEye" | "rightEye" | "leftEyebrow" | "rightEyebrow" | "mouth";
  jointId: JointId;
  restX: number;
  restY: number;
  points: Array<{ stroke: number; point: number }>;
}

export interface RigFace {
  leftEye: RigFaceGroup | null;
  rightEye: RigFaceGroup | null;
  leftEyebrow: RigFaceGroup | null;
  rightEyebrow: RigFaceGroup | null;
  mouth: RigFaceGroup | null;
}

export interface Rig {
  joints: RigJoint[];
  strokes: RigStroke[];
  face: RigFace;
  transform: EntityTransform;
}

const FACE_RADIUS = 14;

export function buildRig(manifest: CharacterManifest, store: StrokeStore): Rig {
  const root = manifest.joints.find((joint) => joint.parent === null) ?? manifest.joints[0];
  const origin = root ? { x: root.x, y: root.y } : { x: 0, y: 0 };
  const joints: RigJoint[] = manifest.joints.map((j: JointManifest) => ({
    id: j.id,
    restX: j.x - origin.x,
    restY: j.y - origin.y,
    parent: j.parent,
  }));

  const strokes = store
    .all()
    .filter((s) => s.active && manifest.includedStrokeIds.includes(s.id));

  const baseStrokes = strokes.map((s) => buildRigStroke(s, joints, manifest, origin));
  const face = buildFace(toLocalFace(manifest.face, origin), baseStrokes, joints);
  const rigStrokes = [...baseStrokes, ...buildAutomaticConnectors(baseStrokes, joints)];

  return {
    joints,
    strokes: rigStrokes,
    face,
    transform: { x: origin.x, y: origin.y, rotation: 0, scaleX: 1, scaleY: 1 },
  };
}

function buildAutomaticConnectors(strokes: RigStroke[], joints: RigJoint[]): RigStroke[] {
  const ys = joints.map((joint) => joint.restY);
  const characterHeight = ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 200;
  const maxDistance = Math.max(10, Math.min(36, characterHeight * 0.075));
  const endpoints = strokes.flatMap((stroke, strokeIndex) => {
    if (stroke.points.length < 2) return [];
    return [0, stroke.points.length - 1].map((pointIndex) => ({
      strokeIndex,
      pointIndex,
      point: stroke.points[pointIndex],
      stroke,
    }));
  }).filter((endpoint) => endpoint.point.jointId !== "head");
  const candidates: Array<{ a: number; b: number; distance: number }> = [];
  for (let a = 0; a < endpoints.length; a++) {
    for (let b = a + 1; b < endpoints.length; b++) {
      const left = endpoints[a];
      const right = endpoints[b];
      if (left.strokeIndex === right.strokeIndex || !compatibleBones(left.point.jointId, right.point.jointId, joints)) continue;
      const distance = Math.hypot(left.point.x - right.point.x, left.point.y - right.point.y);
      if (distance > 1.5 && distance <= maxDistance) candidates.push({ a, b, distance });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  const used = new Set<number>();
  const connectors: RigStroke[] = [];
  for (const candidate of candidates) {
    if (used.has(candidate.a) || used.has(candidate.b)) continue;
    const left = endpoints[candidate.a];
    const right = endpoints[candidate.b];
    used.add(candidate.a);
    used.add(candidate.b);
    const jointId = left.point.jointId === right.point.jointId ? left.point.jointId : childBone(left.point.jointId, right.point.jointId, joints);
    connectors.push({
      id: `auto_connector_${left.stroke.id}_${right.stroke.id}`,
      color: left.stroke.color,
      baseWidth: (left.stroke.baseWidth + right.stroke.baseWidth) / 2,
      points: [
        { ...left.point, jointId, influences: [{ jointId, weight: 1 }] },
        { ...right.point, jointId, influences: [{ jointId, weight: 1 }] },
      ],
    });
  }
  return connectors;
}

function compatibleBones(left: JointId, right: JointId, joints: RigJoint[]): boolean {
  if (left === right) return true;
  const leftJoint = joints.find((joint) => joint.id === left);
  const rightJoint = joints.find((joint) => joint.id === right);
  return leftJoint?.parent === right || rightJoint?.parent === left;
}

function childBone(left: JointId, right: JointId, joints: RigJoint[]): JointId {
  return joints.find((joint) => joint.id === left)?.parent === right ? left : right;
}

export function nearestJoint(
  x: number,
  y: number,
  joints: RigJoint[],
): RigJoint | null {
  let best: RigJoint | null = null;
  let bestDist = Infinity;
  for (const joint of joints) {
    const dist = Math.hypot(x - joint.restX, y - joint.restY);
    if (dist < bestDist) {
      bestDist = dist;
      best = joint;
    }
  }
  return best;
}

function buildRigStroke(
  stroke: Stroke,
  joints: RigJoint[],
  manifest: CharacterManifest,
  origin: { x: number; y: number },
): RigStroke {
  const points: RigPoint[] = stroke.points.map((p) => {
    const local = { x: p.x - origin.x, y: p.y - origin.y };
    const part = partAtPoint(p, stroke.id, manifest);
    const candidates = partCandidates(part, joints);
    const influences = pointInfluences(local.x, local.y, candidates, joints);
    const nearest = influences[0];
    return {
      x: local.x,
      y: local.y,
      pressure: p.pressure,
      jointId: nearest?.jointId ?? ("root" as JointId),
      influences: influences.length > 0 ? influences : [{ jointId: "root" as JointId, weight: 1 }],
    };
  });
  // Remove isolated ownership flicker caused by overlapping polygons or a
  // single sample crossing a joint boundary. Real transitions remain intact.
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (previous.jointId === next.jointId && current.jointId !== previous.jointId) {
      current.jointId = previous.jointId;
      current.influences = previous.influences.map((influence) => ({ ...influence }));
    }
  }
  return {
    id: stroke.id,
    color: stroke.color,
    baseWidth: stroke.baseWidth,
    points,
  };
}

export function pointInfluences(
  x: number,
  y: number,
  candidates: RigJoint[],
  allJoints: RigJoint[] = candidates,
): Array<{ jointId: JointId; weight: number }> {
  const ranked = candidates
    .map((joint) => ({ joint, distance: Math.hypot(x - joint.restX, y - joint.restY) }))
    .sort((a, b) => a.distance - b.distance);
  const primary = ranked[0];
  if (!primary) return [];
  const secondary = ranked.find((entry, index) => index > 0 && compatibleBones(primary.joint.id, entry.joint.id, allJoints));
  if (!secondary) return [{ jointId: primary.joint.id, weight: 1 }];
  const ys = allJoints.map((joint) => joint.restY);
  const characterHeight = ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 200;
  const blendRadius = Math.max(20, Math.min(60, characterHeight * 0.3));
  if (primary.distance > blendRadius || secondary.distance > blendRadius * 1.35) {
    return [{ jointId: primary.joint.id, weight: 1 }];
  }
  const inversePrimary = 1 / Math.max(1, primary.distance);
  const inverseSecondary = 1 / Math.max(1, secondary.distance);
  const total = inversePrimary + inverseSecondary;
  const primaryWeight = Math.max(0.58, inversePrimary / total);
  return [
    { jointId: primary.joint.id, weight: primaryWeight },
    { jointId: secondary.joint.id, weight: 1 - primaryWeight },
  ];
}

function partAtPoint(
  point: { x: number; y: number },
  strokeId: string,
  manifest: CharacterManifest,
): string | undefined {
  for (let index = (manifest.segmentOverrides?.length ?? 0) - 1; index >= 0; index--) {
    const override = manifest.segmentOverrides![index];
    if (pointInPolygon(point, override.polygon)) return override.part;
  }
  const region = manifest.parts
    .filter((part) => part.strokeIds.includes(strokeId) && part.polygon && pointInPolygon(point, part.polygon))
    .sort((left, right) => {
      const sourceBoost = (part: PartManifest) => part.source === "local" ? 0.08 : 0;
      const leftArea = polygonArea(left.polygon!);
      const rightArea = polygonArea(right.polygon!);
      return ((right.confidence ?? 0.5) + sourceBoost(right) - Math.log1p(rightArea) * 0.015) -
        ((left.confidence ?? 0.5) + sourceBoost(left) - Math.log1p(leftArea) * 0.015);
    })[0];
  return region?.part ?? manifest.parts.find((part) => part.strokeIds.includes(strokeId))?.part;
}

function polygonArea(polygon: Array<{ x: number; y: number }>): number {
  let area = 0;
  for (let index = 0; index < polygon.length; index++) {
    const next = polygon[(index + 1) % polygon.length];
    area += polygon[index].x * next.y - next.x * polygon[index].y;
  }
  return Math.abs(area) / 2;
}

export function pointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function toLocalFace(face: FaceManifest, origin: { x: number; y: number }): FaceManifest {
  const local = (point: { x: number; y: number } | undefined) =>
    point ? { x: point.x - origin.x, y: point.y - origin.y } : undefined;
  return {
    leftEye: local(face.leftEye),
    rightEye: local(face.rightEye),
    leftEyebrow: local(face.leftEyebrow),
    rightEyebrow: local(face.rightEyebrow),
    mouth: local(face.mouth),
  };
}

function partCandidates(part: string | undefined, joints: RigJoint[]): RigJoint[] {
  const names = part?.toLowerCase() ?? "";
  const matching = joints.filter((joint) => {
    if (names.includes("eyebrow") || names.includes("brow") || names.includes("head") || names.includes("hair") || names.includes("hat")) return joint.id === "head";
    if (names.includes("finger") || names.includes("thumb")) {
      const digit = names.includes("thumb") ? "thumb_tip" : "index_tip";
      if (names.includes("left")) return joint.id === `left_${digit}` || joint.id === "left_hand";
      if (names.includes("right")) return joint.id === `right_${digit}` || joint.id === "right_hand";
      return joint.id.endsWith(digit) || joint.id === "left_hand" || joint.id === "right_hand";
    }
    if (names.includes("left") && (names.includes("arm") || names.includes("hand"))) return joint.id.startsWith("left_") && (joint.id.includes("shoulder") || joint.id.includes("elbow") || joint.id.includes("hand"));
    if (names.includes("right") && (names.includes("arm") || names.includes("hand"))) return joint.id.startsWith("right_") && (joint.id.includes("shoulder") || joint.id.includes("elbow") || joint.id.includes("hand"));
    if (names.includes("left") && (names.includes("leg") || names.includes("foot"))) return joint.id.startsWith("left_") && (joint.id.includes("hip") || joint.id.includes("knee") || joint.id.includes("foot"));
    if (names.includes("right") && (names.includes("leg") || names.includes("foot"))) return joint.id.startsWith("right_") && (joint.id.includes("hip") || joint.id.includes("knee") || joint.id.includes("foot"));
    return names.includes("torso") || names.includes("body") ? joint.id === "root" || joint.id === "torso" : false;
  });
  return matching.length > 0 ? matching : joints;
}

function buildFace(
  face: FaceManifest,
  rigStrokes: RigStroke[],
  joints: RigJoint[],
): RigFace {
  const headX = joints.find((joint) => joint.id === "head")?.restX ?? 0;
  const mirror = (point: { x: number; y: number }) => ({ x: headX * 2 - point.x, y: point.y });
  const anchors: FaceManifest = { ...face };
  if (!anchors.leftEye && anchors.rightEye) anchors.leftEye = mirror(anchors.rightEye);
  if (!anchors.rightEye && anchors.leftEye) anchors.rightEye = mirror(anchors.leftEye);
  if (!anchors.leftEyebrow && anchors.rightEyebrow) anchors.leftEyebrow = mirror(anchors.rightEyebrow);
  if (!anchors.rightEyebrow && anchors.leftEyebrow) anchors.rightEyebrow = mirror(anchors.leftEyebrow);

  const kinds = ["leftEye", "rightEye", "leftEyebrow", "rightEyebrow", "mouth"] as const;
  const groups = new Map<(typeof kinds)[number], RigFaceGroup>();
  for (const kind of kinds) {
    const anchor = anchors[kind];
    if (anchor) groups.set(kind, { kind, jointId: "head", restX: anchor.x, restY: anchor.y, points: [] });
  }

  // A point belongs to only its nearest facial feature. This prevents two
  // close eyes from sharing ink and makes a blink affect both independently.
  rigStrokes.forEach((rigStroke, strokeIndex) => {
    rigStroke.points.forEach((point, pointIndex) => {
      let nearest: RigFaceGroup | null = null;
      let distance = FACE_RADIUS;
      for (const group of groups.values()) {
        const candidate = Math.hypot(point.x - group.restX, point.y - group.restY);
        if (candidate <= distance) {
          nearest = group;
          distance = candidate;
        }
      }
      nearest?.points.push({ stroke: strokeIndex, point: pointIndex });
    });
  });

  const populated = (kind: (typeof kinds)[number]): RigFaceGroup | null => {
    const group = groups.get(kind);
    return group && group.points.length > 0 ? group : null;
  };
  return {
    leftEye: populated("leftEye"),
    rightEye: populated("rightEye"),
    leftEyebrow: populated("leftEyebrow"),
    rightEyebrow: populated("rightEyebrow"),
    mouth: populated("mouth"),
  };
}
