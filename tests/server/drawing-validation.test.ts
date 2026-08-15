import { describe, expect, it } from "vitest";
import { sanitizeDrawingAnalysis } from "../../server/ai/drawing-validation.js";
import { DRAWING_JSON_SCHEMA } from "../../server/ai/drawing-prompts.js";

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
  it("declares every structured-output object as closed", () => {
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      const types = Array.isArray(record.type) ? record.type : [record.type];
      if (types.includes("object")) expect(record.additionalProperties).toBe(false);
      Object.values(record).forEach(visit);
    };
    visit(DRAWING_JSON_SCHEMA);
  });
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

  it("accepts valid point and ladder rescue actions", () => {
    const pointing = structuredClone(base) as typeof base & { action: unknown };
    pointing.mappedAction = "point";
    pointing.action = { type: "point", targetObjectIndex: 0, direction: null, durationMs: 900 };
    expect(sanitizeDrawingAnalysis(pointing, { width: 512, height: 512 }).action?.type).toBe("point");

    const rescue = structuredClone(base) as typeof base & { action: unknown };
    rescue.objects[0].type = "ladder";
    rescue.objects[0].category = "other";
    rescue.objects[0].attachTo = null as unknown as string;
    rescue.objects[0].anchor = null as unknown as { x: number; y: number };
    (rescue.objects[0] as typeof rescue.objects[0] & { physicsShape: string }).physicsShape = "ladder";
    rescue.mappedAction = "rescue";
    rescue.action = { type: "rescue", targetObjectIndex: 0, direction: "up", durationMs: 1800 };
    expect(sanitizeDrawingAnalysis(rescue, { width: 512, height: 512 }).action?.type).toBe("rescue");
  });

  it("rejects invalid targets, anchors, rescue semantics, and extra properties", () => {
    const invalidTarget = structuredClone(base) as typeof base & { action: unknown };
    invalidTarget.action = { type: "point", targetObjectIndex: 4, direction: null, durationMs: 900 };
    expect(() => sanitizeDrawingAnalysis(invalidTarget, { width: 512, height: 512 })).toThrow(/valid targetObjectIndex/);

    const invalidAnchor = structuredClone(base);
    invalidAnchor.objects[0].anchor = null as unknown as { x: number; y: number };
    expect(() => sanitizeDrawingAnalysis(invalidAnchor, { width: 512, height: 512 })).toThrow(/attachTo and anchor/);

    const unsafeRescue = structuredClone(base) as typeof base & { action: unknown };
    unsafeRescue.action = { type: "rescue", targetObjectIndex: 0, direction: "up", durationMs: 900 };
    expect(() => sanitizeDrawingAnalysis(unsafeRescue, { width: 512, height: 512 })).toThrow(/must be a ladder/);

    const extra = { ...structuredClone(base), transform: { x: 1 } };
    expect(() => sanitizeDrawingAnalysis(extra, { width: 512, height: 512 })).toThrow();
  });
});
