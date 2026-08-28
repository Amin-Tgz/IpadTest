import { describe, expect, it, vi } from "vitest";
import { StoryBeatCoordinator, type StoryBeat } from "../../src/story/story-beat.js";
import type { SpeechPlaybackRequest, SpeechPlaybackResult } from "../../src/story/generated-speech.js";

const played = (source: SpeechPlaybackResult["source"] = "static"): SpeechPlaybackResult => ({
  status: "played", durationMs: 120, source,
});

const beat = (overrides: Partial<StoryBeat> = {}): StoryBeat => ({
  id: "b1",
  bubble: "سلام",
  spoken: "این یک جمله آزمایشی طولانی است",
  emotion: "curious",
  minimumReadMs: 100,
  ...overrides,
});

function makeCoordinator(overrides: Partial<{
  isSpeechInstant: (beat: StoryBeat) => boolean;
  playSpeech: (request: SpeechPlaybackRequest) => Promise<SpeechPlaybackResult>;
}> = {}) {
  const requests: SpeechPlaybackRequest[] = [];
  const coordinator = new StoryBeatCoordinator({
    showBubble: () => void 0,
    playSpeech: (request) => {
      requests.push(request);
      return (overrides.playSpeech ?? (async () => played()))(request);
    },
    isSpeechInstant: overrides.isSpeechInstant ?? (() => false),
    startMotion: async () => void 0,
    cancelSpeech: () => void 0,
  });
  return { coordinator, requests };
}

describe("StoryBeatCoordinator without filler", () => {
  it("plays exactly one request without interjection filler", async () => {
    const { coordinator, requests } = makeCoordinator();
    await coordinator.enqueue(beat());
    expect(requests).toHaveLength(1);
    expect(requests[0].text).toBe("این یک جمله آزمایشی طولانی است");
    expect(requests[0].audioUrl).toBeUndefined();
  });

  it("plays one request even when speech is instant", async () => {
    const { coordinator, requests } = makeCoordinator({ isSpeechInstant: () => true });
    await coordinator.enqueue(beat());
    expect(requests).toHaveLength(1);
    expect(requests[0].text).toBe("این یک جمله آزمایشی طولانی است");
  });

  it("renders explicit static clips as single request", async () => {
    const { coordinator, requests } = makeCoordinator();
    await coordinator.enqueue(beat({ audioUrl: "/audio/hero/shoes-request.pwa" }));
    expect(requests).toHaveLength(1);
    expect(requests[0].audioUrl).toBe("/audio/hero/shoes-request.pwa");
  });

  it("still settles the motion promise after playback", async () => {
    vi.useFakeTimers();
    const settled: string[] = [];
    const coordinator = new StoryBeatCoordinator({
      showBubble: () => void 0,
      playSpeech: async (request) => {
        request.onPlaybackStart?.();
        return { status: "played", durationMs: 50, source: "static" };
      },
      isSpeechInstant: () => false,
      startMotion: async () => { settled.push("motion"); },
      cancelSpeech: () => void 0,
    });
    const done = coordinator.enqueue(beat());
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(settled).toEqual(["motion"]);
    vi.useRealTimers();
  });
});
