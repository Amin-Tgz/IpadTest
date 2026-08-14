import { describe, expect, it } from "vitest";
import { hitTestBox, hitTestJoint } from "../../src/character/joint-editor.js";
import type { JointManifest } from "../../src/character/character-manifest.js";

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
