import { describe, expect, it } from "vitest";
import { Walker, easeToward } from "../../src/world/walker.js";
import { GroundPath } from "../../src/world/ground-path.js";

describe("Walker", () => {
  const path = new GroundPath([
    { x: 0, y: 100 },
    { x: 1000, y: 100 },
  ]);

  it("walks along the path until the stop distance", () => {
    const walker = new Walker(path, 500);
    walker.start();
    expect(walker.finished).toBe(false);
    walker.step(10_000);
    expect(walker.position().x).toBeCloseTo(500, 3);
    expect(walker.finished).toBe(true);
  });

  it("never passes the stop distance", () => {
    const walker = new Walker(path, 200);
    walker.start();
    walker.step(60_000);
    expect(walker.position().x).toBeCloseTo(200, 3);
  });

  it("reports the path tangent", () => {
    const walker = new Walker(path, 100);
    walker.start();
    expect(walker.position().tangentAngle).toBeCloseTo(0, 5);
  });
});

describe("easeToward", () => {
  it("moves toward the target over time", () => {
    const first = easeToward(0, 100, 100, 2);
    const second = easeToward(first, 100, 100, 2);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(100);
  });

  it("reaches the target exactly when very close", () => {
    expect(easeToward(99.999, 100, 1000, 2)).toBeCloseTo(100, 3);
  });
});
