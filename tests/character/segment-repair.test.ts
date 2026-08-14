import { describe, expect, it } from "vitest";
import { SegmentRepairEditor } from "../../src/character/segment-repair.js";
import type { CharacterManifest } from "../../src/character/character-manifest.js";

const manifest: CharacterManifest = {
  version: "2.0",
  joints: [{ id: "root", x: 10, y: 10, parent: null, confidence: 1 }],
  face: {},
  parts: [],
  includedStrokeIds: [],
  segmentOverrides: [],
  createdAt: 0,
};

describe("SegmentRepairEditor", () => {
  it("records a selected part lasso without changing source strokes", () => {
    const editor = new SegmentRepairEditor(structuredClone(manifest));
    editor.setPart("left_arm");
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 20, y: 0 });
    editor.pointerMove({ x: 20, y: 20 });
    editor.pointerMove({ x: 0, y: 20 });
    expect(editor.pointerUp()).toBe(true);
    expect(editor.manifest.segmentOverrides).toMatchObject([{ part: "left_arm" }]);
    expect(editor.manifest.includedStrokeIds).toEqual([]);
  });

  it("undoes the latest body-part correction", () => {
    const editor = new SegmentRepairEditor(structuredClone(manifest));
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 20, y: 0 });
    editor.pointerMove({ x: 20, y: 20 });
    editor.pointerUp();
    expect(editor.undo()).toBe(true);
    expect(editor.manifest.segmentOverrides).toEqual([]);
    expect(editor.undo()).toBe(false);
  });
});
