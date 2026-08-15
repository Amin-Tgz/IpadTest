import type { JointId } from "../app/constants.js";

export type MotionId =
  | "spawn"
  | "idle"
  | "protest"
  | "effort"
  | "happy"
  | "confused"
  | "scratch_head"
  | "fall"
  | "sad"
  | "talk"
  | "walk"
  | "stop_at_pond"
  | "hold_rod"
  | "cast_rod"
  | "pull_fish"
  | "point";

export interface MotionTrack {
  t: number[];
  rotation: number[];
}

export interface MotionClip {
  id: MotionId;
  durationMs: number;
  loop: boolean;
  jointTracks: Partial<Record<JointId, MotionTrack>>;
  rootY?: MotionTrack;
  rootRotation?: MotionTrack;
}

export interface Pose {
  jointRotations: Partial<Record<JointId, number>>;
  rootDeltaY: number;
  rootRotation: number;
}

function track(values: Array<[number, number]>): MotionTrack {
  return {
    t: values.map(([t]) => t),
    rotation: values.map(([, v]) => v),
  };
}

function evalTrack(track: MotionTrack | undefined, t: number): number {
  if (!track || track.t.length === 0) return 0;
  const tValues = track.t;
  const vValues = track.rotation;
  if (t <= tValues[0]) return vValues[0];
  if (t >= tValues[tValues.length - 1]) return vValues[vValues.length - 1];
  let i = 0;
  while (i < tValues.length - 2 && tValues[i + 1] < t) i++;
  const t0 = tValues[i];
  const t1 = tValues[i + 1];
  const v0 = vValues[i];
  const v1 = vValues[i + 1];
  const f = (t - t0) / (t1 - t0);
  const s = f * f * (3 - 2 * f);
  return v0 + (v1 - v0) * s;
}

export function evaluateMotion(clip: MotionClip, timeMs: number): Pose {
  const t = clip.durationMs > 0 ? Math.min(1, Math.max(0, timeMs / clip.durationMs)) : 1;
  const jointRotations: Partial<Record<JointId, number>> = {};
  for (const [jointId, tr] of Object.entries(clip.jointTracks)) {
    jointRotations[jointId as JointId] = evalTrack(tr, t);
  }
  return {
    jointRotations,
    rootDeltaY: evalTrack(clip.rootY, t),
    rootRotation: evalTrack(clip.rootRotation, t),
  };
}

export const MOTION_CLIPS: Record<MotionId, MotionClip> = {
  point: {
    id: "point",
    durationMs: 900,
    loop: false,
    jointTracks: {
      torso: track([[0, 0], [0.28, -5], [1, -3]]),
      head: track([[0, 0], [0.3, 6], [1, 4]]),
    },
    rootY: track([[0, 0], [0.28, -2], [1, 0]]),
  },
  spawn: {
    id: "spawn",
    durationMs: 1150,
    loop: false,
    jointTracks: {
      torso: track([[0, 12], [0.32, -8], [0.55, 5], [0.78, -2], [1, 0]]),
      head: track([[0, -10], [0.35, 7], [0.62, -4], [1, 0]]),
      left_shoulder: track([[0, 30], [0.42, -20], [0.72, 8], [1, 0]]),
      right_shoulder: track([[0, -30], [0.42, 20], [0.72, -8], [1, 0]]),
    },
    rootY: track([
      [0, 76],
      [0.18, 58],
      [0.46, -9],
      [0.68, 5],
      [0.84, -2],
      [1, 0],
    ]),
  },
  idle: {
    id: "idle",
    durationMs: 2600,
    loop: true,
    jointTracks: {
      torso: track([
        [0, -1.5],
        [0.5, 1.5],
        [1, -1.5],
      ]),
      head: track([
        [0, 1],
        [0.5, -1],
        [1, 1],
      ]),
      left_shoulder: track([
        [0, 1.5],
        [0.5, -1.5],
        [1, 1.5],
      ]),
      right_shoulder: track([
        [0, -1.5],
        [0.5, 1.5],
        [1, -1.5],
      ]),
    },
    rootY: track([
      [0, 0],
      [0.5, -1.6],
      [1, 0],
    ]),
  },
  protest: {
    id: "protest",
    durationMs: 1250,
    loop: false,
    jointTracks: {
      head: track([[0, 0], [0.18, -12], [0.36, 9], [0.54, -10], [0.72, 7], [1, 0]]),
      torso: track([[0, 0], [0.22, -7], [0.62, 4], [1, 0]]),
      left_shoulder: track([[0, 0], [0.25, -58], [0.55, -42], [1, 0]]),
      right_shoulder: track([[0, 0], [0.25, 52], [0.55, 37], [1, 0]]),
      left_elbow: track([[0, 0], [0.3, -28], [0.7, -15], [1, 0]]),
      right_elbow: track([[0, 0], [0.3, 24], [0.7, 13], [1, 0]]),
    },
    rootY: track([[0, 0], [0.22, -5], [0.48, 2], [1, 0]]),
    rootRotation: track([[0, 0], [0.25, -4], [0.55, 3], [1, 0]]),
  },
  effort: {
    id: "effort",
    durationMs: 900,
    loop: true,
    jointTracks: {
      torso: track([[0, -5], [0.5, 7], [1, -5]]),
      head: track([[0, 4], [0.5, -3], [1, 4]]),
      left_shoulder: track([[0, -24], [0.5, -38], [1, -24]]),
      right_shoulder: track([[0, 24], [0.5, 38], [1, 24]]),
      left_elbow: track([[0, -12], [0.5, 8], [1, -12]]),
      right_elbow: track([[0, 12], [0.5, -8], [1, 12]]),
    },
    rootY: track([[0, 0], [0.5, 3], [1, 0]]),
  },
  happy: {
    id: "happy",
    durationMs: 1200,
    loop: false,
    jointTracks: {
      torso: track([
        [0, 0],
        [0.25, -8],
        [0.5, 8],
        [0.75, -8],
        [1, 0],
      ]),
      left_shoulder: track([
        [0, 0],
        [0.3, -50],
        [1, -30],
      ]),
      right_shoulder: track([
        [0, 0],
        [0.3, 50],
        [1, 30],
      ]),
      left_elbow: track([
        [0, 0],
        [0.3, -25],
        [1, -15],
      ]),
      right_elbow: track([
        [0, 0],
        [0.3, 25],
        [1, 15],
      ]),
    },
    rootY: track([
      [0, 0],
      [0.5, -8],
      [1, 0],
    ]),
  },
  confused: {
    id: "confused",
    durationMs: 1600,
    loop: false,
    jointTracks: {
      head: track([
        [0, 0],
        [0.4, 14],
        [0.6, 14],
        [1, 0],
      ]),
      left_shoulder: track([
        [0, 0],
        [0.4, 20],
        [1, 8],
      ]),
    },
  },
  scratch_head: {
    id: "scratch_head",
    durationMs: 1500,
    loop: false,
    jointTracks: {
      head: track([[0, 0], [0.25, 8], [0.7, -4], [1, 0]]),
      right_shoulder: track([[0, 0], [0.28, -115], [0.78, -108], [1, 0]]),
      right_elbow: track([[0, 0], [0.28, 75], [0.48, 62], [0.68, 78], [1, 0]]),
      right_hand: track([[0, 0], [0.4, 12], [0.55, -10], [0.7, 12], [1, 0]]),
    },
  },
  fall: {
    id: "fall",
    durationMs: 700,
    loop: true,
    jointTracks: {
      head: track([[0, -4], [0.5, 4], [1, -4]]),
      left_shoulder: track([[0, -95], [0.5, -112], [1, -95]]),
      right_shoulder: track([[0, 95], [0.5, 112], [1, 95]]),
      left_elbow: track([[0, -22], [0.5, 16], [1, -22]]),
      right_elbow: track([[0, 22], [0.5, -16], [1, 22]]),
    },
    rootRotation: track([[0, -3], [0.5, 3], [1, -3]]),
  },
  sad: {
    id: "sad",
    durationMs: 1800,
    loop: false,
    jointTracks: {
      head: track([
        [0, 0],
        [0.45, 16],
        [1, 12],
      ]),
      torso: track([
        [0, 0],
        [0.45, 7],
        [1, 5],
      ]),
      left_shoulder: track([
        [0, 0],
        [0.5, 18],
        [1, 14],
      ]),
      right_shoulder: track([
        [0, 0],
        [0.5, -18],
        [1, -14],
      ]),
    },
    rootY: track([
      [0, 0],
      [0.5, 5],
      [1, 3],
    ]),
  },
  talk: {
    id: "talk",
    durationMs: 900,
    loop: true,
    jointTracks: {
      head: track([
        [0, 0],
        [0.25, 2.5],
        [0.5, 0],
        [0.75, 2],
        [1, 0],
      ]),
    },
  },
  walk: {
    id: "walk",
    durationMs: 700,
    loop: true,
    jointTracks: {
      torso: track([
        [0, -2],
        [0.5, 2],
        [1, -2],
      ]),
      left_hip: track([
        [0, 14],
        [0.5, -14],
        [1, 14],
      ]),
      right_hip: track([
        [0, -14],
        [0.5, 14],
        [1, -14],
      ]),
      left_knee: track([
        [0, 6],
        [0.3, 26],
        [0.5, 8],
        [1, 6],
      ]),
      right_knee: track([
        [0, 8],
        [0.25, 6],
        [0.8, 26],
        [1, 8],
      ]),
      left_shoulder: track([
        [0, -12],
        [0.5, 12],
        [1, -12],
      ]),
      right_shoulder: track([
        [0, 12],
        [0.5, -12],
        [1, 12],
      ]),
      left_elbow: track([
        [0, 10],
        [0.5, -6],
        [1, 10],
      ]),
      right_elbow: track([
        [0, -6],
        [0.5, 10],
        [1, -6],
      ]),
    },
    rootY: track([
      [0, 0],
      [0.25, -3.5],
      [0.5, 0],
      [0.75, -3.5],
      [1, 0],
    ]),
    rootRotation: track([
      [0, -1.5],
      [0.5, 1.5],
      [1, -1.5],
    ]),
  },
  stop_at_pond: {
    id: "stop_at_pond",
    durationMs: 900,
    loop: false,
    jointTracks: {
      torso: track([
        [0, 0],
        [0.6, -6],
        [1, -6],
      ]),
      head: track([
        [0, 0],
        [0.6, 8],
        [1, 8],
      ]),
    },
  },
  hold_rod: {
    id: "hold_rod",
    durationMs: 500,
    loop: false,
    jointTracks: {
      right_shoulder: track([
        [0, 0],
        [1, 45],
      ]),
      right_elbow: track([
        [0, 0],
        [1, -30],
      ]),
      left_shoulder: track([
        [0, 0],
        [1, -20],
      ]),
    },
  },
  cast_rod: {
    id: "cast_rod",
    durationMs: 1400,
    loop: false,
    jointTracks: {
      right_shoulder: track([
        [0, 45],
        [0.35, -40],
        [0.7, 30],
        [1, 40],
      ]),
      right_elbow: track([
        [0, -30],
        [0.35, 20],
        [1, -25],
      ]),
      torso: track([
        [0, 0],
        [0.35, 6],
        [0.7, -4],
        [1, 0],
      ]),
    },
  },
  pull_fish: {
    id: "pull_fish",
    durationMs: 1600,
    loop: false,
    jointTracks: {
      torso: track([
        [0, 0],
        [0.3, 10],
        [0.5, -6],
        [0.7, 10],
        [1, 0],
      ]),
      right_shoulder: track([
        [0, 40],
        [0.3, 60],
        [0.5, 20],
        [1, 45],
      ]),
      left_shoulder: track([
        [0, -20],
        [0.3, -40],
        [1, -30],
      ]),
    },
    rootY: track([
      [0, 0],
      [0.3, 4],
      [0.5, 0],
      [1, 0],
    ]),
  },
};
