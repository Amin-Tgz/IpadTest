import { describe, expect, it } from "vitest";
import { StrokeStore, nextId, type Stroke } from "../../src/drawing/stroke-store.js";

function makeStroke(id: string): Stroke {
  return {
    id,
    points: [{ x: 0, y: 0, pressure: 0.5, time: 0 }],
    color: "#F7F5EE",
    baseWidth: 4,
    tool: "pen",
    createdAt: 0,
    worldSpace: true,
    entityId: null,
    active: true,
    groupId: null,
  };
}

describe("stroke-store", () => {
  it("adds and lists strokes in order", () => {
    const store = new StrokeStore();
    store.add(makeStroke("a"));
    store.add(makeStroke("b"));
    expect(store.all().map((s) => s.id)).toEqual(["a", "b"]);
    expect(store.count()).toBe(2);
  });

  it("undo deactivates the last stroke without removing it", () => {
    const store = new StrokeStore();
    store.add(makeStroke("a"));
    store.add(makeStroke("b"));
    const removed = store.undo();
    expect(removed?.id).toBe("b");
    expect(store.byId("b")?.active).toBe(false);
    expect(store.count()).toBe(2);
  });

  it("can limit undo to child-authored ink", () => {
    const store = new StrokeStore();
    store.add({ ...makeStroke("hero"), entityId: "living_line_hero" });
    store.add(makeStroke("child"));
    expect(store.undo((stroke) => stroke.entityId === null)?.id).toBe("child");
    expect(store.undo((stroke) => stroke.entityId === null)).toBeUndefined();
    expect(store.byId("hero")?.active).toBe(true);
  });

  it("setInactiveFrom deactivates all strokes from index", () => {
    const store = new StrokeStore();
    store.add(makeStroke("a"));
    store.add(makeStroke("b"));
    store.add(makeStroke("c"));
    store.setInactiveFrom(1);
    expect(store.active().map((s) => s.id)).toEqual(["a"]);
  });

  it("nextId produces unique ids", () => {
    const ids = new Set([nextId("s"), nextId("s"), nextId("g")]);
    expect(ids.size).toBe(3);
  });

  it("erases only the touched portion of an active user stroke", () => {
    const store = new StrokeStore();
    store.add({ ...makeStroke("line"), points: [
      { x: 0, y: 0, pressure: 0.5, time: 0 }, { x: 10, y: 0, pressure: 0.5, time: 1 },
      { x: 20, y: 0, pressure: 0.5, time: 2 }, { x: 30, y: 0, pressure: 0.5, time: 3 },
      { x: 40, y: 0, pressure: 0.5, time: 4 }, { x: 50, y: 0, pressure: 0.5, time: 5 },
      { x: 60, y: 0, pressure: 0.5, time: 6 },
    ] });
    expect(store.eraseNear({ x: 30, y: 0 }, 5)).toBe(1);
    expect(store.byId("line")?.active).toBe(false);
    expect(store.active()).toHaveLength(2);
  });

  it("reports original stroke ids for physics entity cleanup", () => {
    const store = new StrokeStore();
    store.add(makeStroke("world-ink"));
    const result = store.eraseNearWithIds({ x: 1, y: 0 }, 8);
    expect(result.count).toBe(1);
    expect(result.strokeIds).toEqual(["world-ink"]);
  });
});
