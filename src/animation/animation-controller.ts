import { MOTION_CLIPS, evaluateMotion, type MotionClip, type MotionId, type Pose } from "./motion-clips.js";

export class AnimationController {
  private current: MotionClip | null = null;
  private startedAt = 0;
  private loopOverride: boolean | null = null;
  onClipEnd: (clipId: MotionId) => void = () => void 0;

  play(clip: MotionClip, options: { loop?: boolean } = {}): void {
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
      this.onClipEnd(finished.id);
      return { jointRotations: {}, rootDeltaY: 0, rootRotation: 0 };
    }
    const timeMs = loop ? elapsed % this.current.durationMs : Math.min(elapsed, this.current.durationMs);
    return evaluateMotion(this.current, timeMs);
  }
}
