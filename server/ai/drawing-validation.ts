import { z } from "zod";
import { clampCoord, clampConfidence } from "./skeleton.js";

const MAX_BUBBLE_CHARS = 70;

export const drawingObjectSchema = z.object({
  type: z.string().min(1).max(40),
  category: z.enum(["wearable", "held_tool", "decoration", "other"]),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  attachTo: z.string().max(40).nullable(),
  anchor: z.object({ x: z.number(), y: z.number() }).nullable(),
  orientationDegrees: z.number().default(0),
  affordances: z.array(z.string().max(30)).default([]),
});

export const drawingAnalysisSchema = z.object({
  goalId: z.string().min(1).max(60),
  recognized: z.boolean(),
  matchesGoal: z.boolean(),
  confidence: z.number(),
  objects: z.array(drawingObjectSchema).max(8).default([]),
  interpretation: z.string().max(200).default(""),
  mappedAction: z.enum(["equip_shoes", "equip_tool", "none"]).nullable(),
  reaction: z.object({
    emotion: z.string().max(30).default("neutral"),
    bubble: z.string().default(""),
  }),
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
  }
  parsed.reaction.bubble = parsed.reaction.bubble.slice(0, MAX_BUBBLE_CHARS);
  return parsed;
}
