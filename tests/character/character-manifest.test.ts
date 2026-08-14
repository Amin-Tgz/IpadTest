import { describe, expect, it } from "vitest";
import {
  jointsFromAnalysis,
  verifyManifest,
  ensureValidParents,
  migrateManifest,
  missingJoints,
  buildManifest,
  type CharacterManifest,
  type JointManifest,
} from "../../src/character/character-manifest.js";
import type { CharacterAnalysis } from "../../src/ai/schemas.js";
import { StrokeStore } from "../../src/drawing/stroke-store.js";
import type { IdMap } from "../../src/drawing/id-map.js";

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

describe("manifest migration", () => {
  it("upgrades legacy manifests without discarding joints", () => {
    const legacy: CharacterManifest = {
      version: "1.0",
      joints: [{ id: "root", x: 10, y: 20, parent: null, confidence: 1 }],
      face: {},
      parts: [],
      includedStrokeIds: [],
      createdAt: 0,
    };
    const migrated = migrateManifest(legacy);
    expect(migrated.version).toBe("2.0");
    expect(migrated.segmentOverrides).toEqual([]);
    expect(migrated.joints).toEqual(legacy.joints);
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

describe("automatic body segmentation", () => {
  it("builds skeleton regions when AI part polygons are missing", () => {
    const store = new StrokeStore();
    for (const [id, points] of [
      ["left_arm_ink", [[60, 80], [45, 105], [35, 130]]],
      ["right_arm_ink", [[140, 80], [155, 105], [165, 130]]],
      ["torso_ink", [[100, 65], [100, 145]]],
    ] as Array<[string, Array<[number, number]>]>) {
      store.add({
        id,
        points: points.map(([x, y], index) => ({ x, y, pressure: 0.5, time: index })),
        color: "#fff", baseWidth: 4, tool: "pen", createdAt: 0, worldSpace: true, entityId: null, active: true, groupId: null,
      });
    }
    const noRegionAnalysis: CharacterAnalysis = {
      version: "1.0",
      character: {
        type: "humanoid_line_character",
        boundingBox: { x: 20, y: 20, width: 160, height: 180 },
        pose: "front_or_three_quarter",
        confidence: 0.9,
        joints: [
          { id: "root", x: 100, y: 145, parent: null, confidence: 1 },
          { id: "torso", x: 100, y: 95, parent: "root", confidence: 1 },
          { id: "neck", x: 100, y: 65, parent: "torso", confidence: 1 },
          { id: "head", x: 100, y: 40, parent: "neck", confidence: 1 },
          { id: "left_shoulder", x: 65, y: 80, parent: "torso", confidence: 1 },
          { id: "left_elbow", x: 45, y: 105, parent: "left_shoulder", confidence: 1 },
          { id: "left_hand", x: 35, y: 130, parent: "left_elbow", confidence: 1 },
          { id: "right_shoulder", x: 135, y: 80, parent: "torso", confidence: 1 },
          { id: "right_elbow", x: 155, y: 105, parent: "right_shoulder", confidence: 1 },
          { id: "right_hand", x: 165, y: 130, parent: "right_elbow", confidence: 1 },
        ],
        face: {},
        partRegions: [],
      },
    };
    const idMap = { sampleStrokesInPolygon: () => new Set<string>() } as unknown as IdMap;
    const manifest = buildManifest(noRegionAnalysis, { scale: 1, cameraX: 0, width: 200, height: 220 }, store, idMap);
    expect(manifest.parts.find((part) => part.part === "left_arm")?.polygon).toBeDefined();
    expect(manifest.parts.find((part) => part.part === "right_arm")?.strokeIds).toContain("right_arm_ink");
    expect(manifest.parts.find((part) => part.part === "torso")?.strokeIds).toContain("torso_ink");
  });
});
