import { describe, expect, it } from "vitest";
import { buildRig } from "../../src/character/rig-builder.js";
import {
  installLivingLineHero,
  LIVING_LINE_HERO,
  LIVING_LINE_HERO_ID,
} from "../../src/character/living-line-hero.js";
import { StrokeStore } from "../../src/drawing/stroke-store.js";
import { RigRuntime } from "../../src/character/rig-runtime.js";
import { EMPTY_POSE } from "../../src/character/rig-runtime.js";

describe("authored living-line hero", () => {
  it("installs one fixed authored character without AI or duplicate strokes", () => {
    const store = new StrokeStore();
    const first = installLivingLineHero(store, 320, 540);
    const count = store.count();
    const second = installLivingLineHero(store, 320, 540);

    expect(first.version).toBe("3.0");
    expect(second.includedStrokeIds).toEqual(first.includedStrokeIds);
    expect(store.count()).toBe(count);
    expect(store.all().every((stroke) => stroke.entityId === LIVING_LINE_HERO_ID)).toBe(true);
    expect(first.joints.find((joint) => joint.id === "left_foot")?.y).toBe(540);
    expect(first.joints.find((joint) => joint.id === "right_hand")).toBeDefined();
    expect(first.joints.find((joint) => joint.id === "right_index_tip")).toBeDefined();
  });

  it("uses smooth, tightly controlled paths and stable semantic anchors", () => {
    const ids = new Set(LIVING_LINE_HERO.paths.map((path) => path.id));
    expect(ids.size).toBe(LIVING_LINE_HERO.paths.length);
    expect(LIVING_LINE_HERO.paths.every((path) => path.points.length >= 8)).toBe(true);
    expect(Math.max(...LIVING_LINE_HERO.paths.map((path) => path.width)) - Math.min(...LIVING_LINE_HERO.paths.map((path) => path.width))).toBeLessThan(1);
    expect(LIVING_LINE_HERO.attachmentAnchors).toEqual(expect.arrayContaining(["left_foot", "right_foot", "right_hand", "head"]));
  });

  it("builds a complete deterministic rig with populated face controls", () => {
    const store = new StrokeStore();
    const manifest = installLivingLineHero(store, 300, 500);
    const rig = buildRig(manifest, store);

    expect(rig.joints).toHaveLength(20);
    expect(rig.strokes.length).toBeGreaterThanOrEqual(LIVING_LINE_HERO.paths.length);
    expect(rig.face.leftEye?.points.length).toBeGreaterThan(0);
    expect(rig.face.rightEye?.points.length).toBeGreaterThan(0);
    expect(rig.face.mouth?.points.length).toBeGreaterThan(0);
  });

  it("aims the nearer authored index finger at a target and clears cleanly", () => {
    const store = new StrokeStore();
    const runtime = new RigRuntime(buildRig(installLivingLineHero(store, 300, 500), store), () => 0);
    const target = { x: 560, y: 340 };
    expect(runtime.pointAt(target)).toBe("right");
    runtime.applyPose(EMPTY_POSE);
    const hand = runtime.jointWorld("right_hand")!;
    const shoulder = runtime.jointWorld("right_shoulder")!;
    const tip = runtime.jointWorld("right_index_tip")!;
    const targetVector = { x: target.x - hand.x, y: target.y - hand.y };
    const fingerVector = { x: tip.x - hand.x, y: tip.y - hand.y };
    const cross = Math.abs(targetVector.x * fingerVector.y - targetVector.y * fingerVector.x);
    expect(cross / (Math.hypot(targetVector.x, targetVector.y) * Math.hypot(fingerVector.x, fingerVector.y))).toBeLessThan(0.01);
    const armTarget = { x: target.x - shoulder.x, y: target.y - shoulder.y };
    const armVector = { x: hand.x - shoulder.x, y: hand.y - shoulder.y };
    const armCross = Math.abs(armTarget.x * armVector.y - armTarget.y * armVector.x);
    expect(armCross / (Math.hypot(armTarget.x, armTarget.y) * Math.hypot(armVector.x, armVector.y))).toBeLessThan(0.01);
    runtime.clearPointing();
    expect(runtime.pointingHand).toBeNull();
  });
});
