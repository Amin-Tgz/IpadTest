import { imageToWorldX, imageToWorldY } from "../ai/normalization.js";
import { strokesInsideBox } from "../drawing/id-map.js";
import { FALLBACK_JOINT_PARENT, JOINT_IDS } from "../app/constants.js";
export function jointsFromAnalysis(analysis, mapping) {
    const seen = new Map();
    for (const joint of analysis.character.joints) {
        if (seen.has(joint.id))
            continue;
        const valid = JOINT_IDS.includes(joint.id);
        seen.set(joint.id, {
            id: valid ? joint.id : "root",
            x: imageToWorldX(joint.x, mapping),
            y: imageToWorldY(joint.y, mapping),
            parent: joint.parent,
            confidence: joint.confidence,
        });
    }
    return [...seen.values()];
}
export function faceFromAnalysis(analysis, mapping) {
    const face = {};
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
    if (anchors.mouth) {
        face.mouth = {
            x: imageToWorldX(anchors.mouth.x, mapping),
            y: imageToWorldY(anchors.mouth.y, mapping),
        };
    }
    return face;
}
export const isUserStroke = (s) => s.entityId === null;
export function buildManifest(analysis, mapping, store, idMap, filter = isUserStroke) {
    const joints = jointsFromAnalysis(analysis, mapping);
    const face = faceFromAnalysis(analysis, mapping);
    const boxWorld = {
        x: imageToWorldX(analysis.character.boundingBox.x, mapping),
        y: imageToWorldY(analysis.character.boundingBox.y, mapping),
        width: analysis.character.boundingBox.width / mapping.scale,
        height: analysis.character.boundingBox.height / mapping.scale,
    };
    const strokes = store.all().filter((s) => s.active && filter(s));
    const included = strokesInsideBox(strokes, { x: boxWorld.x, y: boxWorld.y, width: boxWorld.width, height: boxWorld.height });
    const parts = [];
    const covered = new Set();
    for (const region of analysis.character.partRegions) {
        const polygonWorld = region.polygon.map(([x, y]) => ({
            x: imageToWorldX(x, mapping),
            y: imageToWorldY(y, mapping),
        }));
        const strokeIds = idMap.sampleStrokesInPolygon(store, polygonWorld);
        const present = strokes.filter((s) => strokeIds.has(s.id)).map((s) => s.id);
        if (present.length > 0) {
            parts.push({ part: region.part, strokeIds: present });
            present.forEach((id) => covered.add(id));
        }
    }
    const uncoveredIncluded = [...included].filter((id) => !covered.has(id));
    if (uncoveredIncluded.length > 0) {
        parts.push({ part: "body", strokeIds: uncoveredIncluded });
    }
    return {
        version: "1.0",
        joints,
        face,
        parts,
        includedStrokeIds: [...included],
        createdAt: Date.now(),
    };
}
export function verifyManifest(manifest) {
    const ids = new Set(manifest.joints.map((j) => j.id));
    if (ids.size !== manifest.joints.length)
        return false;
    for (const joint of manifest.joints) {
        if (joint.parent !== null && !ids.has(joint.parent))
            return false;
    }
    const roots = manifest.joints.filter((j) => j.parent === null);
    if (roots.length !== 1)
        return false;
    const children = new Map();
    for (const joint of manifest.joints) {
        if (joint.parent !== null) {
            const list = children.get(joint.parent) ?? [];
            list.push(joint.id);
            children.set(joint.parent, list);
        }
    }
    const visited = new Set();
    const stack = [roots[0].id];
    while (stack.length > 0) {
        const id = stack.pop();
        if (visited.has(id))
            return false;
        visited.add(id);
        for (const child of children.get(id) ?? [])
            stack.push(child);
    }
    return visited.size === manifest.joints.length;
}
export function ensureValidParents(manifest) {
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
export function missingJoints(manifest) {
    const present = new Set(manifest.joints.map((j) => j.id));
    return JOINT_IDS.filter((id) => !present.has(id));
}
