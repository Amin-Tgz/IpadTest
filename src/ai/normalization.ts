export function clampCoord(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export interface CaptureMapping {
  scale: number;
  cameraX: number;
  cameraY?: number;
  width: number;
  height: number;
}

export function imageToWorldX(imageX: number, mapping: CaptureMapping): number {
  return imageX / mapping.scale + mapping.cameraX;
}

export function imageToWorldY(imageY: number, mapping: CaptureMapping): number {
  return imageY / mapping.scale + (mapping.cameraY ?? 0);
}

export function worldToImage(p: { x: number; y: number }, mapping: CaptureMapping): { x: number; y: number } {
  return {
    x: (p.x - mapping.cameraX) * mapping.scale,
    y: (p.y - (mapping.cameraY ?? 0)) * mapping.scale,
  };
}
