import { describe, expect, it } from "vitest";
import { buildRig, nearestJoint, type RigJoint } from "../../src/character/rig-builder.js";
import { StrokeStore } from "../../src/drawing/stroke-store.js";
import type { CharacterManifest } from "../../src/character/character-manifest.js";

function makeStroke(store: StrokeStore, id: string, pts: Array<[number, number]>) {
  store.add({
    id,
    points: pts.map(([x, y]) => ({ x, y, pressure: 0.5, time: 0 })),
    color: "#F7F5EE",
    baseWidth: 4,
    tool: "pen",
    createdAt: 0,
    worldSpace: true,
    entityId: null,
    active: true,
    groupId: null,
  });
}

const manifest: CharacterManifest = {
  version: "1.0",
  joints: [
    { id: "root", x: 100, y: 200, parent: null, confidence: 1 },
    { id: "left_hip", x: 102, y: 204, parent: "root", confidence: 1 },
    { id: "left_knee", x: 102, y: 264, parent: "left_hip", confidence: 1 },
    { id: "left_foot", x: 102, y: 324, parent: "left_knee", confidence: 1 },
    { id: "head", x: 100, y: 100, parent: "root", confidence: 1 },
  ],
  face: { leftEye: { x: 95, y: 96 } },
  parts: [],
  includedStrokeIds: ["leg", "eye"],
  createdAt: 0,
};

describe("nearestJoint", () => {
  const joints: RigJoint[] = [
    { id: "root", restX: 0, restY: 0, parent: null },
    { id: "head", restX: 100, restY: 0, parent: "root" },
  ];

  it("assigns points to the closest joint", () => {
    expect(nearestJoint(95, 2, joints)?.id).toBe("head");
    expect(nearestJoint(3, 3, joints)?.id).toBe("root");
  });
});

describe("buildRig", () => {
  it("preserves original stroke samples while assigning stable joints", () => {
    const store = new StrokeStore();
    makeStroke(store, "leg", [
      [100, 210],
      [100, 324],
    ]);
    makeStroke(store, "eye", [
      [94, 96],
      [96, 96],
    ]);
    const rig = buildRig(manifest, store);
    const leg = rig.strokes.find((s) => s.id === "leg")!;
    expect(leg.points.length).toBe(store.byId("leg")!.points.length);
    const jointsSeen = new Set(leg.points.map((p) => p.jointId));
    expect(jointsSeen.has("left_foot")).toBe(true);
    expect(leg.points[0].jointId).toBe("left_hip");
    expect(leg.points[leg.points.length - 1].jointId).toBe("left_foot");
  });

  it("collects eye points into the face group", () => {
    const store = new StrokeStore();
    makeStroke(store, "leg", [
      [100, 200],
      [100, 320],
    ]);
    makeStroke(store, "eye", [
      [94, 96],
      [96, 96],
    ]);
    const rig = buildRig(manifest, store);
    expect(rig.face.leftEye).not.toBeNull();
    expect(rig.face.leftEye!.points.length).toBeGreaterThan(0);
    expect(rig.face.mouth).toBeNull();
  });
});
