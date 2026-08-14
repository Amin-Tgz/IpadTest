import { resampleUniform, type SamplePoint } from "../drawing/stroke-resampler.js";

export interface PathSample extends SamplePoint {
  distance: number;
}

export class GroundPath {
  private samples: PathSample[] = [];
  private totalLength = 0;

  constructor(points: SamplePoint[], spacing = 8) {
    this.build(points, spacing);
  }

  private build(points: SamplePoint[], spacing: number): void {
    const resampled = resampleUniform(points, spacing).points;
    let distance = 0;
    this.samples = resampled.map((p, i) => {
      if (i > 0) {
        const prev = resampled[i - 1];
        distance += Math.hypot(p.x - prev.x, p.y - prev.y);
      }
      return { ...p, distance };
    });
    this.totalLength = distance;
  }

  get length(): number {
    return this.totalLength;
  }

  pointAtDistance(d: number): { point: SamplePoint; tangentAngle: number } {
    const clamped = Math.max(0, Math.min(d, this.totalLength));
    const samples = this.samples;
    if (samples.length < 2) {
      const p = samples[0] ?? { x: 0, y: 0, distance: 0 };
      return { point: p, tangentAngle: 0 };
    }

    let i = 0;
    while (i < samples.length - 2 && samples[i + 1].distance < clamped) i++;
    const a = samples[i];
    const b = samples[i + 1];
    const seg = Math.max(0.0001, b.distance - a.distance);
    const t = Math.min(1, Math.max(0, (clamped - a.distance) / seg));
    return {
      point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      tangentAngle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  nearestDistance(p: SamplePoint): number {
    if (this.samples.length < 2) return 0;
    let best = Infinity;
    let bestDist = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
      const cx = a.x + abx * t;
      const cy = a.y + aby * t;
      const dist = Math.hypot(p.x - cx, p.y - cy);
      if (dist < best) {
        best = dist;
        bestDist = a.distance + Math.hypot(cx - a.x, cy - a.y);
      }
    }
    return bestDist;
  }

  screenPolyline(cameraX: number): Array<[number, number]> {
    return this.samples.map((s) => [s.x - cameraX, s.y]);
  }
}
