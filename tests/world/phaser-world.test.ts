import { describe, expect, it } from "vitest";
import { stairStepRects } from "../../src/world/physics-geometry.js";

describe("Phaser drawing physics geometry", () => {
  it("converts recognized stairs into ascending collision rectangles", () => {
    const steps = stairStepRects({ x: 100, y: 200, width: 160, height: 80 });
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0].height).toBeLessThan(steps.at(-1)!.height);
    expect(steps[0].x).toBeLessThan(steps.at(-1)!.x);
    expect(steps.every((step) => step.width > 0 && step.height > 0)).toBe(true);
  });
});
