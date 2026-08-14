export const PALETTE = {
  background: "#103B46",
  primaryInk: "#F7F5EE",
  activeInk: "#D8F6FF",
  warning: "#FFD166",
  error: "#FF7A7A",
} as const;

export const BASE_LINE_WIDTH = 4;
export const BASE_LINE_Y_RATIO = 0.72;
export const INACTIVITY_MS = 1400;
export const STROKE_GROUPING_MS = 220;

export const JOINT_IDS = [
  "root",
  "torso",
  "neck",
  "head",
  "left_shoulder",
  "left_elbow",
  "left_hand",
  "right_shoulder",
  "right_elbow",
  "right_hand",
  "left_hip",
  "left_knee",
  "left_foot",
  "right_hip",
  "right_knee",
  "right_foot",
] as const;

export type JointId = (typeof JOINT_IDS)[number];

export const FALLBACK_JOINT_PARENT: Record<JointId, JointId | null> = {
  root: null,
  torso: "root",
  neck: "torso",
  head: "neck",
  left_shoulder: "torso",
  left_elbow: "left_shoulder",
  left_hand: "left_elbow",
  right_shoulder: "torso",
  right_elbow: "right_shoulder",
  right_hand: "right_elbow",
  left_hip: "root",
  left_knee: "left_hip",
  left_foot: "left_knee",
  right_hip: "root",
  right_knee: "right_hip",
  right_foot: "right_knee",
};
