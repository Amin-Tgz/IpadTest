import { describe, expect, it } from "vitest";
import type { DrawingObject } from "../../src/ai/schemas.js";
import { normalizeShoeCandidates, ShoeTutorialProgress } from "../../src/story/shoe-tutorial.js";

const feet = { left_foot: { x: 100, y: 300 }, right_foot: { x: 200, y: 300 } };
const shoe = (x: number, attachTo: string | null = null, width = 45): DrawingObject => ({
  type: "shoe",
  category: "wearable",
  boundingBox: { x, y: 275, width, height: 45 },
  attachTo,
  anchor: { x: x + width / 2, y: 295 },
  orientationDegrees: 0,
  affordances: ["wear"],
  physicsShape: "none",
});

describe("two-slot shoe tutorial", () => {
  it("keeps one shoe incomplete and assigns it to only one foot", () => {
    const progress = new ShoeTutorialProgress();
    const candidates = normalizeShoeCandidates([shoe(80)], feet, progress.snapshot());
    expect(candidates).toHaveLength(1);
    progress.fill(candidates[0].slot, "one");
    expect(progress.complete).toBe(false);
    expect(progress.missing).toHaveLength(1);
  });

  it("deduplicates overlapping AI detections and never returns a third shoe", () => {
    const candidates = normalizeShoeCandidates([shoe(80), shoe(81), shoe(180), shoe(260)], feet, {});
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((entry) => entry.slot))).toEqual(new Set(["left_foot", "right_foot"]));
  });

  it("splits a detected pair across the two fixed foot slots", () => {
    const candidates = normalizeShoeCandidates([shoe(70, null, 160)], feet, {});
    expect(candidates).toHaveLength(2);
    expect(candidates[0].object.boundingBox.x + candidates[0].object.boundingBox.width)
      .toBe(candidates[1].object.boundingBox.x);
  });

  it("fills each slot once and resets incomplete progress", () => {
    const progress = new ShoeTutorialProgress();
    expect(progress.fill("left_foot", "a")).toBe(true);
    expect(progress.fill("left_foot", "duplicate")).toBe(false);
    expect(progress.fill("right_foot", "b")).toBe(true);
    expect(progress.complete).toBe(true);
    progress.reset();
    expect(progress.missing).toEqual(["left_foot", "right_foot"]);
  });
});
