import { describe, expect, it } from "vitest";
import { hasReviewableChanges, nextReviewCheckpoint } from "../../src/app/manual-review.js";

describe("manual drawing review", () => {
  const worldStroke = { active: true, entityId: null };

  it("does not report work merely because time passed", () => {
    expect(hasReviewableChanges([worldStroke], 1, false)).toBe(false);
  });

  it("reports new free ink after the checkpoint", () => {
    expect(hasReviewableChanges([worldStroke, worldStroke], 1, false)).toBe(true);
  });

  it("ignores inactive and character-owned strokes", () => {
    expect(hasReviewableChanges([
      worldStroke,
      { active: false, entityId: null },
      { active: true, entityId: "attachment" },
    ], 1, false)).toBe(false);
  });

  it("reports a ground change without new ink", () => {
    expect(hasReviewableChanges([], 0, true)).toBe(true);
  });

  it("does not swallow ink drawn while the spawn animation finishes", () => {
    expect(nextReviewCheckpoint(5, 6, false)).toBe(5);
    expect(hasReviewableChanges(Array.from({ length: 6 }, () => worldStroke), 5, false)).toBe(true);
  });
});
