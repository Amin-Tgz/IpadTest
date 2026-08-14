export interface SamplePoint {
  x: number;
  y: number;
}

export interface ResampleResult {
  points: SamplePoint[];
}

export function resampleUniform(
  points: SamplePoint[],
  spacing: number,
): ResampleResult {
  if (points.length < 2) {
    return { points: points.slice() };
  }

  const result: SamplePoint[] = [points[0]];
  let carry = 0;
  const step = spacing > 0 ? spacing : 1;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg = Math.hypot(dx, dy);
    if (seg === 0) continue;

    let d = carry;
    while (d < seg) {
      if (d > 0) {
        const t = d / seg;
        result.push({ x: a.x + dx * t, y: a.y + dy * t });
      }
      d += step;
    }
    carry = d - seg;
  }

  const last = points[points.length - 1];
  if (last && (result[result.length - 1].x !== last.x || result[result.length - 1].y !== last.y)) {
    result.push(last);
  }
  return { points: result };
}
