import type { Stroke, StrokeStore } from "./stroke-store.js";

export interface SampleRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COLOR_CACHE_LIMIT = 512;

export function encodeIdColor(n: number): string {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function decodeIdColor(hex: string): number {
  const value = parseInt(hex.replace("#", ""), 16);
  return ((value >> 16) & 0xff) * 65536 + ((value >> 8) & 0xff) * 256 + (value & 0xff);
}

export class IdColorRegistry {
  private byId = new Map<string, string>();
  private byColor = new Map<string, string>();
  private order: string[] = [];
  private next = 1;

  colorFor(id: string): string {
    const existing = this.byId.get(id);
    if (existing) return existing;
    const color = encodeIdColor(this.next++);
    this.byId.set(id, color);
    this.byColor.set(color, id);
    this.order.push(id);
    while (this.order.length > COLOR_CACHE_LIMIT) {
      const oldest = this.order.shift();
      if (oldest) this.forget(oldest);
    }
    return color;
  }

  idFor(color: string): string | null {
    return this.byColor.get(color) ?? null;
  }

  private forget(id: string): void {
    const color = this.byId.get(id);
    if (color) {
      this.byId.delete(id);
      this.byColor.delete(color);
    }
  }
}

export class IdMap {
  private registry = new IdColorRegistry();
  private canvas: HTMLCanvasElement | null = null;

  private getCanvas(region: SampleRegion): CanvasRenderingContext2D {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    const w = Math.ceil(region.width);
    const h = Math.ceil(region.height);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("id-map canvas unavailable");
    return ctx;
  }

  sampleStrokesInRegion(
    store: StrokeStore,
    regionWorld: SampleRegion,
    minPixels = 6,
  ): Set<string> {
    const ctx = this.getCanvas(regionWorld);
    ctx.clearRect(0, 0, regionWorld.width, regionWorld.height);
    ctx.save();
    ctx.translate(-regionWorld.x, -regionWorld.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of store.all()) {
      if (!stroke.active) continue;
      ctx.strokeStyle = this.registry.colorFor(stroke.id);
      ctx.lineWidth = Math.max(2, stroke.baseWidth - 1);
      ctx.beginPath();
      stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();

    return this.countColors(ctx, regionWorld, minPixels);
  }

  sampleStrokesInPolygon(
    store: StrokeStore,
    polygonWorld: Array<{ x: number; y: number }>,
    minPixels = 4,
  ): Set<string> {
    if (polygonWorld.length < 3) return new Set();
    const xs = polygonWorld.map((p) => p.x);
    const ys = polygonWorld.map((p) => p.y);
    const region: SampleRegion = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    const ctx = this.getCanvas(region);
    ctx.clearRect(0, 0, region.width, region.height);
    ctx.save();
    ctx.translate(-region.x, -region.y);
    ctx.beginPath();
    ctx.moveTo(polygonWorld[0].x, polygonWorld[0].y);
    for (let i = 1; i < polygonWorld.length; i++) {
      ctx.lineTo(polygonWorld[i].x, polygonWorld[i].y);
    }
    ctx.closePath();
    ctx.clip();

    for (const stroke of store.all()) {
      if (!stroke.active) continue;
      ctx.strokeStyle = this.registry.colorFor(stroke.id);
      ctx.lineWidth = Math.max(2, stroke.baseWidth - 1);
      ctx.beginPath();
      stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();

    return this.countColors(ctx, region, minPixels);
  }

  private countColors(
    ctx: CanvasRenderingContext2D,
    region: SampleRegion,
    minPixels: number,
  ): Set<string> {
    const imageData = ctx.getImageData(0, 0, region.width, region.height).data;
    const counts = new Map<string, number>();
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      if (r === 0 && g === 0 && b === 0) continue;
      const key = encodeIdColor((r << 16) | (g << 8) | b);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const result = new Set<string>();
    for (const [color, count] of counts) {
      if (count < minPixels) continue;
      const id = this.registry.idFor(color);
      if (id) result.add(id);
    }
    return result;
  }
}

export function strokesInsideBox(strokes: Stroke[], box: SampleRegion): Set<string> {
  const result = new Set<string>();
  for (const stroke of strokes) {
    const inside = stroke.points.filter(
      (p) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height,
    ).length;
    if (inside > 0 && inside / stroke.points.length >= 0.3) {
      result.add(stroke.id);
    }
  }
  return result;
}
