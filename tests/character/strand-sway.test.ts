import { describe, expect, it } from "vitest";
import { StrandSway } from "../../src/character/strand-sway.js";

const strand = (x: number, y: number) => [
  { x, y },
  { x: x - 20, y: y + 10 },
  { x: x - 36, y: y + 24 },
];

describe("StrandSway", () => {
  it("leaves a still strand exactly as drawn", () => {
    const sway = new StrandSway();
    for (let time = 0; time <= 1000; time += 16) {
      expect(sway.apply(strand(100, 100), time)).toEqual(strand(100, 100));
    }
  });

  it("trails behind a moving root and springs back when it stops", () => {
    const sway = new StrandSway();
    let x = 100;
    let time = 0;
    let points = sway.apply(strand(x, 100), time);
    for (let frame = 0; frame < 30; frame++) {
      x += 5;
      time += 16;
      points = sway.apply(strand(x, 100), time);
    }
    const tip = points[2];
    expect(tip.x - x).toBeLessThan(-36 - 2);
    expect(tip.y - 100).toBeLessThan(24);
    for (let frame = 0; frame < 250; frame++) {
      time += 16;
      points = sway.apply(strand(x, 100), time);
    }
    expect(points[2].x - x).toBeCloseTo(-36, 1);
    expect(points[2].y - 100).toBeCloseTo(24, 1);
  });

  it("ignores a teleport after a long pause instead of whipping the strand", () => {
    const sway = new StrandSway();
    sway.apply(strand(100, 100), 0);
    const points = sway.apply(strand(900, 100), 2000);
    expect(points).toEqual(strand(900, 100));
  });
});
