import { z } from "zod";
import { clampCoord, clampConfidence } from "./skeleton.js";

const MAX_BUBBLE_CHARS = 70;
const MAX_SPOKEN_CHARS = 100;

const pointSchema = z.object({ x: z.number(), y: z.number() }).strict();

export const drawingObjectSchema = z.object({
  type: z.string().min(1).max(40),
  category: z.enum(["wearable", "held_tool", "decoration", "other"]),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  attachTo: z.enum(["left_hand", "right_hand", "left_foot", "right_foot", "head"]).nullable(),
  anchor: z.object({ x: z.number(), y: z.number() }).strict().nullable(),
  orientationDegrees: z.number().default(0),
  affordances: z.array(z.string().max(30)).default([]),
  physicsShape: z.enum(["platform", "stairs", "slope", "obstacle", "dynamic", "ladder", "vehicle", "none"]).default("none"),
  vehicle: z.object({
    facing: z.enum(["left", "right"]),
    seat: pointSchema,
    exhaust: pointSchema.nullable(),
  }).strict().nullable().default(null),
}).strict().superRefine((object, context) => {
  if ((object.attachTo === null) !== (object.anchor === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "attachTo and anchor must either both be set or both be null" });
  }
});

export const actionRequestSchema = z.object({
  type: z.enum(["scratch_head", "speak", "react", "equip", "use", "move", "jump", "climb", "interact", "point", "rescue", "ride"]),
  targetObjectIndex: z.number().int().min(0).max(7).nullable().default(null),
  direction: z.enum(["left", "right", "up", "down"]).nullable().default(null),
  durationMs: z.number().int().min(100).max(5000).default(900),
}).strict();

export const drawingAnalysisSchema = z.object({
  goalId: z.string().min(1).max(60),
  recognized: z.boolean(),
  matchesGoal: z.boolean(),
  confidence: z.number(),
  objects: z.array(drawingObjectSchema).max(8).default([]),
  interpretation: z.string().max(200).default(""),
  mappedAction: z.enum(["equip_shoes", "equip_tool", "answer_question", "ground_erased", "decorate", "react", "point", "rescue", "none"]).nullable(),
  action: actionRequestSchema.nullable().default(null),
  reaction: z.object({
    emotion: z.enum(["curious", "protesting", "confused", "effort", "delighted", "sad"]).default("curious"),
    bubble: z.string().default(""),
    spoken: z.string().default(""),
  }).strict(),
}).strict().superRefine((analysis, context) => {
  const action = analysis.action;
  if (!action) return;
  const targetRequired = ["equip", "use", "climb", "interact", "point", "rescue", "ride"].includes(action.type);
  const target = action.targetObjectIndex === null ? undefined : analysis.objects[action.targetObjectIndex];
  if (targetRequired && !target) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["action", "targetObjectIndex"], message: "action requires a valid targetObjectIndex" });
    return;
  }
  if (action.type === "rescue") {
    const semantic = target ? `${target.type} ${target.affordances.join(" ")}`.toLowerCase() : "";
    if (target?.physicsShape !== "ladder" && !/ladder|نردبان/.test(semantic)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["action", "targetObjectIndex"], message: "rescue target must be a ladder" });
    }
  }
});

export type DrawingAnalysis = z.infer<typeof drawingAnalysisSchema>;

export interface DrawingAnalysisInput {
  width: number;
  height: number;
}

export function sanitizeDrawingAnalysis(
  raw: unknown,
  input: DrawingAnalysisInput,
): DrawingAnalysis {
  const parsed = drawingAnalysisSchema.parse(raw);
  const width = input.width;
  const height = input.height;
  parsed.confidence = clampConfidence(parsed.confidence);
  for (const object of parsed.objects) {
    object.boundingBox.x = clampCoord(object.boundingBox.x, width);
    object.boundingBox.y = clampCoord(object.boundingBox.y, height);
    object.boundingBox.width = clampCoord(object.boundingBox.width, width);
    object.boundingBox.height = clampCoord(object.boundingBox.height, height);
    if (object.anchor) {
      object.anchor.x = clampCoord(object.anchor.x, width);
      object.anchor.y = clampCoord(object.anchor.y, height);
    }
    for (const point of [object.vehicle?.seat, object.vehicle?.exhaust]) {
      if (!point) continue;
      point.x = clampCoord(point.x, width);
      point.y = clampCoord(point.y, height);
    }
  }
  parsed.reaction.bubble = parsed.reaction.bubble.slice(0, MAX_BUBBLE_CHARS);
  parsed.reaction.spoken = (parsed.reaction.spoken.trim() || parsed.reaction.bubble).slice(0, MAX_SPOKEN_CHARS);
  return parsed;
}
