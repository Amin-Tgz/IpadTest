export const DRAWING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    goalId: { type: "string" },
    recognized: { type: "boolean" },
    matchesGoal: { type: "boolean" },
    confidence: { type: "number" },
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          category: { type: "string", enum: ["wearable", "held_tool", "decoration", "other"] },
          boundingBox: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
          attachTo: { type: ["string", "null"], enum: ["left_hand", "right_hand", "left_foot", "right_foot", "head", null] },
          anchor: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
          },
          orientationDegrees: { type: "number" },
          affordances: { type: "array", items: { type: "string" } },
          physicsShape: { type: "string", enum: ["platform", "stairs", "slope", "obstacle", "dynamic", "ladder", "vehicle", "none"] },
          vehicle: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              facing: { type: "string", enum: ["left", "right"] },
              seat: {
                type: "object",
                additionalProperties: false,
                properties: { x: { type: "number" }, y: { type: "number" } },
                required: ["x", "y"],
              },
              exhaust: {
                type: ["object", "null"],
                additionalProperties: false,
                properties: { x: { type: "number" }, y: { type: "number" } },
                required: ["x", "y"],
              },
            },
            required: ["facing", "seat", "exhaust"],
          },
        },
        required: ["type", "category", "boundingBox", "attachTo", "anchor", "orientationDegrees", "affordances", "physicsShape", "vehicle"],
      },
    },
    interpretation: { type: "string" },
    mappedAction: {
      type: ["string", "null"],
      enum: ["equip_shoes", "equip_tool", "answer_question", "ground_erased", "decorate", "react", "point", "rescue", "none", null],
    },
    reaction: {
      type: "object",
      additionalProperties: false,
      properties: {
        emotion: { type: "string", enum: ["curious", "protesting", "confused", "effort", "delighted", "sad"] },
        bubble: { type: "string" },
        spoken: { type: "string" },
      },
      required: ["emotion", "bubble", "spoken"],
    },
    action: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["scratch_head", "speak", "react", "equip", "use", "move", "jump", "climb", "interact", "point", "rescue", "ride"] },
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
  history: Array<{ role: "child" | "hero" | "system"; kind: "drawing" | "message" | "action"; text: string }>;
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
    `Conversation and completed-action history, oldest first: ${context.history.length === 0 ? "none yet" : context.history.map((entry) => `[${entry.role}/${entry.kind}] ${entry.text}`).join(" | ")}`,
    "Use history to resolve follow-up requests such as «بیا اینجا», «از روش رد شو», or pronouns. Completed system actions are facts; do not claim they are still pending.",
    "Look ONLY at the NEWLY added strokes (usually the most recently drawn ink, often near the feet or hands).",
    "This is open-ended free play. Understand whatever the user added: objects, clothing, tools, creatures, symbols, or handwritten Persian/English text.",
    "If the user wrote a question, mappedAction=answer_question and the reaction must answer it briefly in Persian.",
    "If a gap was erased from the normally continuous white ground line, mappedAction=ground_erased and react sadly or worriedly.",
    "For wearable or held objects, return attachment geometry and the best attachTo joint. Shoes should be separate left/right objects when possible.",
    "Fingers follow their matching hand bone, and eyebrows participate in emotional reactions. Treat them as real character parts, while still choosing only the supported actions below.",
    "Use mappedAction=decorate for scene objects, react for understood non-attachable drawings, and none only when nothing can be understood.",
    "For every object choose physicsShape: stairs, platform, slope, obstacle, dynamic, ladder, vehicle, or none. Use ladder only for a recognizable ladder and none for text, clothing, held items, and decorations without collision.",
    "Vehicles the hero can ride (motorcycle, scooter, bicycle, car, skateboard, …): physicsShape vehicle, and fill vehicle with facing (the side its front points to: left or right), seat (where the rider sits, IMAGE A pixels), and exhaust (the end of the exhaust pipe in IMAGE A pixels, or null for a vehicle without an engine such as a bicycle or skateboard). Return action ride targeting it. For every other object vehicle is null.",
    "A staircase together with the block, tower, or hill it leads onto is ONE object covering the whole connected structure: physicsShape stairs for steps, slope for a smooth ramp or hill, obstacle for a plain block or tower. The hero walks on the drawn outline itself, so the box must cover all of it.",
    "Arrows, motion lines, and written commands («برو بالا», «بپر», «بیا اینجا») are instructions, not things to stand on: give them physicsShape none and use them to choose the action — an arrow up a staircase or tower means climb it, an arrow toward a place means move there, an arc over something means jump.",
    "Choose one executable action when appropriate. Allowed actions only: scratch_head, speak, react, equip, use, move, jump, climb, interact, point, rescue, ride. Never invent action names or animation frames.",
    "Use point with a valid targetObjectIndex when the hero should visibly point at a recognized object. Use rescue only for a ladder while the world summary says the hero has fallen; otherwise a drawn ladder is for climbing: return climb targeting it (a ladder leaning on a block or tower lets the hero step onto its top).",
    "When the child draws stairs, a ramp, or a hill, they want the hero to go up it: return action climb with targetObjectIndex of that structure. Use move to cross a platform or bridge. For surprising unclear drawings scratch_head is useful. targetObjectIndex indexes the objects array or is null.",
    "For a jump down, off, or across, return action jump with direction (left, right, or down) and targetObjectIndex of the arrow that shows where to land, or of the object to land on; the hero leaps there. A jump with no target and no direction is a hop in place.",
    "When the action is move, climb, jump, or ride, the reaction is spoken AFTER the hero arrives, lands, or gets off, so phrase it as having done it (e.g. «هوف! رسیدم بالا؛ از این بالا همه‌جا پیداست!», «هوپ! پریدم پایین؛ دیدی چه فرودی بود؟», or «ویژژ! چه موتوری؛ باد خورد تو صورتم!»), not as a plan.",
    "IMAGE A is the canonical coordinate system. Every returned boundingBox and anchor MUST use IMAGE A pixels, never crop-local coordinates from IMAGE B.",
    "For each recognized object give: type (e.g. shoe, boot, skate, fishing_rod), category, a tight boundingBox, attachTo (a joint id from the list above, or null), anchor (the point where it should attach, or null), orientationDegrees, affordances.",
    "Set recognized=false if there is nothing new drawn. Set matchesGoal=false if what is drawn does not fit the goal.",
    `mappedAction must be one of equip_shoes, equip_tool, answer_question, ground_erased, decorate, react, point, rescue, or none.`,
    "The fixed hero is grumpy but lovable: it protests briefly, then becomes curious or delighted when the child helps.",
    "reaction.emotion must be exactly one of curious, protesting, confused, effort, delighted, sad.",
    'reaction.bubble: the semantic reaction in Persian (فارسی), playful and under 70 characters.',
    'reaction.spoken: one understandable Iranian-Persian sentence under 100 characters. Do not habitually start with an interjection and avoid «آها/اهان» unless a rare delighted moment truly needs it.',
    "Vary the delivery: the hero may sound mildly annoyed or mock-grumpy sometimes. Use «رفیق»، «مشتی»، or «چه خفن» occasionally and naturally—never more than one of them in a response and never in every turn.",
    "Return ONLY JSON.",
  ].join("\n");
}

export function drawingRepairPrompt(error: string): string {
  return [
    "Your previous response was rejected by validation. Fix it and return ONLY valid JSON.",
    `Validation error: ${error}`,
    "Keep the same structure. bubble and spoken text must be Persian and short; emotion must use an allowed preset.",
  ].join("\n");
}
