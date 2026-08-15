import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../server/app.js";
import { MockProvider, pngDataUrl, validCharacterJson } from "./mock-provider.js";

describe("POST /api/character/analyze", () => {
  let server: Server;
  let baseUrl: string;
  let provider: MockProvider;

  beforeAll(async () => {
    provider = new MockProvider();
    const app = createApp({
      config: {
        PORT: 0,
        AI_BASE_URL: "http://mock",
        AI_API_KEY: "mock-key",
        AI_MODEL: "mock-model",
        AI_TIMEOUT_MS: 5000,
        AI_MAX_RETRIES: 0,
        AI_JSON_MODE: "json_schema",
        AI_THINKING_LEVEL: "low",
        TTS_MODEL: "mock-tts",
        TTS_VOICE: "mock-voice",
        TTS_STYLE: "mock style",
      },
      provider,
      enableRateLimit: false,
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    baseUrl = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(() => {
    server.close();
  });

  it("returns sanitized analysis", async () => {
    provider.responses = [{ text: validCharacterJson(), rawModel: "mock-model" }];
    const res = await fetch(`${baseUrl}/api/character/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: pngDataUrl(), canvas: { width: 512, height: 512 } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analysis: { character: { confidence: number } }; skeletonSound: boolean; model: string };
    expect(body.analysis.character.confidence).toBe(0.9);
    expect(body.skeletonSound).toBe(true);
    expect(body.model).toBe("mock-model");
  });

  it("repairs invalid JSON with a second call", async () => {
    provider.responses = [
      { text: "Sorry, here: {broken", rawModel: "mock" },
      { text: validCharacterJson(), rawModel: "mock" },
    ];
    const res = await fetch(`${baseUrl}/api/character/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: pngDataUrl(), canvas: { width: 512, height: 512 } }),
    });
    expect(res.status).toBe(200);
    expect(provider.responses.length).toBe(0);
  });

  it("returns the analysis for client fallback when AI segmentation repair is still empty", async () => {
    const withoutRegions = JSON.parse(validCharacterJson()) as { character: { partRegions: unknown[] } };
    withoutRegions.character.partRegions = [];
    const text = JSON.stringify(withoutRegions);
    provider.responses = [{ text, rawModel: "mock" }, { text, rawModel: "mock" }];
    const res = await fetch(`${baseUrl}/api/character/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: pngDataUrl(), canvas: { width: 512, height: 512 } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analysis: { character: { partRegions: unknown[] } } };
    expect(body.analysis.character.partRegions).toEqual([]);
  });

  it("rejects malformed body", async () => {
    const res = await fetch(`${baseUrl}/api/character/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 422 when analysis cannot be produced", async () => {
    provider.responses = [new Error("provider down")];
    const res = await fetch(`${baseUrl}/api/character/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: pngDataUrl(), canvas: { width: 512, height: 512 } }),
    });
    expect(res.status).toBe(422);
  });
});
