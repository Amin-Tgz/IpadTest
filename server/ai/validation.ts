import { z } from "zod";
import {
  JOINT_IDS,
  clampCoord,
  clampConfidence,
  verifySkeleton,
  CANVAS_MAX,
  type JointId,
} from "./skeleton.js";

export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const jointAnalysisSchema = z.object({
  id: z.enum(JOINT_IDS),
  x: z.number(),
  y: z.number(),
  parent: z.enum(JOINT_IDS).nullable(),
  confidence: z.number(),
});

export const partRegionSchema = z.object({
  part: z.string().min(1).max(40),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3).max(64),
  confidence: z.number(),
});

export const characterAnalysisSchema = z.object({
  version: z.string().default("1.0"),
  character: z.object({
    type: z.enum(["humanoid_line_character", "partial_humanoid", "unrecognized"]),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    pose: z.enum(["front_or_three_quarter", "side", "unknown"]).default("front_or_three_quarter"),
    confidence: z.number(),
    joints: z.array(jointAnalysisSchema).min(1).max(32),
    face: z
      .object({
        leftEye: pointSchema.optional(),
        rightEye: pointSchema.optional(),
        mouth: pointSchema.optional(),
      })
      .default({}),
    partRegions: z.array(partRegionSchema).default([]),
  }),
});

export type CharacterAnalysis = z.infer<typeof characterAnalysisSchema>;

export interface CharacterAnalysisInput {
  width: number;
  height: number;
}

export function sanitizeCharacterAnalysis(
  raw: unknown,
  input: CharacterAnalysisInput,
): CharacterAnalysis {
  const parsed = characterAnalysisSchema.parse(raw);
  const width = Math.min(input.width, CANVAS_MAX);
  const height = Math.min(input.height, CANVAS_MAX);
  const box = parsed.character.boundingBox;
  parsed.character.boundingBox = {
    x: clampCoord(box.x, width),
    y: clampCoord(box.y, height),
    width: clampCoord(box.width, width),
    height: clampCoord(box.height, height),
  };
  parsed.character.confidence = clampConfidence(parsed.character.confidence);
  for (const joint of parsed.character.joints) {
    joint.x = clampCoord(joint.x, width);
    joint.y = clampCoord(joint.y, height);
    joint.confidence = clampConfidence(joint.confidence);
  }
  for (const region of parsed.character.partRegions) {
    region.polygon = region.polygon.map(([x, y]) => [
      clampCoord(x, width),
      clampCoord(y, height),
    ]) as [number, number][];
    region.confidence = clampConfidence(region.confidence);
  }
  for (const key of ["leftEye", "rightEye", "mouth"] as const) {
    const anchor = parsed.character.face[key];
    if (anchor) {
      anchor.x = clampCoord(anchor.x, width);
      anchor.y = clampCoord(anchor.y, height);
    }
  }
  return parsed;
}

export function skeletonIsSound(analysis: CharacterAnalysis): boolean {
  return verifySkeleton(
    analysis.character.joints.map((j) => ({ id: j.id, parent: j.parent })),
  );
}

export function requiredJointsPresent(analysis: CharacterAnalysis): JointId[] {
  const present = new Set(analysis.character.joints.map((j) => j.id));
  return JOINT_IDS.filter((id) => present.has(id)) as JointId[];
}
