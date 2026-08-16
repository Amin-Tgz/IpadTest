import { describe, expect, it } from "vitest";
import { farthestToolPoint, fishingHookPosition, movementDestination } from "../../src/world/interaction-geometry.js";

describe("interaction geometry", () => {
  it("targets the far edge when the child asks to cross a bridge", () => {
    const bridge = { id: "bridge", type: "پل", physicsShape: "platform", bounds: { x: 300, y: 400, width: 240, height: 20 } };
    expect(movementDestination(200, "right", 1000, bridge)).toMatchObject({ x: 568, direction: 1, crossesSurface: true });
    expect(movementDestination(650, "left", 1000, bridge)).toMatchObject({ x: 272, direction: -1, crossesSurface: true });
  });

  it("anchors the fishing line to the farthest rod point, not the hand", () => {
    const hand = { x: 100, y: 200 };
    const tip = farthestToolPoint(hand, [[hand, { x: 260, y: 120 }, { x: 180, y: 180 }]]);
    expect(tip).toEqual({ x: 260, y: 120 });
    expect(fishingHookPosition(tip, { x: 500, y: 400 }, 0)).toEqual({ x: 500, y: 400 });
    expect(fishingHookPosition(tip, { x: 500, y: 400 }, 1)).toEqual({ x: 270, y: 168 });
  });
});
