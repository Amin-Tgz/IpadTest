import { describe, expect, it } from "vitest";
import { dropLanding, farthestToolPoint, fishingHookPosition, jumpDestination, movementDestination } from "../../src/world/interaction-geometry.js";

describe("interaction geometry", () => {
  it("jumps to the tip of the arrow the child drew, not its middle", () => {
    const arrow = { bounds: { x: 620, y: 240, width: 280, height: 260 }, physical: false };
    expect(jumpDestination(600, "right", arrow)).toEqual({ kind: "toward", x: 900 });
    expect(jumpDestination(600, null, arrow)).toEqual({ kind: "toward", x: 900 });
    expect(jumpDestination(950, null, arrow)).toEqual({ kind: "toward", x: 620 });
  });

  it("jumps onto a drawn object, or off the current height when no target is given", () => {
    const box = { bounds: { x: 400, y: 500, width: 80, height: 80 }, physical: true };
    expect(jumpDestination(200, "right", box)).toEqual({ kind: "toward", x: 440 });
    expect(jumpDestination(200, "right", null)).toEqual({ kind: "drop", direction: 1 });
    expect(jumpDestination(200, "down", null)).toEqual({ kind: "drop", direction: null });
    expect(jumpDestination(200, null, null)).toEqual({ kind: "hop" });
  });

  it("jumps off the edge toward a down arrow, even one drawn right beside the hero", () => {
    const arrow = { bounds: { x: 646, y: 401, width: 44, height: 137 }, physical: false };
    expect(jumpDestination(580, "down", arrow)).toEqual({ kind: "drop", direction: 1, towardX: 668 });
    const beside = { bounds: { x: 572, y: 380, width: 20, height: 60 }, physical: false };
    expect(jumpDestination(580, "down", beside)).toEqual({ kind: "drop", direction: null, towardX: 582 });
  });

  it("lands past the drop edge, or at the arrow when it points farther than the edge", () => {
    expect(dropLanding(580, 690, 668)).toBe(690);
    expect(dropLanding(580, 690, 760)).toBe(760);
    expect(dropLanding(580, 690, 582)).toBe(690);
    expect(dropLanding(580, 410, 668)).toBe(410);
    expect(dropLanding(300, null, 380)).toBe(380);
    expect(dropLanding(300, null, 310)).toBeNull();
    expect(dropLanding(300, 500)).toBe(500);
  });

  it("targets the far edge when the child asks to cross a bridge", () => {
    const bridge = { id: "bridge", type: "پل", physicsShape: "platform", bounds: { x: 300, y: 400, width: 240, height: 20 } };
    expect(movementDestination(200, "right", 1000, bridge)).toMatchObject({ x: 568, direction: 1, crossesSurface: true });
    expect(movementDestination(650, "left", 1000, bridge)).toMatchObject({ x: 272, direction: -1, crossesSurface: true });
  });

  it("stops beside a solid drawing instead of walking into its middle", () => {
    const box = { id: "box", type: "جعبه", physicsShape: "obstacle", bounds: { x: 400, y: 500, width: 80, height: 80 } };
    expect(movementDestination(200, null, 900, box).x).toBe(364);
    expect(movementDestination(700, null, 900, box).x).toBe(516);
    const flower = { id: "flower", type: "flower", physicsShape: null, bounds: { x: 400, y: 500, width: 80, height: 80 } };
    expect(movementDestination(200, null, 900, flower).x).toBe(440);
  });

  it("anchors the fishing line to the farthest rod point, not the hand", () => {
    const hand = { x: 100, y: 200 };
    const tip = farthestToolPoint(hand, [[hand, { x: 260, y: 120 }, { x: 180, y: 180 }]]);
    expect(tip).toEqual({ x: 260, y: 120 });
    expect(fishingHookPosition(tip, { x: 500, y: 400 }, 0)).toEqual({ x: 500, y: 400 });
    expect(fishingHookPosition(tip, { x: 500, y: 400 }, 1)).toEqual({ x: 270, y: 168 });
  });
});
