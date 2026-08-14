import { describe, expect, it } from "vitest";
import {
  jointsFromAnalysis,
  verifyManifest,
  ensureValidParents,
  missingJoints,
  type CharacterManifest,
  type JointManifest,
} from "../../src/character/character-manifest.js";
import type { CharacterAnalysis } from "../../src/ai/schemas.js";

const mapping = { scale: 2, cameraX: 100, width: 512, height: 512 };

const analysis: CharacterAnalysis = {
  version: "1.0",
  character: {
    type: "humanoid_line_character",
    boundingBox: { x: 200, y: 300, width: 200, height: 400 },
    pose: "front_or_three_quarter",
    confidence: 0.9,
    joints: [
      { id: "root", x: 300, y: 500, parent: null, confidence: 0.95 },
      { id: "torso", x: 300, y: 450, parent: "root", confidence: 0.9 },
      { id: "left_foot", x: 260, y: 700, parent: "left_knee", confidence: 0.8 },
      { id: "left_knee", x: 270, y: 620, parent: "left_hip", confidence: 0.8 },
      { id: "left_hip", x: 290, y: 520, parent: "root", confidence: 0.85 },
    ],
    face: { leftEye: { x: 310, y: 360 }, rightEye: { x: 330, y: 360 }, mouth: { x: 320, y: 380 } },
    partRegions: [],
  },
};

describe("jointsFromAnalysis", () => {
  it("maps image coordinates to world coordinates", () => {
    const joints = jointsFromAnalysis(analysis, mapping);
    const root = joints.find((j) => j.id === "root")!;
    expect(root.x).toBeCloseTo(300 / 2 + 100, 5);
    expect(root.y).toBeCloseTo(500 / 2, 5);
  });

  it("deduplicates repeated joint ids", () => {
    const dup = structuredClone(analysis);
    dup.character.joints.push({ ...dup.character.joints[0] });
    const joints = jointsFromAnalysis(dup, mapping);
    expect(joints.filter((j) => j.id === "root").length).toBe(1);
  });
});

describe("verifyManifest", () => {
  const baseManifest: CharacterManifest = {
    version: "1.0",
    face: {},
    parts: [],
    includedStrokeIds: [],
    createdAt: 0,
    joints: [
      { id: "root", x: 0, y: 0, parent: null, confidence: 1 },
      { id: "torso", x: 0, y: 10, parent: "root", confidence: 1 },
      { id: "head", x: 0, y: 30, parent: "torso", confidence: 1 },
    ],
  };

  it("accepts a valid chain", () => {
    expect(verifyManifest(baseManifest)).toBe(true);
  });

  it("rejects cycles", () => {
    const bad: CharacterManifest = structuredClone(baseManifest);
    bad.joints = [...bad.joints, { id: "left_foot", x: 5, y: 40, parent: "left_knee", confidence: 1 }];
    bad.joints[2] = { ...bad.joints[2], parent: "left_foot" };
    expect(verifyManifest(bad)).toBe(false);
  });

  it("rejects unknown parents", () => {
    const bad: CharacterManifest = structuredClone(baseManifest);
    bad.joints[1] = { ...bad.joints[1], parent: "ghost" as JointManifest["parent"] };
    expect(verifyManifest(bad)).toBe(false);
  });
});

describe("ensureValidParents", () => {
  it("repairs missing parents with fallback", () => {
    const manifest: CharacterManifest = {
      version: "1.0",
      face: {},
      parts: [],
      includedStrokeIds: [],
      createdAt: 0,
      joints: [
        { id: "root", x: 0, y: 0, parent: null, confidence: 1 },
        { id: "left_foot", x: 0, y: 0, parent: null, confidence: 1 },
      ],
    };
    const repaired = ensureValidParents(structuredClone(manifest));
    const foot = repaired.joints.find((j) => j.id === "left_foot")!;
    expect(foot.parent).toBe("left_knee");
  });
});

describe("missingJoints", () => {
  it("reports absent skeleton joints", () => {
    const joints = jointsFromAnalysis(analysis, mapping);
    const manifest: CharacterManifest = {
      version: "1.0",
      face: {},
      parts: [],
      includedStrokeIds: [],
      createdAt: 0,
      joints,
    };
    const missing = missingJoints(manifest);
    expect(missing).toContain("head");
    expect(missing).toContain("left_shoulder");
    expect(missing).not.toContain("root");
  });
});
