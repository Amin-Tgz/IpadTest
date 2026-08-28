import type { MotionId } from "../animation/motion-clips.js";
import type { HeroVoicePreset } from "../character/living-line-hero.js";
import type { SpeechPlaybackRequest, SpeechPlaybackResult } from "./generated-speech.js";

export interface StoryBeat {
  id: string;
  bubble: string;
  spoken: string;
  emotion: HeroVoicePreset;
  audioUrl?: string;
  fallbackAudioUrl?: string;
  motion?: MotionId;
  minimumReadMs?: number;
}

export interface StoryBeatHooks {
  showBubble(beat: StoryBeat): void;
  playSpeech(request: SpeechPlaybackRequest): Promise<SpeechPlaybackResult>;
  isSpeechInstant?(beat: StoryBeat): boolean;
  startMotion(beat: StoryBeat): Promise<void>;
  onSettled?(beat: StoryBeat, result: SpeechPlaybackResult): void;
  cancelSpeech(reason: string): void;
}

export class StoryBeatCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;

  constructor(private readonly hooks: StoryBeatHooks) {}

  enqueue(beat: StoryBeat): Promise<SpeechPlaybackResult> {
    const generation = this.generation;
    let resolveResult!: (result: SpeechPlaybackResult) => void;
    const resultPromise = new Promise<SpeechPlaybackResult>((resolve) => { resolveResult = resolve; });
    this.tail = this.tail.then(async () => {
      if (generation !== this.generation) {
        resolveResult({ status: "cancelled", durationMs: 0, source: beat.audioUrl ? "static" : "generated" });
        return;
      }
      this.hooks.showBubble(beat);
      let motion: Promise<void> | null = null;
      const startMotion = (): void => { motion ??= this.hooks.startMotion(beat); };
      const result = await this.playWithFiller(beat, startMotion);
      if (result.status === "failed") startMotion();
      const readMs = beat.minimumReadMs ?? Math.max(1_900, Math.min(5_600, beat.bubble.length * 92));
      if (result.status === "failed") {
        await wait(Math.max(0, readMs - result.durationMs));
      }
      await (motion ?? Promise.resolve());
      if (generation === this.generation) this.hooks.onSettled?.(beat, result);
      resolveResult(result);
    });
    return resultPromise;
  }

  cancel(reason = "cancelled"): void {
    this.generation++;
    this.hooks.cancelSpeech(reason);
    this.tail = Promise.resolve();
  }

  private async playWithFiller(
    beat: StoryBeat,
    startMotion: () => void,
  ): Promise<SpeechPlaybackResult> {
    const request: SpeechPlaybackRequest = {
      text: beat.spoken,
      preset: beat.emotion,
      audioUrl: beat.audioUrl,
      fallbackAudioUrl: beat.fallbackAudioUrl,
      onPlaybackStart: startMotion,
    };
    return this.hooks.playSpeech(request);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
