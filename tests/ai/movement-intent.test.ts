import { describe, expect, it } from "vitest";
import { inferredPhysicsShape, resolveMovementIntent } from "../../src/ai/movement-intent.js";
import type { AIActionRequest, DrawingObject } from "../../src/ai/schemas.js";

function object(type: string, physicsShape: DrawingObject["physicsShape"], x = 100, width = 200): DrawingObject {
  return {
    type,
    category: "other",
    boundingBox: { x, y: 100, width, height: 200 },
    attachTo: null,
    anchor: null,
    orientationDegrees: 0,
    affordances: [],
    physicsShape,
  };
}

const action = (type: AIActionRequest["type"], targetObjectIndex: number | null, direction: AIActionRequest["direction"] = null): AIActionRequest =>
  ({ type, targetObjectIndex, direction, durationMs: 900 });

describe("movement intent", () => {
  it("climbs drawn stairs the provider only reacted to", () => {
    const objects = [object("arrow", "none"), object("stairs", "stairs")];
    expect(resolveMovementIntent(objects, null)).toMatchObject({ type: "climb", targetObjectIndex: 1 });
    expect(resolveMovementIntent(objects, action("react", null))).toMatchObject({ type: "climb", targetObjectIndex: 1 });
    expect(resolveMovementIntent(objects, action("point", 1))).toMatchObject({ type: "climb", targetObjectIndex: 1 });
  });

  it("retargets a climb aimed at the arrow onto the structure", () => {
    const objects = [object("stairs", "stairs", 100, 500), object("arrow", "none", 300, 60)];
    expect(resolveMovementIntent(objects, action("climb", 1))).toMatchObject({ type: "climb", targetObjectIndex: 0 });
    expect(resolveMovementIntent(objects, action("move", 1))).toMatchObject({ type: "climb", targetObjectIndex: 0 });
  });

  it("climbs a drawn tower when asked to climb even though it is an obstacle", () => {
    const objects = [object("tower", "none")];
    expect(inferredPhysicsShape(objects[0])).toBe("obstacle");
    expect(resolveMovementIntent(objects, action("climb", null))).toMatchObject({ type: "climb", targetObjectIndex: 0 });
  });

  it("turns an upward move into a climb when there is something to climb", () => {
    const objects = [object("hill", "none")];
    expect(resolveMovementIntent(objects, action("move", null, "up"))).toMatchObject({ type: "climb", targetObjectIndex: 0 });
  });

  it("climbs a drawn ladder, even one only inferred from its name", () => {
    expect(resolveMovementIntent([object("نردبان", "none")], action("react", null))).toMatchObject({ type: "climb", targetObjectIndex: 0 });
    const beside = [object("tower", "obstacle", 300, 200), object("ladder", "ladder", 240, 60)];
    expect(resolveMovementIntent(beside, null)).toMatchObject({ type: "climb", targetObjectIndex: 1 });
  });

  it("turns a downward move into a jump down", () => {
    expect(resolveMovementIntent([object("arrow", "none")], action("move", null, "down"))).toMatchObject({ type: "jump", direction: "down" });
  });

  it("keeps deliberate actions and drawings without anything to climb", () => {
    const stairs = [object("stairs", "stairs")];
    expect(resolveMovementIntent(stairs, action("jump", null))).toMatchObject({ type: "jump" });
    expect(resolveMovementIntent(stairs, action("move", 0))).toMatchObject({ type: "move", targetObjectIndex: 0 });
    const flower = [object("flower", "none"), object("stairs", "stairs", 900, 100)];
    expect(resolveMovementIntent(flower, action("move", 0))).toMatchObject({ type: "move", targetObjectIndex: 0 });
    expect(resolveMovementIntent([object("sun", "none")], action("react", null))).toMatchObject({ type: "react" });
    expect(resolveMovementIntent([object("hat", "none")], null)).toBeNull();
  });
});
