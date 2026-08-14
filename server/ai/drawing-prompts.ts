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
          physicsShape: { type: "string", enum: ["platform", "stairs", "slope", "obstacle", "dynamic", "none"] },
        },
        required: ["type", "category", "boundingBox", "attachTo", "anchor", "orientationDegrees", "affordances", "physicsShape"],
      },
    },
    interpretation: { type: "string" },
    mappedAction: {
      type: ["string", "null"],
      enum: ["equip_shoes", "equip_tool", "answer_question", "ground_erased", "decorate", "react", "none", null],
    },
    reaction: {
      type: "object",
      properties: {
        emotion: { type: "string" },
        bubble: { type: "string" },
      },
      required: ["emotion", "bubble"],
    },
    action: {
      type: ["object", "null"],
      properties: {
        type: { type: "string", enum: ["scratch_head", "speak", "react", "equip", "use", "move", "jump", "climb", "interact"] },
        targetObjectIndex: { type: ["number", "null"] },
        direction: { type: ["string", "null"], enum: ["left", "right", "up", "down", null] },
        durationMs: { type: "number" },
      },
      required: ["type", "targetObjectIndex", "direction", "durationMs"],
    },
  },
  required: ["goalId", "recognized", "matchesGoal", "confidence", "objects", "interpretation", "mappedAction", "reaction", "action"],
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
    `Possible object categories (examples, not a restriction): ${context.acceptedCategories.join(", ")}`,
    `Character joints and semantic face/hand-part anchors (image pixels): ${context.joints.map((j) => `${j.id}@(${Math.round(j.x)},${Math.round(j.y)})`).join(" ")}`,
    `World summary: ${context.worldSummary}`,
    "Look ONLY at the NEWLY added strokes (usually the most recently drawn ink, often near the feet or hands).",
    "This is open-ended free play. Understand whatever the user added: objects, clothing, tools, creatures, symbols, or handwritten Persian/English text.",
    "If the user wrote a question, mappedAction=answer_question and reaction.bubble must answer it briefly in Persian.",
    "If a gap was erased from the normally continuous white ground line, mappedAction=ground_erased and react sadly or worriedly.",
    "For wearable or held objects, return attachment geometry and the best attachTo joint. Shoes should be separate left/right objects when possible.",
    "Fingers follow their matching hand bone, and eyebrows participate in emotional reactions. Treat them as real character parts, while still choosing only the supported actions below.",
    "Use mappedAction=decorate for scene objects, react for understood non-attachable drawings, and none only when nothing can be understood.",
    "For every object choose physicsShape: stairs, platform, slope, obstacle, dynamic, or none. Use none for text, clothing, held items, and decorations without collision.",
    "Choose one executable action when appropriate. Allowed actions only: scratch_head, speak, react, equip, use, move, jump, climb, interact. Never invent action names or animation frames.",
    "For stairs/slopes/platforms prefer move or climb. For surprising unclear drawings scratch_head is useful. targetObjectIndex indexes the objects array or is null.",
    "IMAGE A is the canonical coordinate system. Every returned boundingBox and anchor MUST use IMAGE A pixels, never crop-local coordinates from IMAGE B.",
    "For each recognized object give: type (e.g. shoe, boot, skate, fishing_rod), category, a tight boundingBox, attachTo (a joint id from the list above, or null), anchor (the point where it should attach, or null), orientationDegrees, affordances.",
    "Set recognized=false if there is nothing new drawn. Set matchesGoal=false if what is drawn does not fit the goal.",
    `mappedAction must be one of equip_shoes, equip_tool, answer_question, ground_erased, decorate, react, or none.`,
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
