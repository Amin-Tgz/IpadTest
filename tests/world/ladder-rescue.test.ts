import { describe, expect, it } from "vitest";
import { PALETTE } from "../../src/app/constants.js";
import type { Stroke } from "../../src/drawing/stroke-store.js";
import {
  createLadderRescuePlan,
  MovableWorldObject,
  RescueStateController,
  rescueWaypointAt,
} from "../../src/world/ladder-rescue.js";

const ladderStroke = (): Stroke => ({
  id: "ladder-ink",
  points: [
    { x: 300, y: 500, pressure: 0.5, time: 0 },
    { x: 300, y: 620, pressure: 0.5, time: 10 },
    { x: 340, y: 620, pressure: 0.5, time: 20 },
    { x: 340, y: 500, pressure: 0.5, time: 30 },
  ],
  color: PALETTE.primaryInk,
  baseWidth: 4,
  tool: "pen",
  createdAt: 0,
  worldSpace: true,
  entityId: null,
  active: true,
  groupId: null,
});

describe("drawn ladder rescue", () => {
  it("moves a separate ladder entity without changing raw user points", () => {
    const source = ladderStroke();
    const original = structuredClone(source.points);
    const movable = new MovableWorldObject("ladder", [source]);
    const plan = createLadderRescuePlan({ hero: { x: 410, y: 748 }, baselineY: 600, leftEdge: 370, rightEdge: 455, ladder: movable });
    movable.setPlacementProgress(plan.targetTransform, 1);
    expect(source.points).toEqual(original);
    expect(movable.rawStrokes[0]).toEqual(original);
    expect(movable.transformedStrokes()[0]).not.toEqual(original);
  });

  it("generates deterministic upward waypoints ending on intact ground", () => {
    const movable = new MovableWorldObject("ladder", [ladderStroke()]);
    const plan = createLadderRescuePlan({ hero: { x: 410, y: 748 }, baselineY: 600, leftEdge: 370, rightEdge: 510, ladder: movable });
    expect(plan.edge).toBe("left");
    expect(plan.waypoints.length).toBeGreaterThanOrEqual(5);
    for (let index = 1; index < plan.waypoints.length; index++) {
      expect(plan.waypoints[index].y).toBeLessThanOrEqual(plan.waypoints[index - 1].y);
    }
    expect(plan.waypoints.at(-1)).toEqual(plan.landing);
    expect(rescueWaypointAt(plan, 0)).toMatchObject({ x: plan.waypoints[0].x, y: plan.waypoints[0].y });
    expect(rescueWaypointAt(plan, 1)).toMatchObject({ x: plan.landing.x, y: plan.landing.y });
  });

  it("transitions fallen, rescuing, and recovered states exactly once", () => {
    const state = new RescueStateController();
    expect(state.markFallen()).toBe(true);
    expect(state.markFallen()).toBe(false);
    expect(state.phase).toBe("FALLEN_WAITING_RESCUE");
    expect(state.begin()).toBe(true);
    expect(state.begin()).toBe(false);
    expect(state.complete()).toBe(true);
    expect(state.complete()).toBe(false);
    expect(state.phase).toBe("RECOVERED");
  });
});
