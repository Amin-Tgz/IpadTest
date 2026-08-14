import { describe, expect, it } from "vitest";
import { resampleUniform } from "../../src/drawing/stroke-resampler.js";

describe("stroke-resampler", () => {
  it("keeps endpoints and produces uniform spacing", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const { points: out } = resampleUniform(points, 10);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 100, y: 0 });
    for (let i = 1; i < out.length; i++) {
      const d = Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
      expect(d).toBeCloseTo(10, 5);
    }
  });

  it("handles single point", () => {
    const { points } = resampleUniform([{ x: 5, y: 5 }], 10);
    expect(points).toEqual([{ x: 5, y: 5 }]);
  });

  it("carries remainder across segments", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 10, y: 0 },
    ];
    const { points: out } = resampleUniform(points, 4);
    expect(out.map((p) => p.x)).toEqual([0, 4, 8, 10]);
  });
});
