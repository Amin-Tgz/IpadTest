import { describe, expect, it } from "vitest";
import { resolveBoneId, toLocalPoints, buildAttachmentFromObject, type DetectedObject } from "../../src/character/attachments.js";
import { buildRig } from "../../src/character/rig-builder.js";
import { RigRuntime } from "../../src/character/rig-runtime.js";
import { StrokeStore } from "../../src/drawing/stroke-store.js";
import type { CharacterManifest } from "../../src/character/character-manifest.js";
import type { IdMap } from "../../src/drawing/id-map.js";

const manifest: CharacterManifest = {
  version: "1.0",
  joints: [
    { id: "root", x: 100, y: 200, parent: null, confidence: 1 },
    { id: "left_foot", x: 80, y: 320, parent: "root", confidence: 1 },
    { id: "right_foot", x: 120, y: 320, parent: "root", confidence: 1 },
    { id: "right_hand", x: 160, y: 250, parent: "root", confidence: 1 },
  ],
  face: {},
  parts: [],
  includedStrokeIds: [],
  createdAt: 0,
};

function runtime() {
  const store = new StrokeStore();
  store.add({
    id: "shoe_l",
    points: [
      { x: 60, y: 315, pressure: 0.5, time: 0 },
      { x: 100, y: 315, pressure: 0.5, time: 0 },
      { x: 100, y: 325, pressure: 0.5, time: 0 },
      { x: 60, y: 325, pressure: 0.5, time: 0 },
    ],
    color: "#F7F5EE",
    baseWidth: 4,
    tool: "pen",
    createdAt: 0,
    worldSpace: true,
    entityId: null,
    active: true,
    groupId: null,
  });
  return new RigRuntime(buildRig(manifest, store), () => 0);
}

describe("resolveBoneId", () => {
  it("prefers the exact candidate joint", () => {
    const rt = runtime();
    expect(resolveBoneId("left_foot", { x: 80, y: 320 }, rt)).toBe("left_foot");
  });

  it("falls back to the nearest joint", () => {
    const rt = runtime();
    expect(resolveBoneId("mystery_bone", { x: 118, y: 322 }, rt)).toBe("right_foot");
  });

  it("returns null when no joints exist", () => {
    const store = new StrokeStore();
    const emptyManifest: CharacterManifest = { ...manifest, joints: [] };
    const rt = new RigRuntime(buildRig(emptyManifest, store), () => 0);
    expect(resolveBoneId("left_foot", { x: 0, y: 0 }, rt)).toBeNull();
  });
});

describe("toLocalPoints", () => {
  it("shifts points to anchor space", () => {
    const local = toLocalPoints(
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      { x: 5, y: 10 },
    );
    expect(local).toEqual([
      { x: 5, y: 10 },
      { x: 25, y: 30 },
    ]);
  });
});

describe("buildAttachmentFromObject", () => {
  it("returns null without attachTo or anchor", () => {
    const store = new StrokeStore();
    const rt = runtime();
    const idMap = {} as unknown as IdMap;
    expect(buildAttachmentFromObject({ type: "shoe", category: "wearable", boundingBox: { x: 0, y: 0, width: 10, height: 10 }, attachTo: null, anchor: null }, store, idMap, rt, 0)).toBeNull();
  });
});
