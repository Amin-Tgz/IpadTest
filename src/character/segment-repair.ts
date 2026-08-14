import type { CharacterManifest } from "./character-manifest.js";
import { PALETTE } from "../app/constants.js";
import type { Camera } from "../world/camera.js";

export const REPAIR_PARTS = [
  "head",
  "torso",
  "left_arm",
  "right_arm",
  "left_hand",
  "right_hand",
  "left_fingers",
  "right_fingers",
  "left_leg",
  "right_leg",
  "left_foot",
  "right_foot",
  "left_eyebrow",
  "right_eyebrow",
] as const;

export type RepairPart = (typeof REPAIR_PARTS)[number];

export class SegmentRepairEditor {
  activePart: RepairPart = "torso";
  private lasso: Array<{ x: number; y: number }> = [];
  private drawing = false;
  private previewUntil = 0;

  constructor(readonly manifest: CharacterManifest) {}

  setPart(part: RepairPart): void {
    this.activePart = part;
  }

  previewPart(part: RepairPart, durationMs = 2200): void {
    this.setPart(part);
    this.previewUntil = performance.now() + durationMs;
  }

  get previewActive(): boolean {
    return performance.now() < this.previewUntil;
  }

  previewMaskPolygons(part: RepairPart = this.activePart): Array<Array<{ x: number; y: number }>> {
    const polygons = [
      ...this.manifest.parts.filter((region) => repairPartsMatch(part, region.part)).map((region) => region.polygon),
      ...(this.manifest.segmentOverrides ?? []).filter((region) => repairPartsMatch(part, region.part)).map((region) => region.polygon),
    ].filter((polygon): polygon is Array<{ x: number; y: number }> => Boolean(polygon && polygon.length >= 3));
    if (polygons.length > 0) return polygons;
    const facePoint = part === "left_eyebrow"
      ? this.manifest.face.leftEyebrow
      : part === "right_eyebrow" ? this.manifest.face.rightEyebrow : undefined;
    if (!facePoint) return [];
    return [[
      { x: facePoint.x - 14, y: facePoint.y - 7 },
      { x: facePoint.x + 14, y: facePoint.y - 7 },
      { x: facePoint.x + 14, y: facePoint.y + 7 },
      { x: facePoint.x - 14, y: facePoint.y + 7 },
    ]];
  }

  pointerDown(point: { x: number; y: number }): void {
    this.previewUntil = 0;
    this.lasso = [point];
    this.drawing = true;
  }

  pointerMove(point: { x: number; y: number }): void {
    if (!this.drawing) return;
    const last = this.lasso[this.lasso.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 4) this.lasso.push(point);
  }

  pointerUp(): boolean {
    this.drawing = false;
    if (this.lasso.length < 3) {
      this.lasso = [];
      return false;
    }
    this.manifest.segmentOverrides ??= [];
    this.manifest.segmentOverrides.push({ part: this.activePart, polygon: [...this.lasso] });
    this.lasso = [];
    return true;
  }

  undo(): boolean {
    const overrides = this.manifest.segmentOverrides;
    if (!overrides || overrides.length === 0) return false;
    overrides.pop();
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    for (const part of this.manifest.parts) {
      if (!part.polygon || part.polygon.length < 3) continue;
      const color = partColor(part.part);
      const selected = this.previewActive && repairPartsMatch(this.activePart, part.part);
      ctx.fillStyle = selected ? `${partColor(this.activePart)}66` : `${color}${this.previewActive ? "10" : "24"}`;
      ctx.strokeStyle = selected ? partColor(this.activePart) : `${color}${this.previewActive ? "38" : "B8"}`;
      ctx.lineWidth = selected ? 5 : 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      part.polygon.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (this.previewActive) {
      const color = partColor(this.activePart);
      for (const polygon of this.previewMaskPolygons()) {
        ctx.fillStyle = `${color}66`;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.setLineDash([]);
        ctx.beginPath();
        polygon.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const override of this.manifest.segmentOverrides ?? []) {
      if (override.polygon.length < 3) continue;
      const color = partColor(override.part);
      ctx.fillStyle = `${color}38`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      override.polygon.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (this.lasso.length > 0) {
      ctx.strokeStyle = PALETTE.warning;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      this.lasso.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function repairPartsMatch(selected: string, manifestPart: string): boolean {
  if (selected === manifestPart) return true;
  if (selected.endsWith("_fingers")) return manifestPart === selected.replace("_fingers", "_hand");
  return false;
}

export function partColor(part: string): string {
  const colors = ["#FFD166", "#7BDFF2", "#B2F7EF", "#F7A072", "#CDB4DB", "#90DBF4", "#F1C0E8", "#A3C4F3"];
  let hash = 0;
  for (const char of part) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}
