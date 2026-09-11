import { describe, expect, it } from "vitest";
import { Camera, verticalFollowTarget } from "../../src/world/camera.js";

describe("camera", () => {
  it("rises to keep a hero standing on a tall drawing on screen, and never sinks below the ground framing", () => {
    expect(verticalFollowTarget(400, 768)).toBe(0);
    expect(verticalFollowTarget(-40, 768)).toBeCloseTo(-40 - 768 * 0.2);
    expect(verticalFollowTarget(100, 500)).toBe(-40);
  });

  it("round-trips world to screen and back", () => {
    const camera = new Camera();
    camera.setX(120);
    const screen = camera.worldToScreen({ x: 400, y: 200 });
    expect(screen).toEqual({ x: 280, y: 200 });
    const world = camera.screenToWorld(screen);
    expect(world.x).toBeCloseTo(400);
    expect(world.y).toBeCloseTo(200);
  });

  it("applies zoom", () => {
    const camera = new Camera();
    camera.state.zoom = 2;
    const screen = camera.worldToScreen({ x: 10, y: 30 });
    expect(screen).toEqual({ x: 20, y: 60 });
  });
});
