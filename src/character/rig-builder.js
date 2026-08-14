import { resampleUniform } from "../drawing/stroke-resampler.js";
const FACE_RADIUS = 14;
export function buildRig(manifest, store) {
    const joints = manifest.joints.map((j) => ({
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
export function nearestJoint(x, y, joints) {
    let best = null;
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
function buildRigStroke(stroke, joints, includedIds) {
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
                jointId: nearest ? nearest.id : "root",
            };
        }),
    };
}
function buildFace(face, rigStrokes, joints) {
    const collect = (anchor, jointId) => {
        if (!anchor)
            return null;
        const points = [];
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
