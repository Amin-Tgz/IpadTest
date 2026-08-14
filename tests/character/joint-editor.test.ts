import { describe, expect, it } from "vitest";
import { JointEditor, hitTestBox, hitTestJoint } from "../../src/character/joint-editor.js";
import type { JointManifest } from "../../src/character/character-manifest.js";
import { StrokeStore } from "../../src/drawing/stroke-store.js";

const box = { x: 100, y: 100, width: 200, height: 300 };

describe("hitTestBox", () => {
  it("detects move inside the box", () => {
    expect(hitTestBox({ x: 200, y: 200 }, box).mode).toBe("move");
  });

  it("detects west edge resize", () => {
    expect(hitTestBox({ x: 105, y: 250 }, box).mode).toBe("resize_w");
  });

  it("detects north edge resize", () => {
    expect(hitTestBox({ x: 200, y: 105 }, box).mode).toBe("resize_n");
  });

  it("detects east edge resize", () => {
    expect(hitTestBox({ x: 295, y: 250 }, box).mode).toBe("resize_e");
  });

  it("falls back to toggle outside the box", () => {
    expect(hitTestBox({ x: 500, y: 500 }, box).mode).toBe("toggle");
  });
});

describe("hitTestJoint", () => {
  const joints: JointManifest[] = [
    { id: "root", x: 0, y: 0, parent: null, confidence: 1 },
    { id: "head", x: 100, y: 100, parent: "root", confidence: 1 },
  ];

  it("picks the nearest joint within radius", () => {
    const hit = hitTestJoint({ x: 95, y: 95 }, joints);
    expect(hit.mode).toBe("joint");
    expect(hit.jointIndex).toBe(1);
  });

  it("returns toggle when nothing is near", () => {
    expect(hitTestJoint({ x: 500, y: 500 }, joints).mode).toBe("toggle");
  });
});

describe("JointEditor streamlined workflow", () => {
  it("automatically includes boxed strokes and moves directly to joint correction", () => {
    const store = new StrokeStore();
    store.add({ id: "body", points: [{ x: 180, y: 180, pressure: 0.5, time: 0 }, { x: 190, y: 190, pressure: 0.5, time: 1 }], color: "#fff", baseWidth: 4, tool: "pen", createdAt: 0, worldSpace: true, entityId: null, active: true, groupId: null });
    const editor = new JointEditor(store, () => ({ width: 500, height: 500 }));
    editor.begin(box, { version: "1.0", joints: [{ id: "root", x: 180, y: 180, parent: null, confidence: 1 }], face: {}, parts: [], includedStrokeIds: ["body"], createdAt: 0 });
    editor.nextStage();
    expect(editor.stage).toBe("joints");
    expect(editor.manifest?.includedStrokeIds).toEqual(["body"]);
    expect(editor.box).toEqual(box);
  });
});
