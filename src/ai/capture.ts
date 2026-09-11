import type { Stroke, StrokeStore } from "../drawing/stroke-store.js";
import type { Camera } from "../world/camera.js";
import { GroundPath } from "../world/ground-path.js";
import { PALETTE, BASE_LINE_WIDTH, BASE_LINE_Y_RATIO } from "../app/constants.js";
import type { CaptureMapping } from "./normalization.js";

export interface CaptureOptions {
  targetMaxDim: number;
  includeSampleCharacter: boolean;
}

export interface CapturedView {
  dataUrl: string;
  mapping: CaptureMapping;
  mime: "image/png" | "image/webp";
}

export interface DeltaCapture {
  dataUrl: string;
  cropInImageA: { x: number; y: number; width: number; height: number };
}

export function captureDelta(
  strokes: Stroke[],
  targetMaxDim: number,
  fullMapping: CaptureMapping,
): DeltaCapture | null {
  if (strokes.length === 0) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  if (xs.length === 0) return null;
  const padding = 40;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  const scale = targetMaxDim / Math.max(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-(minX - padding) * scale, -(minY - padding) * scale);
  ctx.scale(scale, scale);
  for (const stroke of strokes) {
    if (!stroke.active) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.baseWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
  return {
    dataUrl: canvas.toDataURL("image/png"),
    cropInImageA: {
      x: (minX - padding - fullMapping.cameraX) * fullMapping.scale,
      y: (minY - padding - (fullMapping.cameraY ?? 0)) * fullMapping.scale,
      width: width * fullMapping.scale,
      height: height * fullMapping.scale,
    },
  };
}

export function captureViewport(
  store: StrokeStore,
  camera: Camera,
  viewport: { width: number; height: number },
  groundPath: GroundPath,
  options: CaptureOptions,
): CapturedView {
  const maxDim = options.targetMaxDim;
  const scale = maxDim / Math.max(viewport.width, viewport.height);
  const width = Math.round(viewport.width * scale);
  const height = Math.round(viewport.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("offscreen canvas unavailable");

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(-camera.state.x * scale, -camera.state.y * scale);
  ctx.scale(scale, scale);

  ctx.strokeStyle = PALETTE.primaryInk;
  ctx.lineWidth = BASE_LINE_WIDTH + 1;
  ctx.lineCap = "round";
  for (const poly of groundPath.screenPolylines(0)) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  const includeSample = options.includeSampleCharacter;
  for (const stroke of store.all()) {
    if (!stroke.active) continue;
    if (stroke.entityId === "sample_character" && !includeSample) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.baseWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }

  ctx.restore();

  const mapping: CaptureMapping = { scale, cameraX: camera.state.x, cameraY: camera.state.y, width, height };
  return {
    dataUrl: canvas.toDataURL("image/png"),
    mapping,
    mime: "image/png",
  };
}

export function captureRegion(
  store: StrokeStore,
  region: { x: number; y: number; width: number; height: number },
  options: CaptureOptions,
): CapturedView {
  const scale = Math.min(1, options.targetMaxDim / Math.max(region.width, region.height));
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("offscreen canvas unavailable");
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-region.x, -region.y);
  for (const stroke of store.all()) {
    if (!stroke.active) continue;
    if (stroke.entityId === "sample_character" && !options.includeSampleCharacter) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.baseWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    stroke.points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.stroke();
  }
  ctx.restore();
  return {
    dataUrl: canvas.toDataURL("image/png"),
    mapping: { scale, cameraX: region.x, cameraY: region.y, width, height },
    mime: "image/png",
  };
}

export function baselineWorldY(viewportHeight: number): number {
  return Math.round(viewportHeight * BASE_LINE_Y_RATIO);
}

export function imagePointToWorld(
  p: { x: number; y: number },
  mapping: CaptureMapping,
): { x: number; y: number } {
  return {
    x: p.x / mapping.scale + mapping.cameraX,
    y: p.y / mapping.scale + (mapping.cameraY ?? 0),
  };
}
