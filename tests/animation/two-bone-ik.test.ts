import { describe, expect, it } from "vitest";
import { solveTwoBoneIK } from "../../src/animation/two-bone-ik.js";

describe("two-bone IK", () => {
  it("preserves a straight rest limb aimed at its current endpoint", () => {
    const solution = solveTwoBoneIK({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 });
    expect(Math.abs(solution.rootRotation)).toBeLessThan(1);
    expect(Math.abs(solution.jointRotation)).toBeLessThan(1);
    expect(solution.reachable).toBe(true);
  });

  it("returns finite rotations and reports an unreachable target", () => {
    const solution = solveTwoBoneIK({ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 0, y: 80 }, { x: 200, y: 10 }, -1);
    expect(Number.isFinite(solution.rootRotation)).toBe(true);
    expect(Number.isFinite(solution.jointRotation)).toBe(true);
    expect(solution.reachable).toBe(false);
  });
});
