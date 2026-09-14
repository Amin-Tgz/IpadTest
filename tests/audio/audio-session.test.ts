import { beforeEach, describe, expect, it, vi } from "vitest";
import { playbackSessionType, preferPlaybackSession, resetPlaybackSessionForTests } from "../../src/audio/audio-session.js";

function fakeDocument() {
  const listeners: Array<() => void> = [];
  const element = {
    src: "",
    loop: false,
    preload: "",
    paused: true,
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) { this.attributes[name] = value; },
    play: vi.fn(function (this: { paused: boolean }) { this.paused = false; return Promise.resolve(); }),
    pause: vi.fn(function (this: { paused: boolean }) { this.paused = true; }),
  };
  const doc = {
    visibilityState: "visible",
    createElement: vi.fn(() => element),
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
    fire: () => listeners.forEach((listener) => listener()),
  };
  return { doc, element };
}

describe("playback audio session", () => {
  beforeEach(() => resetPlaybackSessionForTests());

  it("asks Safari for a playback session so Silent mode cannot mute the voice", () => {
    const nav = { audioSession: { type: "auto" } };
    const { doc } = fakeDocument();
    expect(preferPlaybackSession(nav, doc)).toBe("audio-session");
    expect(nav.audioSession.type).toBe("playback");
    expect(doc.createElement).not.toHaveBeenCalled();
    expect(playbackSessionType(nav)).toBe("playback");
  });

  it("holds the session with one silent looping audio element on older Safari", () => {
    const { doc, element } = fakeDocument();
    expect(preferPlaybackSession({}, doc)).toBe("silent-element");
    expect(preferPlaybackSession({}, doc)).toBe("silent-element");
    expect(doc.createElement).toHaveBeenCalledTimes(1);
    expect(element.loop).toBe(true);
    expect(element.attributes.playsinline).toBe("");
    expect(element.src).toMatch(/^data:audio\/wav;base64,UklGR/);
    expect(element.play).toHaveBeenCalledTimes(2);
    expect(playbackSessionType({})).toBe("silent-element");
  });

  it("pauses the silent element in the background and resumes it on return", () => {
    const { doc, element } = fakeDocument();
    preferPlaybackSession({}, doc);
    doc.visibilityState = "hidden";
    doc.fire();
    expect(element.pause).toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.fire();
    expect(element.play).toHaveBeenCalledTimes(2);
  });

  it("falls back to the silent element when the session refuses playback", () => {
    const session = {};
    Object.defineProperty(session, "type", { get: () => "ambient", set: () => { throw new Error("not allowed"); } });
    const { doc } = fakeDocument();
    expect(preferPlaybackSession({ audioSession: session as { type: string } }, doc)).toBe("silent-element");
  });
});
