export interface EntityTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export const IDENTITY_ENTITY_TRANSFORM: EntityTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};

export function transformLocalPoint(
  point: { x: number; y: number },
  transform: EntityTransform,
): { x: number; y: number } {
  const radians = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = point.x * transform.scaleX;
  const y = point.y * transform.scaleY;
  return { x: transform.x + x * cos - y * sin, y: transform.y + x * sin + y * cos };
}

export function inverseTransformWorldPoint(
  point: { x: number; y: number },
  transform: EntityTransform,
): { x: number; y: number } {
  const radians = (-transform.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = point.x - transform.x;
  const y = point.y - transform.y;
  return { x: (x * cos - y * sin) / transform.scaleX, y: (x * sin + y * cos) / transform.scaleY };
}
