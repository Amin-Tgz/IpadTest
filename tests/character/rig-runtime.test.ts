import { describe, expect, it } from "vitest";
import { buildRig } from "../../src/character/rig-builder.js";
import { RigRuntime } from "../../src/character/rig-runtime.js";
import { Camera } from "../../src/world/camera.js";
import { StrokeStore } from "../../src/drawing/stroke-store.js";
import type { CharacterManifest } from "../../src/character/character-manifest.js";

const manifest: CharacterManifest = {
  version: "1.0",
  joints: [
    { id: "root", x: 100, y: 200, parent: null, confidence: 1 },
    { id: "left_hip", x: 100, y: 200, parent: "root", confidence: 1 },
    { id: "left_knee", x: 100, y: 260, parent: "left_hip", confidence: 1 },
    { id: "left_foot", x: 100, y: 320, parent: "left_knee", confidence: 1 },
  ],
  face: {},
  parts: [],
  includedStrokeIds: ["leg"],
  createdAt: 0,
};

function rig() {
  const store = new StrokeStore();
  store.add({
    id: "leg",
    points: [
      { x: 100, y: 200, pressure: 0.5, time: 0 },
      { x: 100, y: 320, pressure: 0.5, time: 0 },
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
  return buildRig(manifest, store);
}

describe("RigRuntime forward kinematics", () => {
  it("keeps rest pose when no rotation is applied", () => {
    const runtime = new RigRuntime(rig(), () => 0);
    runtime.applyPose({
      jointRotations: {},
      rootDeltaX: 0,
      rootDeltaY: 0,
      rootRotation: 0,
    });
    const [stroke] = runtime.transformedStrokePoints();
    const last = stroke[stroke.length - 1];
    expect(last.x).toBeCloseTo(100, 3);
    expect(last.y).toBeCloseTo(320, 3);
  });

  it("rotates the foot around the knee when the knee rotates", () => {
    const runtime = new RigRuntime(rig(), () => 0);
    runtime.applyPose({
      jointRotations: { left_knee: 90 },
      rootDeltaX: 0,
      rootDeltaY: 0,
      rootRotation: 0,
    });
    const [stroke] = runtime.transformedStrokePoints();
    const last = stroke[stroke.length - 1];
    const knee = runtime.restJoint("left_knee")!;
    const dist = Math.hypot(last.x - knee.x, last.y - knee.y);
    expect(dist).toBeCloseTo(60, 3);
    expect(last.x).toBeLessThan(knee.x - 50);
  });

  it("applies root translation to the whole body", () => {
    const runtime = new RigRuntime(rig(), () => 0);
    runtime.applyPose({
      jointRotations: {},
      rootDeltaX: 30,
      rootDeltaY: -10,
      rootRotation: 0,
    });
    const [stroke] = runtime.transformedStrokePoints();
    expect(stroke[0].x).toBeCloseTo(130, 3);
    expect(stroke[0].y).toBeCloseTo(190, 3);
  });

  it("keeps entity movement after the pose returns to idle", () => {
    const runtime = new RigRuntime(rig(), () => 0);
    runtime.moveEntityTo(500, 200);
    runtime.applyPose({ jointRotations: {}, rootDeltaX: 0, rootDeltaY: 0, rootRotation: 0 });
    expect(runtime.jointWorld("root")).toMatchObject({ x: 500, y: 200 });
    const [stroke] = runtime.transformedStrokePoints();
    expect(stroke[0].x).toBeCloseTo(500, 3);
  });

  it("uses entity and camera transforms independently for anchors", () => {
    const runtime = new RigRuntime(rig(), () => 0);
    runtime.moveEntityTo(500, 200);
    const camera = new Camera();
    camera.setX(120);
    expect(runtime.jointWorld("left_foot")).toMatchObject({ x: 500, y: 320 });
    expect(runtime.jointScreen("left_foot", camera)).toMatchObject({ x: 380, y: 320 });
    expect(runtime.jointWorld("left_foot")).toMatchObject({ x: 500, y: 320 });
  });

  it("applies root rotation rather than silently ignoring it", () => {
    const runtime = new RigRuntime(rig(), () => 0);
    runtime.applyPose({ jointRotations: {}, rootDeltaX: 0, rootDeltaY: 0, rootRotation: 90 });
    const foot = runtime.jointWorld("left_foot")!;
    expect(foot.x).toBeLessThan(45);
    expect(foot.y).toBeCloseTo(200, 3);
  });

  it("uses the standard Y rotation term for asymmetric bone-local points", () => {
    const runtime = new RigRuntime(rig(), () => 0);
    runtime.applyPose({ jointRotations: { left_knee: 90 }, rootDeltaX: 0, rootDeltaY: 0, rootRotation: 0 });
    const knee = runtime.jointWorld("left_knee")!;
    const point = runtime.boneToWorld("left_knee", { x: 10, y: 20 });
    expect(point.x).toBeCloseTo(knee.x - 20, 3);
    expect(point.y).toBeCloseTo(knee.y + 10, 3);
  });

  it("blinks by squashing eye groups", () => {
    const store = new StrokeStore();
    store.add({
      id: "eye",
      points: [
        { x: 94, y: 96, pressure: 0.5, time: 0 },
        { x: 96, y: 96, pressure: 0.5, time: 0 },
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
    store.add({
      id: "leg",
      points: [
        { x: 100, y: 200, pressure: 0.5, time: 0 },
        { x: 100, y: 320, pressure: 0.5, time: 0 },
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
    const eyeManifest: CharacterManifest = {
      ...manifest,
      includedStrokeIds: ["eye", "leg"],
      face: { leftEye: { x: 95, y: 96 } },
    };
    const eyeStroke = store.byId("eye")!;
    eyeStroke.points = [
      { x: 95, y: 93, pressure: 0.5, time: 0 },
      { x: 95, y: 99, pressure: 0.5, time: 0 },
    ];
    const built = buildRig(eyeManifest, store);
    let clock = 100000;
    const runtime = new RigRuntime(built, () => clock);
    runtime.applyPose({
      jointRotations: {},
      rootDeltaX: 0,
      rootDeltaY: 0,
      rootRotation: 0,
    });

    const eyeYs = (): number[] => {
      const [eyeStroke] = runtime.transformedStrokePoints();
      return eyeStroke.map((p) => p.y);
    };
    const measure = (): number => {
      const ys = eyeYs();
      return Math.max(...ys) - Math.min(...ys);
    };

    const before = measure();
    while (measure() > before * 0.9 && clock < 200000) {
      clock += 100;
      runtime.update(clock);
    }
    const during = measure();
    expect(during).toBeLessThan(before * 0.9);
    expect(Math.min(...eyeYs())).toBeGreaterThan(85);
    expect(Math.max(...eyeYs())).toBeLessThan(110);
    clock += 1000;
    runtime.update(clock);
    expect(measure()).toBeGreaterThan(before * 0.95);
  });

  it("cycles the mouth between open and smiling shapes while speech is active", () => {
    const store = new StrokeStore();
    store.add({
      id: "mouth",
      points: [
        { x: 92, y: 112, pressure: 0.5, time: 0 },
        { x: 100, y: 112, pressure: 0.5, time: 1 },
        { x: 108, y: 112, pressure: 0.5, time: 2 },
      ],
      color: "#F7F5EE", baseWidth: 4, tool: "pen", createdAt: 0,
      worldSpace: true, entityId: null, active: true, groupId: null,
    });
    const mouthManifest: CharacterManifest = {
      ...manifest,
      joints: [...manifest.joints, { id: "head", x: 100, y: 100, parent: "root", confidence: 1 }],
      includedStrokeIds: ["mouth"],
      face: { mouth: { x: 100, y: 112 } },
    };
    let clock = 0;
    const runtime = new RigRuntime(buildRig(mouthManifest, store), () => clock);
    runtime.talkActive = true;
    const open = runtime.transformedStrokePoints()[0];
    clock = 115;
    const smile = runtime.transformedStrokePoints()[0];
    expect(smile.at(-1)!.x - smile[0].x).toBeGreaterThan(open.at(-1)!.x - open[0].x);
    expect(smile[1].y).toBeGreaterThan(open[1].y);
  });
});
