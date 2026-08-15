import type { JointId } from "../app/constants.js";
import type { RigRuntime } from "./rig-runtime.js";
import type { StrokeStore } from "../drawing/stroke-store.js";
import type { IdMap } from "../drawing/id-map.js";
import { IDENTITY_ENTITY_TRANSFORM, transformLocalPoint, type EntityTransform } from "./entity-transform.js";

export type AttachmentKind = "wearable" | "held_tool";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  boneId: JointId;
  sourceStrokeIds: string[];
  strokes: AttachmentStroke[];
  localTransform: EntityTransform;
  visible: boolean;
  drawOrder: number;
}

export interface AttachmentStroke {
  sourceStrokeId: string;
  localPoints: Array<{ x: number; y: number }>;
  color: string;
  baseWidth: number;
}

export function toLocalPoints(
  points: Array<{ x: number; y: number }>,
  anchor: { x: number; y: number },
): Array<{ x: number; y: number }> {
  return points.map((p) => ({ x: p.x - anchor.x, y: p.y - anchor.y }));
}

export function attachmentWorldPoints(
  attachment: Attachment,
  runtime: RigRuntime,
): Array<Array<{ x: number; y: number }>> {
  return attachment.strokes.map((stroke) =>
    stroke.localPoints.map((point) => runtime.boneToWorld(attachment.boneId, transformLocalPoint(point, attachment.localTransform))),
  );
}

export interface DetectedObject {
  type: string;
  category: "wearable" | "held_tool" | "decoration" | "other";
  boundingBox: { x: number; y: number; width: number; height: number };
  attachTo: string | null;
  anchor: { x: number; y: number } | null;
}

const MAX_ATTACHMENT_POINTS = 500;

export function buildAttachmentFromObject(
  object: DetectedObject,
  store: StrokeStore,
  idMap: IdMap,
  runtime: RigRuntime,
  index: number,
  allowedStrokeIds?: ReadonlySet<string>,
  regionPadding = 30,
): Attachment | null {
  if (!object.attachTo || !object.anchor) return null;
  const boneId = resolveBoneId(object.attachTo, object.anchor, runtime);
  if (!boneId) return null;

  const box = {
    x: object.boundingBox.x - regionPadding,
    y: object.boundingBox.y - regionPadding,
    width: object.boundingBox.width + regionPadding * 2,
    height: object.boundingBox.height + regionPadding * 2,
  };
  const strokeIds = idMap.sampleStrokesInRegion(store, box, 4);
  const attachmentStrokes: AttachmentStroke[] = [];
  for (const stroke of store.all()) {
    if (!stroke.active || !strokeIds.has(stroke.id) || (allowedStrokeIds && !allowedStrokeIds.has(stroke.id))) continue;
    // The detection box chooses which strokes belong to the object, but it must
    // not crop those strokes. A balloon string, handle, or hat brim can extend
    // well outside an imperfect AI box and should still move as one drawing.
    const points = stroke.points.map((p) => ({ x: p.x, y: p.y }));
    if (points.length === 0) continue;
    attachmentStrokes.push({
      sourceStrokeId: stroke.id,
      localPoints: toLocalPoints(samplePoints(points), attachmentSourceAnchor(object, boneId)),
      color: stroke.color,
      baseWidth: stroke.baseWidth,
    });
  }
  if (attachmentStrokes.length === 0) return null;

  const id = `attachment_${Date.now().toString(36)}_${index}`;
  attachmentStrokes.forEach((stroke) => store.setEntityId(stroke.sourceStrokeId, id));

  return {
    id,
    kind: object.category === "held_tool" ? "held_tool" : "wearable",
    boneId,
    sourceStrokeIds: attachmentStrokes.map((stroke) => stroke.sourceStrokeId),
    strokes: attachmentStrokes,
    localTransform: { ...IDENTITY_ENTITY_TRANSFORM },
    visible: true,
    drawOrder: 7,
  };
}

function samplePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= MAX_ATTACHMENT_POINTS) return points;
  const step = Math.ceil(points.length / MAX_ATTACHMENT_POINTS);
  return points.filter((_, index) => index % step === 0);
}

function attachmentSourceAnchor(
  object: DetectedObject,
  boneId: JointId,
): { x: number; y: number } {
  if (object.category !== "wearable" || !boneId.endsWith("foot")) return object.anchor!;
  return {
    x: object.boundingBox.x + object.boundingBox.width / 2,
    y: object.boundingBox.y + object.boundingBox.height * 0.35,
  };
}

export function resolveBoneId(
  candidate: string,
  anchor: { x: number; y: number },
  runtime: RigRuntime,
): JointId | null {
  const known: JointId[] = [
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
  if (exact) return exact;
  const byDistance = [...existing].sort((a, b) => {
    const pa = runtime.restJoint(a)!;
    const pb = runtime.restJoint(b)!;
    return (
      Math.hypot(anchor.x - pa.x, anchor.y - pa.y) - Math.hypot(anchor.x - pb.x, anchor.y - pb.y)
    );
  });
  return byDistance[0] ?? null;
}
