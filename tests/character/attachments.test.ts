import { describe, expect, it } from "vitest";
import { resolveBoneId, toLocalPoints, buildAttachmentFromObject, wearableFitScale, type DetectedObject } from "../../src/character/attachments.js";
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

describe("wearableFitScale", () => {
  it("leaves a drawing that already suits the hero untouched", () => {
    expect(wearableFitScale(50, 20, 180)).toBe(1);
  });

  it("never enlarges a small drawing", () => {
    expect(wearableFitScale(10, 6, 180)).toBe(1);
  });

  it("shrinks a shoe drawn far larger than the hero", () => {
    // 126px of ink on a 176px hero swallows the legs; 0.38 of hero height is
    // still a generous cartoon shoe.
    const scale = wearableFitScale(126, 49, 176);
    expect(scale).toBeCloseTo((176 * 0.38) / 126, 5);
    expect(126 * scale).toBeCloseTo(66.88, 2);
  });

  it("keeps the child's drawing recognizable however big it was", () => {
    expect(wearableFitScale(4000, 3000, 176)).toBe(0.35);
  });

  it("falls back to no scaling without a usable character height", () => {
    expect(wearableFitScale(120, 40, 0)).toBe(1);
    expect(wearableFitScale(0, 0, 180)).toBe(1);
  });
});

describe("buildAttachmentFromObject", () => {
  it("returns null without attachTo or anchor", () => {
    const store = new StrokeStore();
    const rt = runtime();
    const idMap = {} as unknown as IdMap;
    expect(buildAttachmentFromObject({ type: "shoe", category: "wearable", boundingBox: { x: 0, y: 0, width: 10, height: 10 }, attachTo: null, anchor: null }, store, idMap, rt, 0)).toBeNull();
  });

  it("preserves each source stroke and transfers render ownership", () => {
    const store = new StrokeStore();
    for (const id of ["shoe_1", "shoe_2", "shoe_3"]) {
      store.add({
        id,
        points: [{ x: 60, y: 315, pressure: 0.5, time: 0 }, { x: 90, y: 325, pressure: 0.5, time: 1 }],
        color: "#F7F5EE", baseWidth: 4, tool: "pen", createdAt: 0, worldSpace: true, entityId: null, active: true, groupId: null,
      });
    }
    const rt = new RigRuntime(buildRig(manifest, store), () => 0);
    const idMap = { sampleStrokesInRegion: () => new Set(["shoe_1", "shoe_2", "shoe_3"]) } as unknown as IdMap;
    const attachment = buildAttachmentFromObject(
      { type: "shoe", category: "wearable", boundingBox: { x: 50, y: 300, width: 60, height: 40 }, attachTo: "left_foot", anchor: { x: 80, y: 320 } },
      store, idMap, rt, 0, new Set(["shoe_1", "shoe_2", "shoe_3"]),
    )!;
    expect(attachment.strokes).toHaveLength(3);
    expect(attachment.sourceStrokeIds).toEqual(["shoe_1", "shoe_2", "shoe_3"]);
    expect(store.byId("shoe_1")?.entityId).toBe(attachment.id);
  });

  it("uses the caller's stroke set when the AI box missed the ink entirely", () => {
    const store = new StrokeStore();
    store.add({
      id: "shoe_right",
      points: [{ x: 300, y: 100, pressure: 0.5, time: 0 }, { x: 360, y: 130, pressure: 0.5, time: 1 }],
      color: "#F7F5EE", baseWidth: 4, tool: "pen", createdAt: 0, worldSpace: true, entityId: null, active: true, groupId: null,
    });
    const rt = new RigRuntime(buildRig(manifest, store), () => 0);
    const idMap = { sampleStrokesInRegion: () => new Set<string>() } as unknown as IdMap;
    const attachment = buildAttachmentFromObject(
      { type: "shoe", category: "wearable", boundingBox: { x: 700, y: 700, width: 40, height: 20 }, attachTo: "right_foot", anchor: { x: 720, y: 710 } },
      store, idMap, rt, 0, new Set(["shoe_right"]), 10, new Set(["shoe_right"]),
    )!;
    expect(attachment.sourceStrokeIds).toEqual(["shoe_right"]);
  });

  it("anchors a shoe on the ink the child drew, not on a misplaced box", () => {
    const store = new StrokeStore();
    store.add({
      id: "shoe_left",
      points: [{ x: 60, y: 300, pressure: 0.5, time: 0 }, { x: 140, y: 340, pressure: 0.5, time: 1 }],
      color: "#F7F5EE", baseWidth: 4, tool: "pen", createdAt: 0, worldSpace: true, entityId: null, active: true, groupId: null,
    });
    const rt = new RigRuntime(buildRig(manifest, store), () => 0);
    const idMap = { sampleStrokesInRegion: () => new Set(["shoe_left"]) } as unknown as IdMap;
    const attachment = buildAttachmentFromObject(
      { type: "shoe", category: "wearable", boundingBox: { x: 60, y: 900, width: 80, height: 40 }, attachTo: "left_foot", anchor: { x: 100, y: 920 } },
      store, idMap, rt, 0, new Set(["shoe_left"]),
    )!;
    // Ink spans x 60..140 and y 300..340, so the anchor is its centre-x and the
    // sole line — independent of the box the provider reported.
    const [first, last] = attachment.strokes[0].localPoints;
    expect(first.x).toBe(-40);
    expect(last.x).toBe(40);
    expect(first.y).toBeCloseTo(-32.8, 6);
    expect(last.y).toBeCloseTo(7.2, 6);
  });

  it("never lets one object's attachment swallow a second drawing", () => {
    const store = new StrokeStore();
    for (const [id, x] of [["shoe_a", 60], ["shoe_b", 300]] as const) {
      store.add({
        id,
        points: [{ x, y: 300, pressure: 0.5, time: 0 }, { x: x + 60, y: 330, pressure: 0.5, time: 1 }],
        color: "#F7F5EE", baseWidth: 4, tool: "pen", createdAt: 0, worldSpace: true, entityId: null, active: true, groupId: null,
      });
    }
    const rt = new RigRuntime(buildRig(manifest, store), () => 0);
    // The region sampler bleeding a neighbouring drawing into the box must not
    // hand both shoes to a single foot.
    const idMap = { sampleStrokesInRegion: () => new Set(["shoe_a", "shoe_b"]) } as unknown as IdMap;
    const attachment = buildAttachmentFromObject(
      { type: "shoe", category: "wearable", boundingBox: { x: 55, y: 295, width: 70, height: 40 }, attachTo: "left_foot", anchor: { x: 90, y: 315 } },
      store, idMap, rt, 0, new Set(["shoe_a", "shoe_b"]), 10, new Set(["shoe_a"]),
    )!;
    expect(attachment.sourceStrokeIds).toEqual(["shoe_a"]);
  });

  it("keeps an entire selected stroke even when the AI box covers only part of it", () => {
    const store = new StrokeStore();
    store.add({
      id: "balloon_and_string",
      points: [
        { x: 150, y: 100, pressure: 0.5, time: 0 },
        { x: 160, y: 110, pressure: 0.5, time: 1 },
        { x: 160, y: 260, pressure: 0.5, time: 2 },
      ],
      color: "#F7F5EE", baseWidth: 4, tool: "pen", createdAt: 0, worldSpace: true, entityId: null, active: true, groupId: null,
    });
    const rt = runtime();
    const idMap = { sampleStrokesInRegion: () => new Set(["balloon_and_string"]) } as unknown as IdMap;
    const attachment = buildAttachmentFromObject(
      { type: "balloon", category: "held_tool", boundingBox: { x: 140, y: 90, width: 40, height: 40 }, attachTo: "right_hand", anchor: { x: 160, y: 250 } },
      store, idMap, rt, 0,
    )!;
    expect(attachment.strokes[0].localPoints).toHaveLength(3);
    expect(Math.max(...attachment.strokes[0].localPoints.map((point) => point.y))).toBe(10);
  });
});
