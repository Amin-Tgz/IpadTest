import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiSpeechGenerator, speechDirection } from "../../server/ai/gemini-tts.js";
import { loadConfig } from "../../server/config.js";

const RATE = 24_000;

function pcm(segments: Array<[seconds: number, voiced: boolean]>): Buffer {
  const total = segments.reduce((sum, [seconds]) => sum + Math.round(seconds * RATE), 0);
  const out = Buffer.alloc(total * 2);
  let offset = 0;
  for (const [seconds, voiced] of segments) {
    const count = Math.round(seconds * RATE);
    for (let i = 0; i < count; i++) out.writeInt16LE(voiced ? Math.round(8000 * Math.sin(i / 10)) : 0, (offset + i) * 2);
    offset += count;
  }
  return out;
}

function audioResponse(bytes: Buffer): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { data: bytes.toString("base64"), mimeType: `audio/L16;rate=${RATE}` } }] } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

const config = loadConfig({ AI_BASE_URL: "https://provider.test/v1", AI_API_KEY: "k", AI_MODEL: "m" });
const TEXT = "این خط برای پای برهنه‌ام خیلی زبره";
const repeated = pcm([[0.3, false], [3.6, true], [0.8, false], [3.9, true], [0.2, false]]);
const clean = pcm([[0.3, false], [3.6, true], [0.3, false]]);

describe("Gemini speech generator", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives an English director's note and ends with the line itself", () => {
    const direction = speechDirection("Speak warmly.", "protesting", TEXT);
    expect(direction).toBe(`Speak warmly, playfully protesting, quick but kind. Say it once: ${TEXT}`);
  });

  it("rejects a repeated take and returns the clean retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(audioResponse(repeated))
      .mockResolvedValueOnce(audioResponse(clean));
    vi.stubGlobal("fetch", fetchMock);
    const audio = await new GeminiSpeechGenerator(config).generate(TEXT, "protesting");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const seconds = (audio.bytes.length - 44) / 2 / RATE;
    expect(seconds).toBeLessThan(4.1);
  });

  it("trims the first take when every take repeats the line", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(audioResponse(repeated)));
    vi.stubGlobal("fetch", fetchMock);
    const audio = await new GeminiSpeechGenerator(config).generate(TEXT, "protesting");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const seconds = (audio.bytes.length - 44) / 2 / RATE;
    expect(seconds).toBeGreaterThan(3.6);
    expect(seconds).toBeLessThan(4.1);
  });
});
