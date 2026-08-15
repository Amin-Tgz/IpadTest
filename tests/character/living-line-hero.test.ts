import { describe, expect, it } from "vitest";
import { buildRig } from "../../src/character/rig-builder.js";
import {
  installLivingLineHero,
  LIVING_LINE_HERO,
  LIVING_LINE_HERO_ID,
} from "../../src/character/living-line-hero.js";
import { StrokeStore } from "../../src/drawing/stroke-store.js";

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

    expect(rig.joints).toHaveLength(16);
    expect(rig.strokes.length).toBeGreaterThanOrEqual(LIVING_LINE_HERO.paths.length);
    expect(rig.face.leftEye?.points.length).toBeGreaterThan(0);
    expect(rig.face.rightEye?.points.length).toBeGreaterThan(0);
    expect(rig.face.mouth?.points.length).toBeGreaterThan(0);
  });
});
