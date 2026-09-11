import { describe, expect, it } from "vitest";
import { inspectSpeech, isCleanSpeech, speechBudgetSeconds, speechPhrases, trimSpeech } from "../../server/ai/speech-guard.js";

const RATE = 24_000;

function synth(segments: Array<{ seconds: number; voiced: boolean }>): Buffer {
  const total = segments.reduce((sum, segment) => sum + Math.round(segment.seconds * RATE), 0);
  const pcm = Buffer.alloc(total * 2);
  let offset = 0;
  for (const segment of segments) {
    const count = Math.round(segment.seconds * RATE);
    for (let i = 0; i < count; i++) {
      const value = segment.voiced ? Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / RATE)) : 0;
      pcm.writeInt16LE(value, (offset + i) * 2);
    }
    offset += count;
  }
  return pcm;
}

const silence = (seconds: number) => ({ seconds, voiced: false });
const voice = (seconds: number) => ({ seconds, voiced: true });

describe("speech guard", () => {
  it("finds phrases separated by real pauses and merges short gaps", () => {
    const phrases = speechPhrases(synth([silence(0.3), voice(1), silence(0.1), voice(1), silence(0.6), voice(0.5), silence(0.2)]), RATE);
    expect(phrases).toHaveLength(2);
    expect(phrases[0].start).toBeCloseTo(0.3, 1);
    expect(phrases[0].end).toBeCloseTo(2.4, 1);
  });

  it("flags a single sentence spoken twice and keeps only the first take", () => {
    const text = "این خط برای پای برهنه‌ام خیلی زبره";
    const pcm = synth([silence(0.3), voice(3.6), silence(0.8), voice(3.9), silence(0.2)]);
    const inspection = inspectSpeech(pcm, RATE, text);
    expect(inspection.repeatCutSeconds).not.toBeNull();
    expect(isCleanSpeech(inspection)).toBe(false);
    const trimmed = trimSpeech(pcm, RATE, inspection);
    const seconds = trimmed.length / 2 / RATE;
    expect(seconds).toBeGreaterThan(3.6);
    expect(seconds).toBeLessThan(4.1);
  });

  it("flags a repeated short exclamation", () => {
    const inspection = inspectSpeech(synth([silence(0.3), voice(0.5), silence(0.7), voice(0.6), silence(0.2)]), RATE, "آها!");
    expect(isCleanSpeech(inspection)).toBe(false);
  });

  it("accepts a pause that matches a sentence break in the text", () => {
    const text = "اوه! توی برکه یک چیزی تکان خورد. بیا ببین چی بود!";
    const pcm = synth([silence(0.2), voice(2.4), silence(0.6), voice(2.2), silence(0.2)]);
    const inspection = inspectSpeech(pcm, RATE, text);
    expect(inspection.repeatCutSeconds).toBeNull();
    expect(isCleanSpeech(inspection)).toBe(true);
  });

  it("accepts an unbalanced interjection before the sentence", () => {
    const text = "اوه! افتادم... یک نردبان پله‌پله برام بکش تا بیام بالا.";
    const inspection = inspectSpeech(synth([silence(0.3), voice(0.8), silence(0.5), voice(5), silence(0.2)]), RATE, text);
    expect(isCleanSpeech(inspection)).toBe(true);
  });

  it("cuts rambling far past the text's duration budget at a phrase boundary", () => {
    const text = "هوم...";
    const pcm = synth([silence(0.3), voice(0.6), silence(0.7), voice(3.5), silence(0.6), voice(2), silence(0.6), voice(4)]);
    const inspection = inspectSpeech(pcm, RATE, text);
    expect(inspection.overBudget).toBe(true);
    const seconds = trimSpeech(pcm, RATE, inspection).length / 2 / RATE;
    expect(seconds).toBeLessThanOrEqual(speechBudgetSeconds(text) + 0.3);
    expect(seconds).toBeGreaterThan(0.6);
  });

  it("cuts an opening interjection echoed after the sentence", () => {
    const text = "اِ! این خط برای پای برهنه‌ام خیلی زبره.";
    const pcm = synth([silence(0.1), voice(3.5), silence(0.4), voice(0.3), silence(0.2)]);
    const inspection = inspectSpeech(pcm, RATE, text);
    expect(inspection.repeatCutSeconds).toBeCloseTo(3.6, 1);
    expect(trimSpeech(pcm, RATE, inspection).length / 2 / RATE).toBeLessThan(3.9);
  });

  it("cuts an extra word after a one-word interjection", () => {
    const inspection = inspectSpeech(synth([silence(0.1), voice(0.7), silence(0.6), voice(0.4), silence(0.2)]), RATE, "هوم...");
    expect(inspection.repeatCutSeconds).toBeCloseTo(0.8, 1);
  });

  it("keeps a genuinely short final clause", () => {
    const inspection = inspectSpeech(synth([silence(0.1), voice(1.6), silence(0.4), voice(0.4), silence(0.2)]), RATE, "خب رفیق، بریم!");
    expect(inspection.repeatCutSeconds).toBeNull();
  });

  it("only trims silence from a clean take", () => {
    const pcm = synth([silence(0.6), voice(2), silence(0.9)]);
    const inspection = inspectSpeech(pcm, RATE, "دو تا کفش برام می‌کشی؟");
    expect(isCleanSpeech(inspection)).toBe(true);
    const seconds = trimSpeech(pcm, RATE, inspection).length / 2 / RATE;
    expect(seconds).toBeGreaterThan(2);
    expect(seconds).toBeLessThan(2.35);
  });
});
