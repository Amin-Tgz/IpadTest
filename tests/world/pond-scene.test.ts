import { describe, expect, it } from "vitest";
import { PondScene } from "../../src/world/pond-scene.js";

describe("PondScene", () => {
  const pond = new PondScene(1000, 500, 190, 72);

  it("returns null fish position when not jumping", () => {
    expect(pond.fishPosition(0)).toBeNull();
  });

  it("moves the fish along a parabola while jumping", () => {
    pond.triggerFishJump(1000);
    const early = pond.fishPosition(1000 + 100);
    const mid = pond.fishPosition(1000 + 750);
    expect(early).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(mid!.y).toBeLessThan(early!.y);
  });

  it("ends the jump after the duration", () => {
    pond.triggerFishJump(2000);
    expect(pond.fishPosition(2000 + 2000)).toBeNull();
    expect(pond.fish.jumping).toBe(false);
  });
});
