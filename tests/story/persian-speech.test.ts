import { describe, expect, it } from "vitest";
import { choosePersianVoice } from "../../src/story/persian-speech.js";

describe("Persian speech voice selection", () => {
  it("prefers a local fa-IR voice and ignores non-Persian voices", () => {
    const voices = [
      { name: "English", lang: "en-US", localService: true },
      { name: "Cloud Persian", lang: "fa", localService: false },
      { name: "Darya", lang: "fa-IR", localService: true },
    ];
    expect(choosePersianVoice(voices)?.name).toBe("Darya");
  });

  it("returns null when Persian speech is unavailable", () => {
    expect(choosePersianVoice([{ name: "English", lang: "en-US", localService: true }])).toBeNull();
  });
});
