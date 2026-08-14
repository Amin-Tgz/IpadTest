import type { StrokeStore } from "../drawing/stroke-store";
import type { Camera } from "../world/camera";
import { GroundPath } from "../world/ground-path";
import { PALETTE, BASE_LINE_WIDTH, BASE_LINE_Y_RATIO } from "../app/constants";
import type { CaptureMapping } from "./normalization";

export interface CaptureOptions {
  targetMaxDim: number;
  includeSampleCharacter: boolean;
}

export interface CapturedView {
  dataUrl: string;
  mapping: CaptureMapping;
  mime: "image/png" | "image/webp";
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
  ctx.translate(-camera.state.x * scale, 0);
  ctx.scale(scale, scale);

  const poly = groundPath.screenPolyline(camera.state.x);
  ctx.strokeStyle = PALETTE.primaryInk;
  ctx.lineWidth = BASE_LINE_WIDTH + 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

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

  const mapping: CaptureMapping = { scale, cameraX: camera.state.x, width, height };
  return {
    dataUrl: canvas.toDataURL("image/png"),
    mapping,
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
    y: p.y / mapping.scale,
  };
}
