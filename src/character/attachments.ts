import type { JointId } from "../app/constants.js";
import type { RigRuntime } from "./rig-runtime.js";

export type AttachmentKind = "wearable" | "held_tool";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  boneId: JointId;
  localPoints: Array<{ x: number; y: number }>;
  color: string;
  baseWidth: number;
  drawOrder: number;
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
): Array<{ x: number; y: number }> {
  return attachment.localPoints.map((p) => runtime.boneToWorld(attachment.boneId, p));
}
