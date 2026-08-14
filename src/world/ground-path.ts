import { resampleUniform, type SamplePoint } from "../drawing/stroke-resampler.js";

export interface PathSample extends SamplePoint {
  distance: number;
}

export class GroundPath {
  private samples: PathSample[] = [];
  private totalLength = 0;
  private erasedRanges: Array<{ minX: number; maxX: number }> = [];

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

  screenPolylines(cameraX: number): Array<Array<[number, number]>> {
    const lines: Array<Array<[number, number]>> = [];
    let current: Array<[number, number]> = [];
    for (const sample of this.samples) {
      const erased = this.erasedRanges.some((range) => sample.x >= range.minX && sample.x <= range.maxX);
      if (erased) {
        if (current.length > 1) lines.push(current);
        current = [];
      } else {
        current.push([sample.x - cameraX, sample.y]);
      }
    }
    if (current.length > 1) lines.push(current);
    return lines;
  }

  eraseNear(point: SamplePoint, radius = 24): boolean {
    const nearest = this.pointAtDistance(this.nearestDistance(point)).point;
    if (Math.hypot(point.x - nearest.x, point.y - nearest.y) > radius) return false;
    this.erasedRanges.push({ minX: point.x - radius, maxX: point.x + radius });
    this.mergeErasedRanges();
    return true;
  }

  get erased(): boolean {
    return this.erasedRanges.length > 0;
  }

  solidRanges(minX: number, maxX: number): Array<{ minX: number; maxX: number }> {
    const solid: Array<{ minX: number; maxX: number }> = [];
    let cursor = minX;
    for (const erased of this.erasedRanges) {
      const start = Math.max(minX, erased.minX);
      const end = Math.min(maxX, erased.maxX);
      if (end <= minX || start >= maxX) continue;
      if (start > cursor) solid.push({ minX: cursor, maxX: start });
      cursor = Math.max(cursor, end);
    }
    if (cursor < maxX) solid.push({ minX: cursor, maxX });
    return solid.filter((range) => range.maxX - range.minX >= 2);
  }

  private mergeErasedRanges(): void {
    const sorted = [...this.erasedRanges].sort((a, b) => a.minX - b.minX);
    const merged: Array<{ minX: number; maxX: number }> = [];
    for (const range of sorted) {
      const last = merged[merged.length - 1];
      if (last && range.minX <= last.maxX) last.maxX = Math.max(last.maxX, range.maxX);
      else merged.push({ ...range });
    }
    this.erasedRanges = merged;
  }
}
