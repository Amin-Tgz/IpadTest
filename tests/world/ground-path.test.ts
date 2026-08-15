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

  it("erases only the touched part of the visible ground", () => {
    const ground = new GroundPath([
      { x: 0, y: 100 },
      { x: 300, y: 100 },
    ]);

    expect(ground.eraseNear({ x: 150, y: 105 }, 24)).toBe(true);
    expect(ground.erased).toBe(true);
    const sections = ground.screenPolylines(0);
    expect(sections).toHaveLength(2);
    expect(sections[0].at(-1)?.[0]).toBeLessThan(150);
    expect(sections[1][0][0]).toBeGreaterThan(150);
  });

  it("does not erase the ground when the eraser is far away", () => {
    const ground = new GroundPath([
      { x: 0, y: 100 },
      { x: 300, y: 100 },
    ]);
    expect(ground.eraseNear({ x: 150, y: 180 }, 24)).toBe(false);
    expect(ground.screenPolylines(0)).toHaveLength(1);
  });

  it("exposes erased ground as a real collision gap", () => {
    const ground = new GroundPath([{ x: 0, y: 100 }, { x: 300, y: 100 }]);
    ground.eraseNear({ x: 150, y: 100 }, 24);
    expect(ground.solidRanges(0, 300)).toEqual([
      { minX: 0, maxX: 126 },
      { minX: 174, maxX: 300 },
    ]);
  });

  it("reports the nearest intact edges around a gap", () => {
    const ground = new GroundPath([{ x: 0, y: 100 }, { x: 200, y: 100 }]);
    ground.eraseNear({ x: 100, y: 100 }, 20);
    expect(ground.nearestIntactEdges(100, 0, 200)).toEqual({ left: 80, right: 120 });
  });

  it("extends a horizontal ground line without losing erased gaps", () => {
    const ground = new GroundPath([{ x: 0, y: 100 }, { x: 300, y: 100 }]);
    ground.eraseNear({ x: 150, y: 100 }, 24);

    expect(ground.extendHorizontalTo(900)).toBe(true);
    expect(ground.maxX).toBeCloseTo(900);
    expect(ground.solidRanges(0, 900)).toEqual([
      { minX: 0, maxX: 126 },
      { minX: 174, maxX: 900 },
    ]);
    expect(ground.extendHorizontalTo(800)).toBe(false);

    ground.setHorizontalY(140);
    expect(ground.pointAtDistance(600).point.y).toBe(140);
  });
});
