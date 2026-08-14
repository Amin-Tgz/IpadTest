export interface RectSpec {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function stairStepRects(spec: RectSpec): RectSpec[] {
  const count = Math.max(2, Math.min(8, Math.round(spec.width / Math.max(24, spec.height / 3))));
  const stepWidth = spec.width / count;
  return Array.from({ length: count }, (_, index) => {
    const height = (spec.height * (index + 1)) / count;
    return {
      x: spec.x + stepWidth * (index + 0.5),
      y: spec.y + spec.height - height / 2,
      width: stepWidth + 1,
      height,
    };
  });
}
