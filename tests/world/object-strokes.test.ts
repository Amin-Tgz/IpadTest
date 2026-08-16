import { describe, expect, it } from "vitest";
import { resolveObjectStrokes, type ObjectBox, type StrokeGeometry } from "../../src/world/object-strokes.js";

function boxStroke(id: string, x: number, y: number, width = 120, height = 48): StrokeGeometry {
  return {
    id,
    points: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
      { x, y },
    ],
  };
}

describe("resolveObjectStrokes", () => {
  it("assigns a stroke to the object box that contains it", () => {
    const strokes = [boxStroke("shoe_a", 640, 235), boxStroke("shoe_b", 880, 235)];
    const boxes: ObjectBox[] = [
      { x: 630, y: 230, width: 140, height: 60 },
      { x: 870, y: 230, width: 140, height: 60 },
    ];
    const result = resolveObjectStrokes(strokes, boxes);
    expect(result.perObject).toEqual([["shoe_a"], ["shoe_b"]]);
    expect(result.unmatched).toEqual([]);
  });

  it("keeps a drawing whose object box the model placed slightly off target", () => {
    // Reproduces a real provider response: the shoe box arrived ~90px below the
    // strokes it described. Strict containment dropped the child's artwork.
    const strokes = [boxStroke("shoe_a", 637, 233, 126, 49)];
    const boxes: ObjectBox[] = [{ x: 619, y: 322, width: 130, height: 76 }];
    const result = resolveObjectStrokes(strokes, boxes);
    expect(result.perObject).toEqual([["shoe_a"]]);
    expect(result.unmatched).toEqual([]);
  });

  it("assigns each stroke to the nearest box rather than the first near one", () => {
    const strokes = [boxStroke("shoe_a", 637, 233, 126, 49), boxStroke("shoe_b", 877, 233, 126, 49)];
    const boxes: ObjectBox[] = [
      { x: 860, y: 322, width: 130, height: 76 },
      { x: 619, y: 322, width: 130, height: 76 },
    ];
    const result = resolveObjectStrokes(strokes, boxes);
    expect(result.perObject).toEqual([["shoe_b"], ["shoe_a"]]);
  });

  it("treats ink far from every recognized object as instruction ink", () => {
    const strokes = [boxStroke("shoe_a", 640, 235), boxStroke("writing", 120, 700, 200, 40)];
    const boxes: ObjectBox[] = [{ x: 630, y: 230, width: 140, height: 60 }];
    const result = resolveObjectStrokes(strokes, boxes);
    expect(result.perObject).toEqual([["shoe_a"]]);
    expect(result.unmatched).toEqual(["writing"]);
  });

  it("treats every stroke as instruction ink when nothing physical was recognized", () => {
    const strokes = [boxStroke("writing", 120, 700, 200, 40)];
    const result = resolveObjectStrokes(strokes, []);
    expect(result.perObject).toEqual([]);
    expect(result.unmatched).toEqual(["writing"]);
  });

  it("never assigns one stroke to two objects", () => {
    const strokes = [boxStroke("shoe_a", 640, 235)];
    const boxes: ObjectBox[] = [
      { x: 630, y: 230, width: 140, height: 60 },
      { x: 640, y: 235, width: 140, height: 60 },
    ];
    const result = resolveObjectStrokes(strokes, boxes);
    expect(result.perObject.flat()).toEqual(["shoe_a"]);
  });

  it("ignores strokes without points", () => {
    const result = resolveObjectStrokes([{ id: "empty", points: [] }], [{ x: 0, y: 0, width: 10, height: 10 }]);
    expect(result.perObject).toEqual([[]]);
    expect(result.unmatched).toEqual([]);
  });
});
