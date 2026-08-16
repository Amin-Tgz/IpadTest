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
  resolvedStrokeIds?: ReadonlySet<string>,
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
  // A provider box both misses the ink it describes and bleeds neighbouring
  // drawings in. When the caller has already decided which strokes this object
  // owns, that answer is authoritative; sampling the box is only the fallback.
  const strokeIds = resolvedStrokeIds && resolvedStrokeIds.size > 0
    ? resolvedStrokeIds
    : idMap.sampleStrokesInRegion(store, box, 4);
  // The detection box chooses which strokes belong to the object, but it must
  // not crop those strokes. A balloon string, handle, or hat brim can extend
  // well outside an imperfect AI box and should still move as one drawing.
  const claimed = store.all().filter((stroke) =>
    stroke.active && strokeIds.has(stroke.id) && stroke.points.length > 0 &&
    (!allowedStrokeIds || allowedStrokeIds.has(stroke.id)),
  );
  if (claimed.length === 0) return null;

  const anchor = attachmentSourceAnchor(object, boneId, inkBounds(claimed));
  const attachmentStrokes: AttachmentStroke[] = claimed.map((stroke) => ({
    sourceStrokeId: stroke.id,
    localPoints: toLocalPoints(samplePoints(stroke.points.map((p) => ({ x: p.x, y: p.y }))), anchor),
    color: stroke.color,
    baseWidth: stroke.baseWidth,
  }));

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

export function inkBounds(
  strokes: Array<{ points: Array<{ x: number; y: number }> }>,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// A shoe must sit on the foot no matter where the provider drew its box, so the
// foot anchor comes from the child's actual ink rather than the reported box.
function attachmentSourceAnchor(
  object: DetectedObject,
  boneId: JointId,
  ink: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  if (object.category !== "wearable" || !boneId.endsWith("foot")) return object.anchor!;
  return {
    x: ink.x + ink.width / 2,
    y: ink.y + ink.height * 0.35,
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
