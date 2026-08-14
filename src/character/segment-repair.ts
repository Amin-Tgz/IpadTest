import type { CharacterManifest } from "./character-manifest.js";
import { PALETTE } from "../app/constants.js";
import type { Camera } from "../world/camera.js";

export const REPAIR_PARTS = [
  "head",
  "torso",
  "left_arm",
  "right_arm",
  "left_leg",
  "right_leg",
] as const;

export type RepairPart = (typeof REPAIR_PARTS)[number];

export class SegmentRepairEditor {
  activePart: RepairPart = "torso";
  private lasso: Array<{ x: number; y: number }> = [];
  private drawing = false;

  constructor(readonly manifest: CharacterManifest) {}

  setPart(part: RepairPart): void {
    this.activePart = part;
  }

  pointerDown(point: { x: number; y: number }): void {
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

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    for (const override of this.manifest.segmentOverrides ?? []) {
      if (override.polygon.length < 3) continue;
      ctx.fillStyle = "rgba(216,246,255,0.08)";
      ctx.strokeStyle = "rgba(216,246,255,0.5)";
      ctx.lineWidth = 1.5;
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
