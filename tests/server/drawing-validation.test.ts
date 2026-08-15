import { describe, expect, it } from "vitest";
import { sanitizeDrawingAnalysis } from "../../server/ai/drawing-validation.js";

const base = {
  goalId: "draw_shoes",
  recognized: true,
  matchesGoal: true,
  confidence: 0.92,
  objects: [
    {
      type: "shoe",
      category: "wearable",
      boundingBox: { x: 100, y: 300, width: 80, height: 55 },
      attachTo: "left_foot",
      anchor: { x: 120, y: 330 },
      orientationDegrees: 3,
      affordances: ["wear", "walk"],
    },
  ],
  interpretation: "A pair of oversized boots",
  mappedAction: "equip_shoes",
  reaction: { emotion: "delighted", bubble: "وای! یکم بزرگن، ولی عاشقشونم!", spoken: "آها! یکم بزرگن، ولی عاشقشونم!" },
};

describe("sanitizeDrawingAnalysis", () => {
  it("clamps coordinates and confidence", () => {
    const input = structuredClone(base);
    input.objects[0].boundingBox.x = -40;
    input.confidence = 2;
    const out = sanitizeDrawingAnalysis(input, { width: 512, height: 512 });
    expect(out.objects[0].boundingBox.x).toBe(0);
    expect(out.confidence).toBe(1);
  });

  it("truncates long bubbles", () => {
    const input = structuredClone(base);
    input.reaction.bubble = "ب".repeat(200);
    const out = sanitizeDrawingAnalysis(input, { width: 512, height: 512 });
    expect(out.reaction.bubble.length).toBeLessThanOrEqual(70);
  });

  it("defaults blank spoken text to the semantic bubble", () => {
    const input = structuredClone(base);
    input.reaction.spoken = "";
    const out = sanitizeDrawingAnalysis(input, { width: 512, height: 512 });
    expect(out.reaction.spoken).toBe(out.reaction.bubble);
  });

  it("accepts null anchor and attachTo", () => {
    const input = structuredClone(base);
    input.objects[0].attachTo = null as unknown as string;
    input.objects[0].anchor = null as unknown as { x: number; y: number };
    const out = sanitizeDrawingAnalysis(input, { width: 512, height: 512 });
    expect(out.objects[0].anchor).toBeNull();
  });

  it("rejects unknown categories", () => {
    const input = structuredClone(base);
    input.objects[0].category = "flying";
    expect(() => sanitizeDrawingAnalysis(input, { width: 512, height: 512 })).toThrow();
  });

  it("rejects unknown mapped actions", () => {
    const input = structuredClone(base);
    input.mappedAction = "fly_away";
    expect(() => sanitizeDrawingAnalysis(input, { width: 512, height: 512 })).toThrow();
  });

  it.each(["answer_question", "ground_erased", "decorate", "react"])(
    "accepts the open-ended %s action",
    (mappedAction) => {
      const input = structuredClone(base);
      input.goalId = "free_draw";
      input.mappedAction = mappedAction;
      expect(sanitizeDrawingAnalysis(input, { width: 512, height: 512 }).mappedAction).toBe(mappedAction);
    },
  );

  it("accepts only registered character actions", () => {
    const input = structuredClone(base) as typeof base & { action: unknown };
    input.action = { type: "scratch_head", targetObjectIndex: null, direction: null, durationMs: 1200 };
    expect(sanitizeDrawingAnalysis(input, { width: 512, height: 512 }).action?.type).toBe("scratch_head");
    input.action = { type: "teleport_anywhere", targetObjectIndex: null, direction: null, durationMs: 1200 };
    expect(() => sanitizeDrawingAnalysis(input, { width: 512, height: 512 })).toThrow();
  });
});
