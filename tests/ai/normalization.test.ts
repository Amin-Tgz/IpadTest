import { describe, expect, it } from "vitest";
import { imageToWorldX, imageToWorldY, worldToImage } from "../../src/ai/normalization.js";

describe("cropped image coordinate mapping", () => {
  const mapping = { scale: 0.5, cameraX: 80, cameraY: 120, width: 200, height: 300 };

  it("round-trips both crop offsets", () => {
    const world = { x: 160, y: 240 };
    const image = worldToImage(world, mapping);
    expect(imageToWorldX(image.x, mapping)).toBeCloseTo(world.x);
    expect(imageToWorldY(image.y, mapping)).toBeCloseTo(world.y);
  });
});
