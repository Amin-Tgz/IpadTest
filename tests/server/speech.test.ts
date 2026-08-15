import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pcmToWav, type SpeechGenerator } from "../../server/ai/gemini-tts.js";
import { speechRoute } from "../../server/routes/speech.js";

describe("generated speech", () => {
  let server: Server;
  let baseUrl = "";
  const generator: SpeechGenerator = {
    async generate() {
      return { bytes: pcmToWav(Buffer.alloc(240)), contentType: "audio/wav", cacheHit: false };
    },
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/speech", speechRoute(generator));
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    const address = server.address();
    baseUrl = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("wraps PCM in a valid WAV response", async () => {
    const response = await fetch(`${baseUrl}/api/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "سلام" }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^audio\/wav/);
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    expect(bytes.readUInt32LE(40)).toBe(240);
  });

  it("rejects empty text", async () => {
    const response = await fetch(`${baseUrl}/api/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    expect(response.status).toBe(400);
  });
});
