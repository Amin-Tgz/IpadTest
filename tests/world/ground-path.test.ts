import { describe, expect, it } from "vitest";
import { GroundPath } from "../../src/world/ground-path.js";

describe("ground-path", () => {
  const flat = new GroundPath([
    { x: 0, y: 100 },
    { x: 300, y: 100 },
  ]);

  it("computes total length", () => {
    expect(flat.length).toBeCloseTo(300, 5);
  });

  it("interpolates distance to point and tangent", () => {
    const { point, tangentAngle } = flat.pointAtDistance(150);
    expect(point.x).toBeCloseTo(150, 5);
    expect(point.y).toBeCloseTo(100, 5);
    expect(tangentAngle).toBeCloseTo(0, 5);
  });

  it("clamps beyond-end distances", () => {
    const { point } = flat.pointAtDistance(999);
    expect(point.x).toBeCloseTo(300, 5);
  });

  it("finds nearest distance from an off-path point", () => {
    expect(flat.nearestDistance({ x: 150, y: 160 })).toBeCloseTo(150, 5);
  });

  it("handles sloped path tangent", () => {
    const slope = new GroundPath([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    const { tangentAngle } = slope.pointAtDistance(20);
    expect(tangentAngle).toBeCloseTo(Math.PI / 4, 5);
  });
});
