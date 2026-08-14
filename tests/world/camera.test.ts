import { describe, expect, it } from "vitest";
import { Camera } from "../../src/world/camera.js";

describe("camera", () => {
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
