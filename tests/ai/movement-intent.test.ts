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

  it("rides a drawn motorcycle whether the provider reacted, used it, or asked to move", () => {
    const bike = [object("arrow", "none"), object("موتور سیکلت", "none")];
    expect(resolveMovementIntent(bike, null)).toMatchObject({ type: "ride", targetObjectIndex: 1 });
    expect(resolveMovementIntent(bike, action("react", null))).toMatchObject({ type: "ride", targetObjectIndex: 1 });
    expect(resolveMovementIntent(bike, action("use", 1))).toMatchObject({ type: "ride", targetObjectIndex: 1 });
    expect(resolveMovementIntent(bike, action("move", null, "left"))).toMatchObject({ type: "ride", targetObjectIndex: 1, direction: "left" });
    expect(resolveMovementIntent(bike, action("ride", 0))).toMatchObject({ type: "ride", targetObjectIndex: 1 });
    const ride = action("ride", 1);
    expect(resolveMovementIntent(bike, ride)).toBe(ride);
  });

  it("keeps a jump even when a vehicle is drawn", () => {
    expect(resolveMovementIntent([object("scooter", "vehicle")], action("jump", null))).toMatchObject({ type: "jump" });
  });

  it("turns a downward move into a jump down", () => {
    expect(resolveMovementIntent([object("arrow", "none")], action("move", null, "down"))).toMatchObject({ type: "jump", direction: "down" });
  });

  it("jumps down toward a down arrow whether the provider said move, climb, or jump", () => {
    const arrow = [{ ...object("arrow", "none"), affordances: ["points down", "step down from the stairs"] }];
    expect(resolveMovementIntent(arrow, action("move", 0, "down"))).toMatchObject({ type: "jump", targetObjectIndex: 0, direction: "down" });
    expect(resolveMovementIntent(arrow, action("climb", 0, "down"))).toMatchObject({ type: "jump", targetObjectIndex: 0, direction: "down" });
    expect(resolveMovementIntent(arrow, action("jump", 0, "down"))).toMatchObject({ type: "jump", targetObjectIndex: 0, direction: "down" });
  });

  it("never turns an arrow or written instruction into something to climb", () => {
    expect(inferredPhysicsShape({ ...object("arrow", "none"), affordances: ["step down"] })).toBeNull();
    expect(inferredPhysicsShape(object("down_arrow", "stairs"))).toBeNull();
    expect(inferredPhysicsShape(object("فلش رو به پایین", "none"))).toBeNull();
    expect(inferredPhysicsShape({ ...object("handwriting", "none"), affordances: ["برو از پله پایین"] })).toBeNull();
    expect(resolveMovementIntent([{ ...object("arrow", "none"), affordances: ["step down"] }], null)).toBeNull();
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
