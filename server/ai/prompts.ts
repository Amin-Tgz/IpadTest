import { JOINT_IDS, FALLBACK_JOINT_PARENT } from "./skeleton.js";

export const CHARACTER_JSON_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "string" },
    character: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["humanoid_line_character", "partial_humanoid", "unrecognized"] },
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
        pose: { type: "string", enum: ["front_or_three_quarter", "side", "unknown"] },
        confidence: { type: "number" },
        joints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", enum: [...JOINT_IDS] },
              x: { type: "number" },
              y: { type: "number" },
              parent: { type: ["string", "null"], enum: [...JOINT_IDS, null] },
              confidence: { type: "number" },
            },
            required: ["id", "x", "y", "parent", "confidence"],
          },
        },
        face: {
          type: "object",
          properties: {
            leftEye: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
            rightEye: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
            mouth: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
          },
          required: [],
        },
        partRegions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              part: { type: "string" },
              polygon: { type: "array", items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } },
              confidence: { type: "number" },
            },
            required: ["part", "polygon", "confidence"],
          },
        },
      },
      required: ["type", "boundingBox", "pose", "confidence", "joints", "face", "partRegions"],
    },
  },
  required: ["version", "character"],
} as const;

function jointHints(): string {
  return JOINT_IDS.map((id) => `- ${id}${FALLBACK_JOINT_PARENT[id] ? ` (parent: ${FALLBACK_JOINT_PARENT[id]})` : " (no parent, root)"}`).join("\n");
}

export function characterAnalysisPrompt(width: number, height: number): string {
  return [
    "You analyze a child-like line drawing of a character. The drawing is white strokes on a dark blue background.",
    "A long horizontal white baseline is pre-authored scenery, not user ink. Never include it in the character boundingBox, partRegions, or joints.",
    `The image is ${width}x${height} pixels. Coordinates use pixel units, origin at TOP-LEFT, y grows DOWN.`,
    "Return ONLY JSON. Report every visible joint; skip joints that are clearly not visible.",
    "A joint must sit ON the ink of the drawing (on the stroke), not in empty space.",
    `Valid joint ids and their expected parents (a parent may be null only for root):`,
    jointHints(),
    "partRegions: for each visible body part (head, torso, left_arm, right_arm, left_leg, right_leg, ...), give a closed polygon that tightly covers its strokes.",
    "face: eye and mouth anchor points if a face is visible; otherwise omit them.",
    "confidence: 0..1 how sure you are about the whole analysis.",
    "boundingBox: tight box around ALL strokes of the character.",
    "If nothing looks like a humanoid character, set type to 'unrecognized' and confidence below 0.3.",
  ].join("\n");
}

export function characterRepairPrompt(error: string): string {
  return [
    "Your previous response was rejected by validation. Fix it and return ONLY valid JSON.",
    `Validation error: ${error}`,
    "Rules: joint ids must come from the allowed list; parent must reference an existing joint id or null; exactly one joint (root) has parent null; the skeleton must be a single connected tree with no cycles.",
  ].join("\n");
}
