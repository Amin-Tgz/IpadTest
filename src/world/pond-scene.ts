import type { Camera } from "./camera.js";
import { PALETTE, BASE_LINE_WIDTH } from "../app/constants.js";

export interface FishState {
  jumping: boolean;
  jumpStart: number;
  caught: boolean;
}

const JUMP_DURATION_MS = 1500;

export class PondScene {
  fish: FishState = { jumping: false, jumpStart: 0, caught: false };

  constructor(
    readonly x: number,
    readonly y: number,
    readonly radiusX: number,
    readonly radiusY: number,
  ) {}

  triggerFishJump(now: number): void {
    this.fish.jumping = true;
    this.fish.jumpStart = now;
  }

  approachStopX(clearance = 58): number {
    return this.x - this.radiusX - Math.max(0, clearance);
  }

  fishPosition(now: number): { x: number; y: number } | null {
    if (!this.fish.jumping || this.fish.caught) return null;
    const t = Math.min(1, (now - this.fish.jumpStart) / JUMP_DURATION_MS);
    if (t >= 1) {
      this.fish.jumping = false;
      return null;
    }
    const x = this.x - this.radiusX * 0.35 + t * this.radiusX * 0.7;
    const y = this.y + this.radiusY * 0.55 - Math.sin(t * Math.PI) * this.radiusY * 1.9;
    return { x, y };
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, now: number): void {
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    ctx.strokeStyle = PALETTE.primaryInk;
    ctx.lineWidth = BASE_LINE_WIDTH;
    ctx.lineCap = "round";

    this.strokeOpenWave(ctx, this.x - this.radiusX, this.x + this.radiusX, this.y, 5.5, 4);
    ctx.strokeStyle = "rgba(247,245,238,0.58)";
    this.strokeOpenWave(ctx, this.x - this.radiusX * 0.48, this.x - this.radiusX * 0.05, this.y + 15, 2.8, 1.5);
    ctx.strokeStyle = "rgba(247,245,238,0.42)";
    this.strokeOpenWave(ctx, this.x + this.radiusX * 0.18, this.x + this.radiusX * 0.58, this.y + 26, 2.2, 1.25);
    ctx.strokeStyle = PALETTE.primaryInk;

    const fishPos = this.fishPosition(now);
    if (fishPos) this.drawFish(ctx, fishPos);

    ctx.restore();
  }

  waterlinePoints(count = 33): Array<{ x: number; y: number }> {
    const pointCount = Math.max(3, count);
    return Array.from({ length: pointCount }, (_, index) => {
      const t = index / (pointCount - 1);
      return {
        x: this.x - this.radiusX + t * this.radiusX * 2,
        y: this.y + Math.sin(t * Math.PI * 8) * 5.5,
      };
    });
  }

  private strokeOpenWave(
    ctx: CanvasRenderingContext2D,
    minX: number,
    maxX: number,
    y: number,
    amplitude: number,
    waveCount: number,
  ): void {
    const segments = Math.max(8, Math.ceil(waveCount * 8));
    ctx.beginPath();
    for (let index = 0; index <= segments; index++) {
      const t = index / segments;
      const pointX = minX + (maxX - minX) * t;
      const pointY = y + Math.sin(t * Math.PI * 2 * waveCount) * amplitude;
      if (index === 0) ctx.moveTo(pointX, pointY);
      else ctx.lineTo(pointX, pointY);
    }
    ctx.stroke();
  }

  private drawFish(ctx: CanvasRenderingContext2D, p: { x: number; y: number }): void {
    const sway = Math.sin(p.x * 0.1) * 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 16, 9, sway * 0.03, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x + 12, p.y);
    ctx.lineTo(p.x + 22, p.y - 8);
    ctx.lineTo(p.x + 22, p.y + 8);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = PALETTE.primaryInk;
    ctx.beginPath();
    ctx.arc(p.x - 8, p.y - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCaughtFish(ctx: CanvasRenderingContext2D, p: { x: number; y: number }): void {
    this.drawFish(ctx, p);
  }
}
