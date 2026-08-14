import { describe, expect, it } from "vitest";
import { sanitizeCharacterAnalysis } from "../../server/ai/validation.js";

const base = {
  version: "1.0",
  character: {
    type: "humanoid_line_character",
    boundingBox: { x: 10, y: 20, width: 100, height: 200 },
    pose: "front_or_three_quarter",
    confidence: 0.9,
    joints: [
      { id: "root", x: 50, y: 120, parent: null, confidence: 0.95 },
      { id: "head", x: 55, y: 30, parent: "neck", confidence: 0.8 },
      { id: "neck", x: 54, y: 60, parent: "root", confidence: 0.8 },
    ],
    face: { leftEye: { x: 52, y: 28 }, rightEye: { x: 58, y: 28 }, mouth: { x: 55, y: 36 } },
    partRegions: [],
  },
};

describe("sanitizeCharacterAnalysis", () => {
  it("clamps out-of-canvas coordinates", () => {
    const input = structuredClone(base);
    input.character.joints[0].x = 5000;
    input.character.boundingBox.y = -40;
    const out = sanitizeCharacterAnalysis(input, { width: 512, height: 512 });
    expect(out.character.joints[0].x).toBe(512);
    expect(out.character.boundingBox.y).toBe(0);
  });

  it("clamps confidence to 0..1", () => {
    const input = structuredClone(base);
    input.character.confidence = 2.5;
    input.character.joints[0].confidence = -1;
    const out = sanitizeCharacterAnalysis(input, { width: 512, height: 512 });
    expect(out.character.confidence).toBe(1);
    expect(out.character.joints[0].confidence).toBe(0);
  });

  it("rejects unknown joint ids", () => {
    const input = structuredClone(base);
    input.character.joints[0].id = "mystery_bone";
    expect(() => sanitizeCharacterAnalysis(input, { width: 512, height: 512 })).toThrow();
  });

  it("rejects missing joints array", () => {
    const input = structuredClone(base) as unknown as Record<string, unknown>;
    delete (input.character as Record<string, unknown>).joints;
    expect(() => sanitizeCharacterAnalysis(input, { width: 512, height: 512 })).toThrow();
  });

  it("accepts empty face", () => {
    const input = structuredClone(base);
    (input.character as { face: unknown }).face = {};
    const out = sanitizeCharacterAnalysis(input, { width: 512, height: 512 });
    expect(out.character.face).toEqual({});
  });
});
