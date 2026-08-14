import { PALETTE } from "../app/constants.js";
export function toLocalPoints(points, anchor) {
    return points.map((p) => ({ x: p.x - anchor.x, y: p.y - anchor.y }));
}
export function attachmentWorldPoints(attachment, runtime) {
    return attachment.localPoints.map((p) => runtime.boneToWorld(attachment.boneId, p));
}
const MAX_ATTACHMENT_POINTS = 500;
export function buildAttachmentFromObject(object, store, idMap, runtime, index) {
    if (!object.attachTo || !object.anchor)
        return null;
    const boneId = resolveBoneId(object.attachTo, object.anchor, runtime);
    if (!boneId)
        return null;
    const box = {
        x: object.boundingBox.x - 30,
        y: object.boundingBox.y - 30,
        width: object.boundingBox.width + 60,
        height: object.boundingBox.height + 60,
    };
    const strokeIds = idMap.sampleStrokesInRegion(store, box, 4);
    const points = [];
    for (const stroke of store.all()) {
        if (!stroke.active || !strokeIds.has(stroke.id))
            continue;
        for (const p of stroke.points) {
            if (p.x < box.x || p.x > box.x + box.width || p.y < box.y || p.y > box.y + box.height)
                continue;
            points.push({ x: p.x, y: p.y });
        }
    }
    if (points.length === 0)
        return null;
    let sampled = points;
    if (points.length > MAX_ATTACHMENT_POINTS) {
        const step = Math.ceil(points.length / MAX_ATTACHMENT_POINTS);
        sampled = points.filter((_, i) => i % step === 0);
    }
    return {
        id: `detected_${index}`,
        kind: object.category === "held_tool" ? "held_tool" : "wearable",
        boneId,
        localPoints: toLocalPoints(sampled, object.anchor),
        color: PALETTE.primaryInk,
        baseWidth: 4,
        drawOrder: 7,
    };
}
export function resolveBoneId(candidate, anchor, runtime) {
    const known = [
        "left_foot",
        "right_foot",
        "left_hand",
        "right_hand",
        "left_knee",
        "right_knee",
        "left_elbow",
        "right_elbow",
        "head",
        "torso",
    ];
    const existing = known.filter((id) => runtime.restJoint(id) !== null);
    const exact = existing.find((id) => id === candidate);
    if (exact)
        return exact;
    const byDistance = [...existing].sort((a, b) => {
        const pa = runtime.restJoint(a);
        const pb = runtime.restJoint(b);
        return (Math.hypot(anchor.x - pa.x, anchor.y - pa.y) - Math.hypot(anchor.x - pb.x, anchor.y - pb.y));
    });
    return byDistance[0] ?? null;
}
