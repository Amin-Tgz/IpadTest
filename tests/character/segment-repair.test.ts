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

  it("previews the selected mask and maps fingers to the hand region", () => {
    const previewManifest: CharacterManifest = {
      ...structuredClone(manifest),
      parts: [{
        part: "left_hand",
        strokeIds: ["hand"],
        polygon: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
      }],
    };
    const editor = new SegmentRepairEditor(previewManifest);
    editor.previewPart("left_fingers", 2000);
    expect(editor.activePart).toBe("left_fingers");
    expect(editor.previewActive).toBe(true);
    expect(editor.previewMaskPolygons()).toHaveLength(1);
    editor.pointerDown({ x: 2, y: 2 });
    expect(editor.previewActive).toBe(false);
  });

  it("builds an eyebrow preview around its face anchor", () => {
    const eyebrowManifest: CharacterManifest = {
      ...structuredClone(manifest),
      face: { leftEyebrow: { x: 50, y: 40 } },
    };
    const editor = new SegmentRepairEditor(eyebrowManifest);
    editor.previewPart("left_eyebrow");
    expect(editor.previewMaskPolygons()[0]).toHaveLength(4);
  });
});
