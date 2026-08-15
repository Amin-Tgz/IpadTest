import { describe, expect, it } from "vitest";
import { choosePersianVoice, chooseSpeechVoice, normalizePersianSpeechText } from "../../src/story/persian-speech.js";

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

  it("always selects an explicit fallback voice for Safari when Persian is unavailable", () => {
    const voices = [
      { name: "English", lang: "en-US", localService: true },
      { name: "French", lang: "fr-FR", localService: true },
    ];
    expect(chooseSpeechVoice(voices, "fr-CA")?.name).toBe("French");
    expect(chooseSpeechVoice(voices, "fa-IR")?.name).toBe("English");
  });

  it("removes spoken punctuation, emoji, and formatting from AI text", () => {
    expect(normalizePersianSpeechText("!!! **سلام!** 😊 حالت چطوره؟")).toBe("سلام حالت چطوره");
    expect(normalizePersianSpeechText("!؟…")).toBe("");
  });
});
