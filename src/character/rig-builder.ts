import type { StrokeStore, Stroke } from "../drawing/stroke-store.js";
import { resampleUniform } from "../drawing/stroke-resampler.js";
import type { CharacterManifest, JointManifest, FaceManifest } from "./character-manifest.js";
import type { JointId } from "../app/constants.js";

export interface RigJoint {
  id: JointId;
  restX: number;
  restY: number;
  parent: JointId | null;
}

export interface RigPoint {
  x: number;
  y: number;
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
}

const FACE_RADIUS = 14;

export function buildRig(manifest: CharacterManifest, store: StrokeStore): Rig {
  const joints: RigJoint[] = manifest.joints.map((j: JointManifest) => ({
    id: j.id,
    restX: j.x,
    restY: j.y,
    parent: j.parent,
  }));

  const strokes = store
    .all()
    .filter((s) => s.active && manifest.includedStrokeIds.includes(s.id));

  const includedIds = new Set(manifest.includedStrokeIds);
  const rigStrokes = strokes.map((s) => buildRigStroke(s, joints, includedIds));

  const face = buildFace(manifest.face, rigStrokes, joints);

  return { joints, strokes: rigStrokes, face };
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
  includedIds: Set<string>,
): RigStroke {
  const resampled = resampleUniform(stroke.points, 6).points;
  return {
    id: stroke.id,
    color: stroke.color,
    baseWidth: stroke.baseWidth,
    points: resampled.map((p) => {
      const nearest = nearestJoint(p.x, p.y, joints);
      return {
        x: p.x,
        y: p.y,
        jointId: nearest ? nearest.id : ("root" as JointId),
      };
    }),
  };
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
