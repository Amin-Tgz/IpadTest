export interface Vec2 {
  x: number;
  y: number;
}

export interface JointAnalysis {
  id: string;
  x: number;
  y: number;
  parent: string | null;
  confidence: number;
}

export interface PartRegion {
  part: string;
  polygon: [number, number][];
  confidence: number;
}

export interface FaceAnchors {
  leftEye?: Vec2;
  rightEye?: Vec2;
  leftEyebrow?: Vec2;
  rightEyebrow?: Vec2;
  mouth?: Vec2;
}

export interface CharacterAnalysis {
  version: string;
  character: {
    type: "humanoid_line_character" | "partial_humanoid" | "unrecognized";
    boundingBox: { x: number; y: number; width: number; height: number };
    pose: "front_or_three_quarter" | "side" | "unknown";
    confidence: number;
    joints: JointAnalysis[];
    face: FaceAnchors;
    partRegions: PartRegion[];
  };
}

export interface CharacterAnalyzeResult {
  analysis: CharacterAnalysis;
  skeletonSound: boolean;
  latencyMs: number;
  model: string;
}

export interface DrawingObject {
  type: string;
  category: "wearable" | "held_tool" | "decoration" | "other";
  boundingBox: { x: number; y: number; width: number; height: number };
  attachTo: string | null;
  anchor: Vec2 | null;
  orientationDegrees: number;
  affordances: string[];
  physicsShape?: "platform" | "stairs" | "slope" | "obstacle" | "dynamic" | "none";
}

export type AIActionName = "scratch_head" | "speak" | "react" | "equip" | "use" | "move" | "jump" | "climb" | "interact";

export interface AIActionRequest {
  type: AIActionName;
  targetObjectIndex: number | null;
  direction: "left" | "right" | "up" | "down" | null;
  durationMs: number;
}

export interface DrawingAnalysis {
  goalId: string;
  recognized: boolean;
  matchesGoal: boolean;
  confidence: number;
  objects: DrawingObject[];
  interpretation: string;
  mappedAction: string | null;
  action?: AIActionRequest | null;
  reaction: {
    emotion: "curious" | "protesting" | "confused" | "effort" | "delighted" | "sad";
    bubble: string;
    spoken: string;
  };
}

export interface DrawingAnalyzeResult {
  analysis: DrawingAnalysis;
  latencyMs: number;
  model: string;
}
