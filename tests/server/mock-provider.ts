import { describe, expect, it } from "vitest";
import type { AIProvider, ProviderRequest, ProviderResult } from "../../server/ai/provider.js";

export class MockProvider implements AIProvider {
  readonly model = "mock-model";
  responses: Array<ProviderResult | Error> = [];

  async complete(_request: ProviderRequest): Promise<ProviderResult> {
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    if (!next) return { text: "" };
    return next;
  }
}

export function pngDataUrl(): string {
  return "data:image/png;base64," + "A".repeat(400);
}

export function validCharacterJson(): string {
  return JSON.stringify({
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
  });
}
