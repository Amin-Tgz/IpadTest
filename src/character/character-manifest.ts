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
}

export interface SegmentOverride {
  part: string;
  polygon: Array<{ x: number; y: number }>;
}

export interface CharacterManifest {
  version: "1.0" | "2.0";
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
    const present = strokes.filter((s) => strokeIds.has(s.id)).map((s) => s.id);
    if (present.length > 0) {
      parts.push({ part: region.part, strokeIds: present, polygon: polygonWorld });
      present.forEach((id) => covered.add(id));
    }
  }

  const uncoveredIncluded = [...included].filter((id) => !covered.has(id));
  if (uncoveredIncluded.length > 0) {
    parts.push({ part: "body", strokeIds: uncoveredIncluded });
  }

  return {
    version: "2.0",
    joints,
    face,
    parts,
    includedStrokeIds: [...included],
    segmentOverrides: [],
    createdAt: Date.now(),
  };
}

export function migrateManifest(manifest: CharacterManifest): CharacterManifest {
  if (manifest.version === "2.0") {
    return { ...manifest, segmentOverrides: manifest.segmentOverrides ?? [] };
  }
  return {
    ...manifest,
    version: "2.0",
    parts: manifest.parts.map((part) => ({ ...part })),
    segmentOverrides: [],
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
