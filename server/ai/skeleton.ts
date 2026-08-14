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

export const CANVAS_MAX = 4096;
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const CHARACTER_CONFIDENCE_THRESHOLD = 0.6;

export function clampCoord(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function verifySkeleton(joints: Array<{ id: string; parent: string | null }>): boolean {
  const ids = new Set(joints.map((j) => j.id));
  if (ids.size !== joints.length) return false;
  for (const joint of joints) {
    if (joint.parent !== null && !ids.has(joint.parent)) return false;
  }
  const roots = joints.filter((j) => j.parent === null);
  if (roots.length !== 1) return false;

  const children = new Map<string, string[]>();
  for (const joint of joints) {
    if (joint.parent !== null) {
      const list = children.get(joint.parent) ?? [];
      list.push(joint.id);
      children.set(joint.parent, list);
    }
  }

  const visited = new Set<string>();
  const stack = [roots[0].id];
  let hops = 0;
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) return false;
    visited.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
    hops++;
    if (hops > JOINT_IDS.length) return false;
  }
  return visited.size === joints.length;
}
