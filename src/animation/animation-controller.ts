import { MOTION_CLIPS, evaluateMotion, type MotionClip, type MotionId, type Pose } from "./motion-clips.js";

export class AnimationController {
  private current: MotionClip | null = null;
  private startedAt = 0;
  private loopOverride: boolean | null = null;
  private walkPhaseTimeMs: number | null = null;
  private previous: MotionClip | null = null;
  private previousStartedAt = 0;
  private previousWalkPhase: number | null = null;
  private crossfadeMs = 110;
  onClipEnd: (clipId: MotionId) => void = () => void 0;

  play(clip: MotionClip, options: { loop?: boolean } = {}): void {
    if (this.current && this.current.id !== clip.id) {
      this.previous = this.current;
      this.previousStartedAt = this.startedAt;
      this.previousWalkPhase = this.walkPhaseTimeMs;
    } else {
      this.previous = null;
    }
    this.current = clip;
    this.startedAt = performance.now();
    this.loopOverride = options.loop ?? null;
  }

  playById(id: MotionId): void {
    const clip = MOTION_CLIPS[id];
    if (clip) this.play(clip);
  }

  stop(): void {
    this.current = null;
  }

  setWalkDistance(distance: number, strideLength: number): void {
    const clip = MOTION_CLIPS.walk;
    const stride = Math.max(20, strideLength);
    this.walkPhaseTimeMs = ((Math.max(0, distance) % stride) / stride) * clip.durationMs;
  }

  get currentId(): MotionId | null {
    return this.current?.id ?? null;
  }

  update(now: number): Pose {
    if (!this.current) {
      return { jointRotations: {}, rootDeltaY: 0, rootRotation: 0 };
    }
    const elapsed = now - this.startedAt;
    const loop = this.loopOverride ?? this.current.loop;
    if (!loop && elapsed >= this.current.durationMs) {
      const finished = this.current;
      this.current = null;
      this.previous = null;
      this.onClipEnd(finished.id);
      return { jointRotations: {}, rootDeltaY: 0, rootRotation: 0 };
    }
    const timeMs = this.current.id === "walk" && this.walkPhaseTimeMs !== null
      ? this.walkPhaseTimeMs
      : loop ? elapsed % this.current.durationMs : Math.min(elapsed, this.current.durationMs);
    const currentPose = evaluateMotion(this.current, timeMs);
    if (!this.previous || elapsed >= this.crossfadeMs) {
      if (elapsed >= this.crossfadeMs) this.previous = null;
      return currentPose;
    }
    const prevElapsed = now - this.previousStartedAt;
    const prevLoop = this.previous.loop;
    if (!prevLoop && prevElapsed >= this.previous.durationMs) {
      this.previous = null;
      return currentPose;
    }
    const prevTimeMs = this.previous.id === "walk" && this.previousWalkPhase !== null
      ? this.previousWalkPhase
      : prevLoop ? prevElapsed % this.previous.durationMs : Math.min(prevElapsed, this.previous.durationMs);
    const prevPose = evaluateMotion(this.previous, prevTimeMs);
    const t = Math.max(0, Math.min(1, elapsed / this.crossfadeMs));
    const s = t * t * (3 - 2 * t);
    return blendPose(prevPose, currentPose, s);
  }
}

function blendPose(a: Pose, b: Pose, t: number): Pose {
  const jointRotations: Pose["jointRotations"] = {};
  const keys = new Set([...Object.keys(a.jointRotations), ...Object.keys(b.jointRotations)]);
  for (const key of keys) {
    const av = (a.jointRotations as Record<string, number>)[key] ?? 0;
    const bv = (b.jointRotations as Record<string, number>)[key] ?? 0;
    (jointRotations as Record<string, number>)[key] = av + (bv - av) * t;
  }
  return {
    jointRotations,
    rootDeltaY: a.rootDeltaY + (b.rootDeltaY - a.rootDeltaY) * t,
    rootRotation: a.rootRotation + (b.rootRotation - a.rootRotation) * t,
  };
}
