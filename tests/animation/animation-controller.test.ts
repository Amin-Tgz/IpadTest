import { describe, expect, it, vi } from "vitest";
import { evaluateMotion, MOTION_CLIPS } from "../../src/animation/motion-clips.js";
import { AnimationController } from "../../src/animation/animation-controller.js";

describe("evaluateMotion", () => {
  it("interpolates track values", () => {
    const clip = MOTION_CLIPS.walk;
    const pose = evaluateMotion(clip, clip.durationMs * 0.5);
    expect(Math.abs(pose.jointRotations.left_hip!)).toBeCloseTo(14, 5);
    expect(Math.abs(pose.jointRotations.left_hip!)).toBeLessThan(20);
  });

  it("returns zero pose for empty clip at t=0", () => {
    const pose = evaluateMotion(MOTION_CLIPS.spawn, 0);
    expect(pose.rootDeltaY).not.toBeUndefined();
  });

  it("clamps time to the clip duration", () => {
    const pose = evaluateMotion(MOTION_CLIPS.spawn, 999999);
    expect(pose.rootDeltaY).toBeCloseTo(0, 5);
  });
});

describe("AnimationController", () => {
  it("returns identity pose when nothing is playing", () => {
    const controller = new AnimationController();
    const pose = controller.update(1000);
    expect(pose.jointRotations).toEqual({});
    expect(pose.rootDeltaY).toBe(0);
  });

  it("loops looping clips", () => {
    const controller = new AnimationController();
    controller.play(MOTION_CLIPS.walk);
    const pose = controller.update(1000 + MOTION_CLIPS.walk.durationMs * 2.5);
    expect(controller.currentId).toBe("walk");
    expect(pose.jointRotations.left_hip).not.toBeUndefined();
  });

  it("stops and fires onClipEnd for one-shot clips", () => {
    const controller = new AnimationController();
    const onClipEnd = vi.fn();
    controller.onClipEnd = onClipEnd;
    controller.play(MOTION_CLIPS.spawn);
    controller.update(1000 + MOTION_CLIPS.spawn.durationMs + 1);
    expect(onClipEnd).toHaveBeenCalledWith("spawn");
    expect(controller.currentId).toBeNull();
  });

  it("honours loop override on one-shot clips", () => {
    const controller = new AnimationController();
    const onClipEnd = vi.fn();
    controller.onClipEnd = onClipEnd;
    controller.play(MOTION_CLIPS.spawn, { loop: true });
    controller.update(1000 + MOTION_CLIPS.spawn.durationMs * 3);
    expect(onClipEnd).not.toHaveBeenCalled();
    expect(controller.currentId).toBe("spawn");
  });
});
