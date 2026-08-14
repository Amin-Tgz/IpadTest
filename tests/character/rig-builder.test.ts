import { describe, expect, it } from "vitest";
import { buildRig, nearestJoint, pointInfluences, type RigJoint } from "../../src/character/rig-builder.js";
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

describe("weighted joint ownership", () => {
  it("blends a sample near a parent-child seam", () => {
    const joints: RigJoint[] = [
      { id: "left_hip", restX: 0, restY: 0, parent: "root" },
      { id: "left_knee", restX: 0, restY: 60, parent: "left_hip" },
      { id: "left_foot", restX: 0, restY: 120, parent: "left_knee" },
      { id: "root", restX: 0, restY: -10, parent: null },
    ];
    const influences = pointInfluences(0, 32, joints.slice(0, 3), joints);
    expect(influences).toHaveLength(2);
    expect(influences.reduce((sum, influence) => sum + influence.weight, 0)).toBeCloseTo(1);
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
    expect(leg.points.every((point) => point.influences.length >= 1)).toBe(true);
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

  it("adds a non-destructive connector between nearby pen lifts", () => {
    const store = new StrokeStore();
    makeStroke(store, "leg", [[100, 210], [100, 250]]);
    makeStroke(store, "eye", [[100, 258], [100, 300]]);
    const connectorManifest: CharacterManifest = {
      ...manifest,
      face: {},
      includedStrokeIds: ["leg", "eye"],
      parts: [
        { part: "left_leg", strokeIds: ["leg"] },
        { part: "left_leg", strokeIds: ["eye"] },
      ],
    };
    const rig = buildRig(connectorManifest, store);
    expect(rig.strokes.some((stroke) => stroke.id.startsWith("auto_connector_"))).toBe(true);
    expect(store.all()).toHaveLength(2);
  });

  it("assigns nearby facial ink to distinct eyes and eyebrows", () => {
    const store = new StrokeStore();
    makeStroke(store, "left_eye", [[93, 94], [93, 100]]);
    makeStroke(store, "right_eye", [[107, 94], [107, 100]]);
    makeStroke(store, "left_brow", [[89, 86], [96, 84]]);
    makeStroke(store, "right_brow", [[104, 84], [111, 86]]);
    const facialManifest: CharacterManifest = {
      ...manifest,
      includedStrokeIds: ["left_eye", "right_eye", "left_brow", "right_brow"],
      face: {
        leftEye: { x: 93, y: 97 }, rightEye: { x: 107, y: 97 },
        leftEyebrow: { x: 93, y: 85 }, rightEyebrow: { x: 107, y: 85 },
      },
    };
    const face = buildRig(facialManifest, store).face;
    expect(face.leftEye?.points).toHaveLength(2);
    expect(face.rightEye?.points).toHaveLength(2);
    expect(face.leftEyebrow?.points).toHaveLength(2);
    expect(face.rightEyebrow?.points).toHaveLength(2);
  });
});
