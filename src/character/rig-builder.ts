import type { StrokeStore, Stroke } from "../drawing/stroke-store.js";
import { resampleUniform } from "../drawing/stroke-resampler.js";
import type { CharacterManifest, JointManifest, FaceManifest } from "./character-manifest.js";
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
  jointId: JointId;
}

export interface RigStroke {
  id: string;
  color: string;
  baseWidth: number;
  points: RigPoint[];
}

export interface RigFaceGroup {
  jointId: JointId;
  restX: number;
  restY: number;
  points: Array<{ stroke: number; point: number }>;
}

export interface RigFace {
  leftEye: RigFaceGroup | null;
  rightEye: RigFaceGroup | null;
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

  const rigStrokes = strokes.map((s) => buildRigStroke(s, joints, manifest, origin));

  const face = buildFace(toLocalFace(manifest.face, origin), rigStrokes, joints);

  return {
    joints,
    strokes: rigStrokes,
    face,
    transform: { x: origin.x, y: origin.y, rotation: 0, scaleX: 1, scaleY: 1 },
  };
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
  return {
    id: stroke.id,
    color: stroke.color,
    baseWidth: stroke.baseWidth,
    points: stroke.points.map((p) => {
      const local = { x: p.x - origin.x, y: p.y - origin.y };
      const part = partAtPoint(p, stroke.id, manifest);
      const candidates = partCandidates(part, joints);
      const nearest = nearestJoint(local.x, local.y, candidates);
      return {
        x: local.x,
        y: local.y,
        pressure: p.pressure,
        jointId: nearest ? nearest.id : ("root" as JointId),
      };
    }),
  };
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
  const region = manifest.parts.find((part) =>
    part.strokeIds.includes(strokeId) && part.polygon && pointInPolygon(point, part.polygon),
  );
  return region?.part ?? manifest.parts.find((part) => part.strokeIds.includes(strokeId))?.part;
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
  return { leftEye: local(face.leftEye), rightEye: local(face.rightEye), mouth: local(face.mouth) };
}

function partCandidates(part: string | undefined, joints: RigJoint[]): RigJoint[] {
  const names = part?.toLowerCase() ?? "";
  const matching = joints.filter((joint) => {
    if (names.includes("head") || names.includes("hair") || names.includes("hat")) return joint.id === "head";
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
  const collect = (
    anchor: { x: number; y: number } | undefined,
    jointId: JointId,
  ): RigFaceGroup | null => {
    if (!anchor) return null;
    const points: Array<{ stroke: number; point: number }> = [];
    rigStrokes.forEach((rigStroke, strokeIndex) => {
      rigStroke.points.forEach((p, pointIndex) => {
        if (Math.hypot(p.x - anchor.x, p.y - anchor.y) <= FACE_RADIUS) {
          points.push({ stroke: strokeIndex, point: pointIndex });
        }
      });
    });
    return { jointId, restX: anchor.x, restY: anchor.y, points };
  };

  return {
    leftEye: collect(face.leftEye, "head"),
    rightEye: collect(face.rightEye, "head"),
    mouth: collect(face.mouth, "head"),
  };
}
