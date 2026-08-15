import { describe, expect, it, vi } from "vitest";
import { StoryBeatCoordinator, type StoryBeat } from "../../src/story/story-beat.js";
import type { SpeechPlaybackResult } from "../../src/story/generated-speech.js";

const beat = (id: string): StoryBeat => ({
  id,
  bubble: "سلام",
  spoken: "سلام",
  emotion: "curious",
  minimumReadMs: 100,
});

describe("StoryBeatCoordinator", () => {
  it("serializes dialogue and does not start the next line before playback ends", async () => {
    const events: string[] = [];
    const resolvers: Array<(result: SpeechPlaybackResult) => void> = [];
    const coordinator = new StoryBeatCoordinator({
      showBubble: (entry) => events.push(`show:${entry.id}`),
      playSpeech: () => new Promise((resolve) => resolvers.push(resolve)),
      startMotion: async (entry) => { events.push(`motion:${entry.id}`); },
      cancelSpeech: () => void 0,
    });
    const first = coordinator.enqueue(beat("one"));
    const second = coordinator.enqueue(beat("two"));
    await Promise.resolve();
    expect(events).toEqual(["show:one"]);
    resolvers[0]({ status: "played", durationMs: 300, source: "static" });
    await first;
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["show:one", "show:two"]);
    resolvers[1]({ status: "played", durationMs: 200, source: "static" });
    await second;
  });

  it("uses the reading hold only when playback fails", async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const coordinator = new StoryBeatCoordinator({
      showBubble: () => void 0,
      playSpeech: async () => ({ status: "failed", durationMs: 0, source: "generated" }),
      startMotion: async () => void 0,
      onSettled: settled,
      cancelSpeech: () => void 0,
    });
    const result = coordinator.enqueue(beat("fallback"));
    await vi.advanceTimersByTimeAsync(99);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await result).status).toBe("failed");
    expect(settled).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("cancels active and queued beats without settling them", async () => {
    const cancelSpeech = vi.fn();
    let resolvePlayback!: (result: SpeechPlaybackResult) => void;
    const coordinator = new StoryBeatCoordinator({
      showBubble: () => void 0,
      playSpeech: () => new Promise((resolve) => { resolvePlayback = resolve; }),
      startMotion: async () => void 0,
      cancelSpeech,
    });
    const first = coordinator.enqueue(beat("one"));
    const second = coordinator.enqueue(beat("two"));
    await Promise.resolve();
    coordinator.cancel("restart");
    resolvePlayback({ status: "cancelled", durationMs: 20, source: "generated" });
    await expect(first).resolves.toMatchObject({ status: "cancelled" });
    await expect(second).resolves.toMatchObject({ status: "cancelled" });
    expect(cancelSpeech).toHaveBeenCalledWith("restart");
  });
});
