import { describe, expect, it } from "vitest";
import { stairStepRects, stairTopWaypoints } from "../../src/world/physics-geometry.js";

describe("Phaser drawing physics geometry", () => {
  it("converts recognized stairs into ascending collision rectangles", () => {
    const steps = stairStepRects({ x: 100, y: 200, width: 160, height: 80 });
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0].height).toBeLessThan(steps.at(-1)!.height);
    expect(steps[0].x).toBeLessThan(steps.at(-1)!.x);
    expect(steps.every((step) => step.width > 0 && step.height > 0)).toBe(true);
  });

  it("creates reversible tread-by-tread climbing routes with vertical destinations", () => {
    const right = stairTopWaypoints({ x: 100, y: 200, width: 160, height: 80 }, 30, 1);
    const left = stairTopWaypoints({ x: 100, y: 200, width: 160, height: 80 }, 30, -1);
    expect(right.length).toBeGreaterThan(2);
    expect(right[0].x).toBeLessThan(right.at(-1)!.x);
    expect(right[0].y).toBeGreaterThan(right.at(-1)!.y);
    expect(left).toEqual([...right].reverse());
  });
});
