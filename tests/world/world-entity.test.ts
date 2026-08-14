import { describe, expect, it } from "vitest";
import { WorldEntityRegistry } from "../../src/world/world-entity.js";

describe("WorldEntityRegistry", () => {
  it("removes physics entities whose source ink was erased", () => {
    const registry = new WorldEntityRegistry();
    registry.upsert({
      id: "stairs",
      type: "stairs",
      sourceStrokeIds: ["step-1", "step-2"],
      bounds: { x: 0, y: 0, width: 100, height: 60 },
      affordances: ["climbable"],
      physicsShape: "stairs",
    });
    expect(registry.removeByStrokeIds(new Set(["step-2"]))).toEqual(["stairs"]);
    expect(registry.get("stairs")).toBeNull();
  });
});
