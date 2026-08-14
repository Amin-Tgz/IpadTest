export const DRAWING_JSON_SCHEMA = {
  type: "object",
  properties: {
    goalId: { type: "string" },
    recognized: { type: "boolean" },
    matchesGoal: { type: "boolean" },
    confidence: { type: "number" },
    objects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          category: { type: "string", enum: ["wearable", "held_tool", "decoration", "other"] },
          boundingBox: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
          attachTo: { type: ["string", "null"] },
          anchor: {
            type: ["object", "null"],
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
          },
          orientationDegrees: { type: "number" },
          affordances: { type: "array", items: { type: "string" } },
        },
        required: ["type", "category", "boundingBox", "attachTo", "anchor", "orientationDegrees", "affordances"],
      },
    },
    interpretation: { type: "string" },
    mappedAction: { type: ["string", "null"], enum: ["equip_shoes", "equip_tool", "none", null] },
    reaction: {
      type: "object",
      properties: {
        emotion: { type: "string" },
        bubble: { type: "string" },
      },
      required: ["emotion", "bubble"],
    },
  },
  required: ["goalId", "recognized", "matchesGoal", "confidence", "objects", "interpretation", "mappedAction", "reaction"],
} as const;

export interface DrawingPromptContext {
  goal: string;
  acceptedCategories: string[];
  joints: Array<{ id: string; x: number; y: number }>;
  worldSummary: string;
  width: number;
  height: number;
}

export function drawingAnalysisPrompt(context: DrawingPromptContext): string {
  return [
    "You analyze a NEW line drawing drawn by a child on top of an existing scene. White strokes on a dark blue background.",
    `The image is ${context.width}x${context.height} pixels. Coordinates: origin TOP-LEFT, y grows DOWN.`,
    `The character's goal right now: ${context.goal}`,
    `Accepted object categories: ${context.acceptedCategories.join(", ")}`,
    `Character joints (image pixels): ${context.joints.map((j) => `${j.id}@(${Math.round(j.x)},${Math.round(j.y)})`).join(" ")}`,
    `World summary: ${context.worldSummary}`,
    "Look ONLY at the NEWLY added strokes (usually the most recently drawn ink, often near the feet or hands).",
    "For each recognized object give: type (e.g. shoe, boot, skate, fishing_rod), category, a tight boundingBox, attachTo (a joint id from the list above, or null), anchor (the point where it should attach, or null), orientationDegrees, affordances.",
    "Set recognized=false if there is nothing new drawn. Set matchesGoal=false if what is drawn does not fit the goal.",
    `mappedAction must be "equip_shoes", "equip_tool", or "none".`,
    'reaction.bubble: the character\'s reaction in Persian (فارسی), playful and short (under 70 characters).',
    "Return ONLY JSON.",
  ].join("\n");
}

export function drawingRepairPrompt(error: string): string {
  return [
    "Your previous response was rejected by validation. Fix it and return ONLY valid JSON.",
    `Validation error: ${error}`,
    "Keep the same structure. bubble text must be Persian and short.",
  ].join("\n");
}
