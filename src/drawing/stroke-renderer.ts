import getStroke from "perfect-freehand";
import type { Stroke } from "./stroke-store.js";
import type { RigStroke } from "../character/rig-builder.js";
import { PALETTE, BASE_LINE_WIDTH } from "../app/constants.js";
import type { Camera } from "../world/camera.js";

export interface RendererOptions {
  strokeCacheLimit?: number;
}

interface CachedPath {
  path: Path2D;
  width: number;
}

export class StrokeRenderer {
  private cache = new Map<string, CachedPath>();
  private cacheOrder: string[] = [];

  constructor(private readonly options: RendererOptions = {}) {}

  clearCache(): void {
    this.cache.clear();
    this.cacheOrder = [];
  }

  private cachedPath(stroke: Stroke): CachedPath {
    const key = stroke.id + stroke.points.length;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const path = this.buildPath(stroke);
    this.cache.set(key, path);
    this.cacheOrder.push(key);
    const limit = this.options.strokeCacheLimit ?? 400;
    while (this.cacheOrder.length > limit) {
      const oldest = this.cacheOrder.shift();
      if (oldest) this.cache.delete(oldest);
    }
    return path;
  }

  private buildPath(stroke: Stroke): CachedPath {
    const outline = getStroke(
      stroke.points.map((p) => [p.x, p.y, p.pressure]),
      {
        size: stroke.baseWidth,
        thinning: 0.35,
        smoothing: 0.4,
        streamline: 0.45,
        simulatePressure: stroke.points.every((p) => p.pressure === 0.5),
      },
    );
    const path = new Path2D();
    if (outline.length === 0) return { path, width: stroke.baseWidth };
    path.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) {
      path.lineTo(outline[i][0], outline[i][1]);
    }
    path.closePath();
    return { path, width: stroke.baseWidth };
  }

  drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, camera: Camera): void {
    if (stroke.points.length === 0) return;
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    ctx.fillStyle = stroke.color;
    const cached = this.cachedPath(stroke);
    ctx.fill(cached.path);
    ctx.restore();
  }

  drawLiveStroke(
    ctx: CanvasRenderingContext2D,
    stroke: Stroke,
    camera: Camera,
  ): void {
    if (stroke.points.length === 0) return;
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    ctx.strokeStyle = PALETTE.activeInk;
    ctx.lineWidth = BASE_LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (stroke.points.length === 1) {
      ctx.fillStyle = PALETTE.activeInk;
      ctx.beginPath();
      ctx.arc(stroke.points[0].x, stroke.points[0].y, BASE_LINE_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawRigStroke(
    ctx: CanvasRenderingContext2D,
    stroke: RigStroke,
    points: Array<{ x: number; y: number }>,
  ): void {
    if (points.length < 2) return;
    const outline = getStroke(
      points.map((point, index) => [point.x, point.y, stroke.points[index]?.pressure ?? 0.5]),
      { size: stroke.baseWidth, thinning: 0.35, smoothing: 0.4, streamline: 0.45 },
    );
    if (outline.length === 0) return;
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (let index = 1; index < outline.length; index++) ctx.lineTo(outline[index][0], outline[index][1]);
    ctx.closePath();
    ctx.fill();
  }
}
