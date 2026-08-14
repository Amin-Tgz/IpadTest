import { describe, expect, it } from "vitest";
import { encodeIdColor, decodeIdColor, IdColorRegistry, strokesInsideBox } from "../../src/drawing/id-map.js";
import { StrokeStore } from "../../src/drawing/stroke-store.js";

describe("id color encoding", () => {
  it("round-trips color values", () => {
    for (const n of [1, 2, 255, 256, 65536, 0xffffff]) {
      expect(decodeIdColor(encodeIdColor(n))).toBe(n);
    }
  });

  it("produces distinct colors for distinct ids", () => {
    expect(encodeIdColor(1)).not.toBe(encodeIdColor(2));
  });
});

describe("IdColorRegistry", () => {
  it("reuses colors and resolves ids", () => {
    const registry = new IdColorRegistry();
    const color = registry.colorFor("stroke_a");
    expect(registry.colorFor("stroke_a")).toBe(color);
    expect(registry.idFor(color)).toBe("stroke_a");
    expect(registry.idFor(encodeIdColor(99999))).toBeNull();
  });
});

describe("strokesInsideBox", () => {
  const store = new StrokeStore();
  const strokeIn = {
    id: "in",
    points: [
      { x: 10, y: 10, pressure: 0.5, time: 0 },
      { x: 20, y: 20, pressure: 0.5, time: 0 },
    ],
    color: "#F7F5EE",
    baseWidth: 4,
    tool: "pen" as const,
    createdAt: 0,
    worldSpace: true as const,
    entityId: null,
    active: true,
    groupId: null,
  };
  const strokeOut = {
    ...strokeIn,
    id: "out",
    points: [
      { x: 900, y: 900, pressure: 0.5, time: 0 },
      { x: 910, y: 910, pressure: 0.5, time: 0 },
    ],
  };
  const strokeMixed = {
    ...strokeIn,
    id: "mixed",
    points: [
      { x: 5, y: 5, pressure: 0.5, time: 0 },
      { x: 500, y: 500, pressure: 0.5, time: 0 },
      { x: 600, y: 600, pressure: 0.5, time: 0 },
      { x: 700, y: 700, pressure: 0.5, time: 0 },
    ],
  };
  const strokes = [strokeIn, strokeOut, strokeMixed];

  it("keeps strokes mostly inside the box", () => {
    const result = strokesInsideBox(strokes, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.has("in")).toBe(true);
    expect(result.has("out")).toBe(false);
  });

  it("excludes strokes with fewer than 30% points inside", () => {
    const result = strokesInsideBox(strokes, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.has("mixed")).toBe(false);
  });
});
