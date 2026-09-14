import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratedSpeech, isRetryableSpeechStatus, type SpeechPlaybackResult } from "../../src/story/generated-speech.js";

describe("generated speech policy", () => {
  it.each([408, 429, 500, 502, 503])("retries transient HTTP %s", (status) => {
    expect(isRetryableSpeechStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])("does not retry permanent HTTP %s", (status) => {
    expect(isRetryableSpeechStatus(status)).toBe(false);
  });

  it("ships every tutorial manifest entry as WAV-encoded local audio", async () => {
    const root = path.resolve(process.cwd(), "public/audio/hero");
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as Record<string, { path: string }>;
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(7);
    for (const entry of Object.values(manifest)) {
      expect(entry.path).toMatch(/^\/audio\/hero\/.+\.pwa$/);
      const bytes = await readFile(path.join(process.cwd(), "public", entry.path.replace(/^\/audio\//, "audio/")));
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    }
  });
});

class FakeAudioContext {
  state: AudioContextState = "running";
  destination = {};
  async resume(): Promise<void> {}
  async decodeAudioData(): Promise<AudioBuffer> {
    return { duration: 1 } as AudioBuffer;
  }
  createBufferSource() {
    return { buffer: null, onended: null, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    return { connect() {} };
  }
  createAnalyser() {
    return { fftSize: 0, frequencyBinCount: 8, connect() {}, getByteTimeDomainData() {} };
  }
}

function slowSpeechEndpoint(delayMs: number) {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const id = setTimeout(() => resolve({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) } as Response), delayMs);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    });
  }));
}

function track(promise: Promise<SpeechPlaybackResult>): { result: SpeechPlaybackResult | null } {
  const state: { result: SpeechPlaybackResult | null } = { result: null };
  void promise.then((result) => { state.result = result; });
  return state;
}

describe("generated speech timing", () => {
  const line = { text: "هوف! رسیدم بالا؛ از این بالا همه‌جا پیداست!", preset: "delighted" as const };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      addEventListener: () => void 0,
      setTimeout: (handler: () => void, ms?: number) => setTimeout(handler, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("still speaks a line whose generation outlasts one clean take", async () => {
    vi.stubGlobal("fetch", slowSpeechEndpoint(11_000));
    const playback = track(new GeneratedSpeech().play(line));
    await vi.advanceTimersByTimeAsync(11_000 + 2_600);
    expect(playback.result?.status).toBe("played");
  });

  it("lets a line join a generation primed earlier without inheriting that request's deadline", async () => {
    const endpoint = slowSpeechEndpoint(15_000);
    vi.stubGlobal("fetch", endpoint);
    const speech = new GeneratedSpeech();
    void speech.prime(line);
    await vi.advanceTimersByTimeAsync(10_000);
    const playback = track(speech.play(line));
    await vi.advanceTimersByTimeAsync(5_000 + 2_600);
    expect(playback.result?.status).toBe("played");
    expect(endpoint).toHaveBeenCalledTimes(1);
  });

  it("gives up on a line only after its wait budget and keeps the late audio for next time", async () => {
    const endpoint = slowSpeechEndpoint(25_000);
    vi.stubGlobal("fetch", endpoint);
    const speech = new GeneratedSpeech();
    const playback = track(speech.play(line));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(playback.result).toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(playback.result?.status).toBe("failed");
    await vi.advanceTimersByTimeAsync(6_000);
    expect(speech.isInstant(line)).toBe(true);
    expect(endpoint).toHaveBeenCalledTimes(1);
  });

  it("does not let a cancelled line abort a generation the next line is waiting for", async () => {
    const endpoint = slowSpeechEndpoint(6_000);
    vi.stubGlobal("fetch", endpoint);
    const speech = new GeneratedSpeech();
    const first = track(speech.play(line));
    await vi.advanceTimersByTimeAsync(2_000);
    speech.cancel("replaced");
    const second = track(speech.play(line));
    await vi.advanceTimersByTimeAsync(4_000 + 2_600);
    expect(first.result?.status).toBe("cancelled");
    expect(second.result?.status).toBe("played");
    expect(endpoint).toHaveBeenCalledTimes(1);
  });
});
