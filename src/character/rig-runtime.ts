import type { Rig, RigFaceGroup, RigPoint } from "./rig-builder.js";
import type { JointId } from "../app/constants.js";
import type { Camera } from "../world/camera.js";
import { inverseTransformWorldPoint, transformLocalPoint, type EntityTransform } from "./entity-transform.js";
import { solveTwoBoneIK } from "../animation/two-bone-ik.js";

export interface RigPose {
  jointRotations: Partial<Record<JointId, number>>;
  rootDeltaX: number;
  rootDeltaY: number;
  rootRotation: number;
}

export const EMPTY_POSE: RigPose = {
  jointRotations: {},
  rootDeltaX: 0,
  rootDeltaY: 0,
  rootRotation: 0,
};

export interface FaceLook {
  targetX: number | null;
  targetY: number | null;
}

export type FaceExpression = "neutral" | "happy" | "sad" | "surprised";
export type PointingHand = "left" | "right";

const LOOK_MAX_OFFSET = 7;
const BLINK_INTERVAL_MS = 3200;
const BLINK_DURATION_MS = 140;
const FACE_DEFORM_RADIUS = 14;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export class RigRuntime {
  private pose: RigPose = { ...EMPTY_POSE };
  private blinkAt: number;
  private blinkStarted = false;
  look: FaceLook = { targetX: null, targetY: null };
  talkActive = false;
  voiceLevel = 0;
  expression: FaceExpression = "neutral";

  private jointsById = new Map<JointId, Rig["joints"][number]>();
  private ikRotations: Partial<Record<JointId, number>> = {};
  private pointing: { hand: PointingHand; target: { x: number; y: number } } | null = null;

  constructor(
    private readonly rig: Rig,
    private readonly now: () => number = () => performance.now(),
  ) {
    for (const joint of rig.joints) this.jointsById.set(joint.id, joint);
    this.blinkAt = this.now() + BLINK_INTERVAL_MS * (0.5 + Math.random());
  }

  get joints(): Rig["joints"] {
    return this.rig.joints;
  }

  get strokes(): Rig["strokes"] {
    return this.rig.strokes;
  }

  get face(): Rig["face"] {
    return this.rig.face;
  }

  faceAnchorWorld(kind: keyof Rig["face"]): { x: number; y: number } | null {
    const group = this.rig.face[kind];
    return group ? this.localToWorld({ x: group.restX, y: group.restY }) : null;
  }

  restJoint(id: JointId): { x: number; y: number } | null {
    return this.jointWorld(id);
  }

  jointLocal(id: JointId): { x: number; y: number } | null {
    const joint = this.jointsById.get(id);
    return joint ? { x: joint.restX, y: joint.restY } : null;
  }

  jointWorld(id: JointId): { x: number; y: number } | null {
    if (!this.jointsById.has(id)) return null;
    if (this.pointing && id === `${this.pointing.hand}_index_tip`) {
      return this.pointingFingerGeometry(this.pointing.hand)?.tip ?? null;
    }
    return this.localToWorld(this.fkPosition(id, new Map()));
  }

  get pointingHand(): PointingHand | null {
    return this.pointing?.hand ?? null;
  }

  pointAt(targetWorld: { x: number; y: number }): PointingHand | null {
    const left = this.jointWorld("left_hand");
    const right = this.jointWorld("right_hand");
    if (!left || !right || !Number.isFinite(targetWorld.x) || !Number.isFinite(targetWorld.y)) return null;
    const hand: PointingHand = distance(left, targetWorld) <= distance(right, targetWorld) ? "left" : "right";
    const aimed = hand === "left"
      ? this.aimLimb("left_shoulder", "left_elbow", "left_hand", targetWorld, 1)
      : this.aimLimb("right_shoulder", "right_elbow", "right_hand", targetWorld, -1);
    if (!aimed) return null;
    this.pointing = { hand, target: { ...targetWorld } };
    this.look = { targetX: targetWorld.x, targetY: targetWorld.y };
    return hand;
  }

  clearPointing(): void {
    this.pointing = null;
    this.clearIK();
    this.look = { targetX: null, targetY: null };
  }

  jointScreen(id: JointId, camera: Camera): { x: number; y: number } | null {
    const world = this.jointWorld(id);
    return world ? camera.worldToScreen(world) : null;
  }

  get entityTransform(): EntityTransform {
    return { ...this.rig.transform };
  }

  get proportionScale(): number {
    const ys = this.rig.joints.map((joint) => joint.restY);
    const height = ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 300;
    return Math.max(0.65, Math.min(2.25, height / 300));
  }

  setEntityTransform(transform: EntityTransform): void {
    this.rig.transform = { ...transform };
  }

  moveEntityTo(x: number, y: number): void {
    this.rig.transform.x = x;
    this.rig.transform.y = y;
  }

  boneToWorld(boneId: JointId, local: { x: number; y: number }): { x: number; y: number } {
    const pos = this.fkPosition(boneId, new Map());
    const rotation = degToRad(this.accumulatedRotation(boneId, new Map()));
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return this.localToWorld({
      x: pos.x + local.x * cos - local.y * sin,
      y: pos.y + local.x * sin + local.y * cos,
    });
  }

  applyPose(pose: RigPose): void {
    this.pose = { ...pose, jointRotations: { ...pose.jointRotations, ...this.ikRotations } };
  }

  aimLimb(
    rootId: JointId,
    middleId: JointId,
    endId: JointId,
    targetWorld: { x: number; y: number },
    bendDirection: -1 | 1 = 1,
  ): boolean {
    const root = this.jointsById.get(rootId);
    const middle = this.jointsById.get(middleId);
    const end = this.jointsById.get(endId);
    if (!root || !middle || !end) return false;
    const target = this.worldToLocal(targetWorld);
    const solution = solveTwoBoneIK(
      { x: root.restX, y: root.restY },
      { x: middle.restX, y: middle.restY },
      { x: end.restX, y: end.restY },
      target,
      bendDirection,
    );
    this.ikRotations[rootId] = solution.rootRotation;
    this.ikRotations[middleId] = solution.jointRotation;
    return true;
  }

  clearIK(): void {
    this.ikRotations = {};
  }

  update(timeMs: number): void {
    if (this.blinkStarted) {
      if (timeMs - this.blinkAt >= BLINK_DURATION_MS) {
        this.blinkStarted = false;
        this.blinkAt = timeMs + BLINK_INTERVAL_MS * (0.7 + Math.random() * 0.6);
      }
    } else if (timeMs >= this.blinkAt) {
      this.blinkStarted = true;
    }
  }

  private accumulatedRotation(
    jointId: JointId,
    memo: Map<JointId, number>,
  ): number {
    const cached = memo.get(jointId);
    if (cached !== undefined) return cached;
    const joint = this.jointsById.get(jointId);
    if (!joint) return 0;
    const own = (this.pose.jointRotations[jointId] ?? 0) + (joint.parent === null ? this.pose.rootRotation : 0);
    const total = (joint.parent ? this.accumulatedRotation(joint.parent, memo) : 0) + own;
    memo.set(jointId, total);
    return total;
  }

  private fkPosition(
    jointId: JointId,
    memo: Map<JointId, { x: number; y: number }>,
  ): { x: number; y: number } {
    const cached = memo.get(jointId);
    if (cached) return cached;

    const joint = this.jointsById.get(jointId);
    if (!joint) return { x: 0, y: 0 };

    if (!joint.parent) {
      const p = {
        x: joint.restX + this.pose.rootDeltaX,
        y: joint.restY + this.pose.rootDeltaY,
      };
      memo.set(jointId, p);
      return p;
    }

    const parentPos = this.fkPosition(joint.parent, memo);
    const parentRotation = degToRad(this.accumulatedRotation(joint.parent, new Map()));
    const parentJoint = this.jointsById.get(joint.parent);
    if (!parentJoint) return parentPos;
    const dx = joint.restX - parentJoint.restX;
    const dy = joint.restY - parentJoint.restY;
    const cos = Math.cos(parentRotation);
    const sin = Math.sin(parentRotation);
    const p = {
      x: parentPos.x + dx * cos - dy * sin,
      y: parentPos.y + dx * sin + dy * cos,
    };
    memo.set(jointId, p);
    return p;
  }

  private transformPointByJoint(point: RigPoint, jointId: JointId): { x: number; y: number } {
    const joint = this.jointsById.get(jointId);
    if (!joint) return { x: point.x, y: point.y };

    const accRotation = degToRad(this.accumulatedRotation(jointId, new Map()));
    const pos = this.fkPosition(jointId, new Map());
    const dx = point.x - joint.restX;
    const dy = point.y - joint.restY;
    const cos = Math.cos(accRotation);
    const sin = Math.sin(accRotation);
    return {
      x: pos.x + dx * cos - dy * sin,
      y: pos.y + dx * sin + dy * cos,
    };
  }

  private transformPoint(point: RigPoint): { x: number; y: number } {
    const influences = point.influences?.length
      ? point.influences
      : [{ jointId: point.jointId, weight: 1 }];
    let x = 0;
    let y = 0;
    let total = 0;
    for (const influence of influences) {
      const transformed = this.transformPointByJoint(point, influence.jointId);
      x += transformed.x * influence.weight;
      y += transformed.y * influence.weight;
      total += influence.weight;
    }
    const local = total > 0 ? { x: x / total, y: y / total } : { x: point.x, y: point.y };
    return this.localToWorld(local);
  }

  transformedStrokeSegments(): Array<Array<Array<{ x: number; y: number }>>> {
    const transformed = this.transformedStrokePoints();
    // Weighted skinning keeps adjacent samples continuous across a joint, so
    // splitting a user's stroke at ownership boundaries would create cracks.
    return transformed.map((points) => points.length >= 2 ? [points] : []);
  }

  transformedStrokePoints(): Array<Array<{ x: number; y: number }>> {
    const timeMs = this.now();
    this.update(timeMs);
    const blink = this.blinkStarted;
    const lookTarget =
      this.look.targetX !== null && this.look.targetY !== null
        ? { x: this.look.targetX, y: this.look.targetY }
        : null;

    const groups = [
      this.rig.face.leftEye,
      this.rig.face.rightEye,
      this.rig.face.leftEyebrow,
      this.rig.face.rightEyebrow,
      this.rig.face.mouth,
    ].filter(
      (g): g is RigFaceGroup => g !== null,
    );

    const groupIndexOf = (point: RigPoint, stroke: number): number => {
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        for (const ref of group.points) {
          if (ref.stroke === stroke && this.rig.strokes[stroke].points[ref.point] === point) {
            return i;
          }
        }
      }
      return -1;
    };

    const transformed = this.rig.strokes.map((stroke, strokeIndex) =>
      stroke.points.map((point) => {
        const transformed = this.transformPoint(point);
        const groupIndex = groupIndexOf(point, strokeIndex);
        if (groupIndex < 0) return transformed;
        const group = groups[groupIndex];
        const offset = this.faceOffset(group, lookTarget, blink);
        const groupWorld = this.localToWorld({ x: group.restX, y: group.restY });
        const relX = transformed.x - groupWorld.x;
        const relY = transformed.y - groupWorld.y;
        const normalizedX = Math.max(-1, Math.min(1, relX / FACE_DEFORM_RADIUS));
        return {
          x: groupWorld.x + relX * offset.scaleX + offset.dx,
          y: groupWorld.y + relY * offset.scaleY + offset.dy + offset.curveY * (1 - normalizedX * normalizedX),
        };
      }),
    );
    const authoredLimbs: Array<[string, JointId, JointId, JointId]> = [
      ["hero_left_arm", "left_shoulder", "left_elbow", "left_hand"],
      ["hero_right_arm", "right_shoulder", "right_elbow", "right_hand"],
      ["hero_left_leg", "left_hip", "left_knee", "left_foot"],
      ["hero_right_leg", "right_hip", "right_knee", "right_foot"],
    ];
    for (const [strokeId, startId, middleId, endId] of authoredLimbs) {
      const strokeIndex = this.rig.strokes.findIndex((stroke) => stroke.id === strokeId);
      if (strokeIndex < 0) continue;
      const start = transformed[strokeIndex]?.[0] ?? this.jointWorld(startId);
      const middle = this.jointWorld(middleId);
      const end = this.jointWorld(endId);
      if (!start || !middle || !end) continue;
      transformed[strokeIndex] = smoothLimb(start, middle, end, this.rig.strokes[strokeIndex].points.length);
    }
    if (this.pointing) this.applyPointingFingers(transformed, this.pointing.hand);
    return transformed;
  }

  private applyPointingFingers(transformed: Array<Array<{ x: number; y: number }>>, hand: PointingHand): void {
    const geometry = this.pointingFingerGeometry(hand);
    if (!geometry) return;
    const indexStroke = this.rig.strokes.findIndex((stroke) => stroke.id === `hero_${hand}_index`);
    const thumbStroke = this.rig.strokes.findIndex((stroke) => stroke.id === `hero_${hand}_thumb`);
    if (indexStroke >= 0) {
      transformed[indexStroke] = curvedFinger(geometry.hand, geometry.tip, geometry.normal, this.rig.strokes[indexStroke].points.length);
    }
    if (thumbStroke >= 0) {
      const curlTip = {
        x: geometry.hand.x + geometry.unit.x * 4 + geometry.normal.x * 7,
        y: geometry.hand.y + geometry.unit.y * 4 + geometry.normal.y * 7,
      };
      transformed[thumbStroke] = curvedFinger(geometry.hand, curlTip, { x: -geometry.unit.x, y: -geometry.unit.y }, this.rig.strokes[thumbStroke].points.length, 3.5);
    }
  }

  private pointingFingerGeometry(hand: PointingHand): {
    hand: { x: number; y: number };
    tip: { x: number; y: number };
    unit: { x: number; y: number };
    normal: { x: number; y: number };
  } | null {
    if (!this.pointing) return null;
    const handJoint = this.jointsById.get(`${hand}_hand` as JointId);
    if (!handJoint) return null;
    const handWorld = this.localToWorld(this.fkPosition(handJoint.id, new Map()));
    const dx = this.pointing.target.x - handWorld.x;
    const dy = this.pointing.target.y - handWorld.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return null;
    const unit = { x: dx / length, y: dy / length };
    const normalSign = hand === "left" ? -1 : 1;
    const normal = { x: -unit.y * normalSign, y: unit.x * normalSign };
    const transform = this.rig.transform;
    const fingerLength = 15 * (Math.abs(transform.scaleX) + Math.abs(transform.scaleY)) / 2;
    return {
      hand: handWorld,
      tip: { x: handWorld.x + unit.x * fingerLength, y: handWorld.y + unit.y * fingerLength },
      unit,
      normal,
    };
  }

  private faceOffset(
    group: RigFaceGroup,
    lookTarget: { x: number; y: number } | null,
    blink: boolean,
  ): { dx: number; dy: number; scaleX: number; scaleY: number; curveY: number } {
    let dx = 0;
    let dy = 0;
    let scaleX = 1;
    let scaleY = 1;
    let curveY = 0;

    const isEye = group.kind === "leftEye" || group.kind === "rightEye";
    const isEyebrow = group.kind === "leftEyebrow" || group.kind === "rightEyebrow";
    const isMouth = group.kind === "mouth";
    if (lookTarget && isEye) {
      const groupWorld = this.localToWorld({ x: group.restX, y: group.restY });
      const wx = lookTarget.x - groupWorld.x;
      const wy = lookTarget.y - groupWorld.y;
      const dist = Math.hypot(wx, wy);
      if (dist > 0.001) {
        const len = Math.min(LOOK_MAX_OFFSET, dist * 0.18);
        dx = (wx / dist) * len;
        dy = (wy / dist) * len;
      }
    }

    if (isEye && blink) {
      scaleY = 0.12;
    }
    if (isEyebrow) {
      if (this.expression === "surprised") dy -= 5;
      else if (this.expression === "happy") dy -= 2;
      else if (this.expression === "sad") {
        dy += 2;
        dx += group.kind === "leftEyebrow" ? 2 : -2;
      }
    }
    if (isMouth && this.talkActive) {
      const e = Math.max(0, Math.min(1, this.voiceLevel));
      if (e < 0.08) {
        scaleX = 0.96;
        scaleY = 0.55;
      } else if (e < 0.32) {
        const t = (e - 0.08) / 0.24;
        scaleX = 0.96 + (0.82 - 0.96) * t;
        scaleY = 0.55 + (1.05 - 0.55) * t;
        curveY = 1.1 * t;
      } else if (e < 0.62) {
        const t = (e - 0.32) / 0.3;
        scaleX = 0.82 + (1.16 - 0.82) * t;
        scaleY = 1.05 + (0.72 - 1.05) * t;
        curveY = 1.1 + (3.2 - 1.1) * t;
      } else {
        const t = (e - 0.62) / 0.38;
        scaleX = 1.16 + (0.58 - 1.16) * t;
        scaleY = 0.72 + (1.65 - 0.72) * t;
        curveY = 3.2 * (1 - t * 0.45);
      }
    } else if (isMouth && this.expression === "happy") {
      scaleX = 1.12;
      scaleY = 0.78;
      curveY = 3.5;
    }

    return { dx, dy, scaleX, scaleY, curveY };
  }

  private localToWorld(point: { x: number; y: number }): { x: number; y: number } {
    return transformLocalPoint(point, this.rig.transform);
  }

  worldToLocal(point: { x: number; y: number }): { x: number; y: number } {
    return inverseTransformWorldPoint(point, this.rig.transform);
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function curvedFinger(
  start: { x: number; y: number },
  end: { x: number; y: number },
  normal: { x: number; y: number },
  count: number,
  bend = 1.2,
): Array<{ x: number; y: number }> {
  const pointCount = Math.max(6, count);
  return Array.from({ length: pointCount }, (_, index) => {
    const t = index / (pointCount - 1);
    const curve = Math.sin(Math.PI * t) * bend;
    return {
      x: start.x + (end.x - start.x) * t + normal.x * curve,
      y: start.y + (end.y - start.y) * t + normal.y * curve,
    };
  });
}

function smoothLimb(
  start: { x: number; y: number },
  middle: { x: number; y: number },
  end: { x: number; y: number },
  count: number,
): Array<{ x: number; y: number }> {
  const control = {
    x: 2 * middle.x - (start.x + end.x) / 2,
    y: 2 * middle.y - (start.y + end.y) / 2,
  };
  const pointCount = Math.max(8, count);
  return Array.from({ length: pointCount }, (_, index) => {
    const t = index / (pointCount - 1);
    const u = 1 - t;
    return {
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
    };
  });
}
