import { MOTION_CLIPS, evaluateMotion } from "./motion-clips.js";
export class AnimationController {
    current = null;
    startedAt = 0;
    loopOverride = null;
    onClipEnd = () => void 0;
    play(clip, options = {}) {
        this.current = clip;
        this.startedAt = performance.now();
        this.loopOverride = options.loop ?? null;
    }
    playById(id) {
        const clip = MOTION_CLIPS[id];
        if (clip)
            this.play(clip);
    }
    stop() {
        this.current = null;
    }
    get currentId() {
        return this.current?.id ?? null;
    }
    update(now) {
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
