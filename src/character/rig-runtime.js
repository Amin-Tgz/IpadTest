export const EMPTY_POSE = {
    jointRotations: {},
    rootDeltaX: 0,
    rootDeltaY: 0,
    rootRotation: 0,
};
const LOOK_MAX_OFFSET = 7;
const BLINK_INTERVAL_MS = 3200;
const BLINK_DURATION_MS = 140;
function degToRad(deg) {
    return (deg * Math.PI) / 180;
}
export class RigRuntime {
    rig;
    now;
    pose = { ...EMPTY_POSE };
    blinkAt;
    blinkStarted = false;
    look = { targetX: null, targetY: null };
    talkActive = false;
    jointsById = new Map();
    constructor(rig, now = () => performance.now()) {
        this.rig = rig;
        this.now = now;
        for (const joint of rig.joints)
            this.jointsById.set(joint.id, joint);
        this.blinkAt = this.now() + BLINK_INTERVAL_MS * (0.5 + Math.random());
    }
    get joints() {
        return this.rig.joints;
    }
    get strokes() {
        return this.rig.strokes;
    }
    get face() {
        return this.rig.face;
    }
    restJoint(id) {
        const joint = this.jointsById.get(id);
        return joint ? { x: joint.restX, y: joint.restY } : null;
    }
    boneToWorld(boneId, local) {
        const pos = this.fkPosition(boneId, new Map());
        const rotation = degToRad(this.accumulatedRotation(boneId, new Map()));
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        return {
            x: pos.x + local.x * cos - local.y * sin,
            y: pos.y + local.x * sin + local.y * cos,
        };
    }
    applyPose(pose) {
        this.pose = pose;
    }
    update(timeMs) {
        if (this.blinkStarted) {
            if (timeMs - this.blinkAt >= BLINK_DURATION_MS) {
                this.blinkStarted = false;
                this.blinkAt = timeMs + BLINK_INTERVAL_MS * (0.7 + Math.random() * 0.6);
            }
        }
        else if (timeMs >= this.blinkAt) {
            this.blinkStarted = true;
        }
    }
    accumulatedRotation(jointId, memo) {
        const cached = memo.get(jointId);
        if (cached !== undefined)
            return cached;
        const joint = this.jointsById.get(jointId);
        if (!joint)
            return 0;
        const own = this.pose.jointRotations[jointId] ?? 0;
        const total = (joint.parent ? this.accumulatedRotation(joint.parent, memo) : 0) + own;
        memo.set(jointId, total);
        return total;
    }
    fkPosition(jointId, memo) {
        const cached = memo.get(jointId);
        if (cached)
            return cached;
        const joint = this.jointsById.get(jointId);
        if (!joint)
            return { x: 0, y: 0 };
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
        if (!parentJoint)
            return parentPos;
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
    transformPoint(point) {
        const joint = this.jointsById.get(point.jointId);
        if (!joint)
            return { x: point.x, y: point.y };
        const accRotation = degToRad(this.accumulatedRotation(point.jointId, new Map()));
        const pos = this.fkPosition(point.jointId, new Map());
        const dx = point.x - joint.restX;
        const dy = point.y - joint.restY;
        const cos = Math.cos(accRotation);
        const sin = Math.sin(accRotation);
        return {
            x: pos.x + dx * cos - dy * sin,
            y: pos.y + dy * cos + dx * sin,
        };
    }
    transformedStrokePoints() {
        const timeMs = this.now();
        this.update(timeMs);
        const blink = this.blinkStarted;
        const lookTarget = this.look.targetX !== null && this.look.targetY !== null
            ? { x: this.look.targetX, y: this.look.targetY }
            : null;
        const groups = [this.rig.face.leftEye, this.rig.face.rightEye, this.rig.face.mouth].filter((g) => g !== null);
        const groupIndexOf = (point, stroke) => {
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
        return this.rig.strokes.map((stroke, strokeIndex) => stroke.points.map((point) => {
            const transformed = this.transformPoint(point);
            const groupIndex = groupIndexOf(point, strokeIndex);
            if (groupIndex < 0)
                return transformed;
            const group = groups[groupIndex];
            const offset = this.faceOffset(group, lookTarget, blink);
            const relX = transformed.x - group.restX;
            const relY = transformed.y - group.restY;
            return {
                x: group.restX + relX + offset.dx,
                y: group.restY + relY * offset.scaleY + offset.dy,
            };
        }));
    }
    faceOffset(group, lookTarget, blink) {
        let dx = 0;
        let dy = 0;
        let scaleY = 1;
        if (lookTarget) {
            const wx = lookTarget.x - group.restX;
            const wy = lookTarget.y - group.restY;
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
}
