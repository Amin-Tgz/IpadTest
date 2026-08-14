import type { Rig, RigFaceGroup, RigPoint } from "./rig-builder.js";
import type { JointId } from "../app/constants.js";
import type { Camera } from "../world/camera.js";
import { inverseTransformWorldPoint, transformLocalPoint, type EntityTransform } from "./entity-transform.js";

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

const LOOK_MAX_OFFSET = 7;
const BLINK_INTERVAL_MS = 3200;
const BLINK_DURATION_MS = 140;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export class RigRuntime {
  private pose: RigPose = { ...EMPTY_POSE };
  private blinkAt: number;
  private blinkStarted = false;
  look: FaceLook = { targetX: null, targetY: null };
  talkActive = false;

  private jointsById = new Map<JointId, Rig["joints"][number]>();

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

  restJoint(id: JointId): { x: number; y: number } | null {
    return this.jointWorld(id);
  }

  jointLocal(id: JointId): { x: number; y: number } | null {
    const joint = this.jointsById.get(id);
    return joint ? { x: joint.restX, y: joint.restY } : null;
  }

  jointWorld(id: JointId): { x: number; y: number } | null {
    if (!this.jointsById.has(id)) return null;
    return this.localToWorld(this.fkPosition(id, new Map()));
  }

  jointScreen(id: JointId, camera: Camera): { x: number; y: number } | null {
    const world = this.jointWorld(id);
    return world ? camera.worldToScreen(world) : null;
  }

  get entityTransform(): EntityTransform {
    return { ...this.rig.transform };
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
    this.pose = pose;
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

  private transformPoint(point: RigPoint): { x: number; y: number } {
    const joint = this.jointsById.get(point.jointId);
    if (!joint) return { x: point.x, y: point.y };

    const accRotation = degToRad(this.accumulatedRotation(point.jointId, new Map()));
    const pos = this.fkPosition(point.jointId, new Map());
    const dx = point.x - joint.restX;
    const dy = point.y - joint.restY;
    const cos = Math.cos(accRotation);
    const sin = Math.sin(accRotation);
    return this.localToWorld({
      x: pos.x + dx * cos - dy * sin,
      y: pos.y + dx * sin + dy * cos,
    });
  }

  transformedStrokeSegments(): Array<Array<Array<{ x: number; y: number }>>> {
    const transformed = this.transformedStrokePoints();
    return transformed.map((points, strokeIndex) => {
      const source = this.rig.strokes[strokeIndex]?.points ?? [];
      if (points.length === 0) return [];
      const segments: Array<Array<{ x: number; y: number }>> = [];
      let current = [points[0]];
      for (let index = 1; index < points.length; index++) {
        if (source[index]?.jointId !== source[index - 1]?.jointId) {
          current.push(points[index]);
          if (current.length >= 2) segments.push(current);
          current = [points[index - 1], points[index]];
        } else {
          current.push(points[index]);
        }
      }
      if (current.length >= 2) segments.push(current);
      return segments;
    });
  }

  transformedStrokePoints(): Array<Array<{ x: number; y: number }>> {
    const timeMs = this.now();
    this.update(timeMs);
    const blink = this.blinkStarted;
    const lookTarget =
      this.look.targetX !== null && this.look.targetY !== null
        ? { x: this.look.targetX, y: this.look.targetY }
        : null;

    const groups = [this.rig.face.leftEye, this.rig.face.rightEye, this.rig.face.mouth].filter(
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

    return this.rig.strokes.map((stroke, strokeIndex) =>
      stroke.points.map((point) => {
        const transformed = this.transformPoint(point);
        const groupIndex = groupIndexOf(point, strokeIndex);
        if (groupIndex < 0) return transformed;
        const group = groups[groupIndex];
        const offset = this.faceOffset(group, lookTarget, blink);
        const groupWorld = this.localToWorld({ x: group.restX, y: group.restY });
        const relX = transformed.x - groupWorld.x;
        const relY = transformed.y - groupWorld.y;
        return {
          x: groupWorld.x + relX + offset.dx,
          y: groupWorld.y + relY * offset.scaleY + offset.dy,
        };
      }),
    );
  }

  private faceOffset(
    group: RigFaceGroup,
    lookTarget: { x: number; y: number } | null,
    blink: boolean,
  ): { dx: number; dy: number; scaleY: number } {
    let dx = 0;
    let dy = 0;
    let scaleY = 1;

    if (lookTarget) {
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

    const isEye = group === this.rig.face.leftEye || group === this.rig.face.rightEye;
    const isMouth = group === this.rig.face.mouth;
    if (isEye && blink) {
      scaleY = 0.12;
    }
    if (isMouth && this.talkActive) {
      scaleY = 1 + 0.35 * Math.abs(Math.sin(this.now() / 110));
    }

    return { dx, dy, scaleY };
  }

  private localToWorld(point: { x: number; y: number }): { x: number; y: number } {
    return transformLocalPoint(point, this.rig.transform);
  }

  worldToLocal(point: { x: number; y: number }): { x: number; y: number } {
    return inverseTransformWorldPoint(point, this.rig.transform);
  }
}
