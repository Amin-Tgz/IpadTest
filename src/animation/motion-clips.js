function track(values) {
    return {
        t: values.map(([t]) => t),
        rotation: values.map(([, v]) => v),
    };
}
function evalTrack(track, t) {
    if (!track || track.t.length === 0)
        return 0;
    const tValues = track.t;
    const vValues = track.rotation;
    if (t <= tValues[0])
        return vValues[0];
    if (t >= tValues[tValues.length - 1])
        return vValues[vValues.length - 1];
    let i = 0;
    while (i < tValues.length - 2 && tValues[i + 1] < t)
        i++;
    const t0 = tValues[i];
    const t1 = tValues[i + 1];
    const v0 = vValues[i];
    const v1 = vValues[i + 1];
    const f = (t - t0) / (t1 - t0);
    const s = f * f * (3 - 2 * f);
    return v0 + (v1 - v0) * s;
}
export function evaluateMotion(clip, timeMs) {
    const t = clip.durationMs > 0 ? Math.min(1, Math.max(0, timeMs / clip.durationMs)) : 1;
    const jointRotations = {};
    for (const [jointId, tr] of Object.entries(clip.jointTracks)) {
        jointRotations[jointId] = evalTrack(tr, t);
    }
    return {
        jointRotations,
        rootDeltaY: evalTrack(clip.rootY, t),
        rootRotation: evalTrack(clip.rootRotation, t),
    };
}
export const MOTION_CLIPS = {
    spawn: {
        id: "spawn",
        durationMs: 700,
        loop: false,
        jointTracks: {},
        rootY: track([
            [0, -30],
            [0.45, 0],
            [0.62, -6],
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
