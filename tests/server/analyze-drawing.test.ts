import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../server/app.js";
import { MockProvider, pngDataUrl } from "./mock-provider.js";

const validDrawing = {
  goalId: "draw_shoes",
  recognized: true,
  matchesGoal: true,
  confidence: 0.92,
  objects: [
    {
      type: "shoe",
      category: "wearable",
      boundingBox: { x: 100, y: 300, width: 80, height: 55 },
      attachTo: "left_foot",
      anchor: { x: 120, y: 330 },
      orientationDegrees: 3,
      affordances: ["wear", "walk"],
    },
    {
      type: "shoe",
      category: "wearable",
      boundingBox: { x: 240, y: 300, width: 80, height: 55 },
      attachTo: "right_foot",
      anchor: { x: 260, y: 330 },
      orientationDegrees: -2,
      affordances: ["wear", "walk"],
    },
  ],
  interpretation: "A pair of boots",
  mappedAction: "equip_shoes",
  reaction: { emotion: "excited", bubble: "وای! عالی‌اند!" },
};

describe("POST /api/drawing/analyze", () => {
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

  it("returns a sanitized drawing analysis", async () => {
    provider.responses = [{ text: JSON.stringify(validDrawing), rawModel: "mock" }];
    const res = await fetch(`${baseUrl}/api/drawing/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: pngDataUrl(),
        deltaCrop: pngDataUrl(),
        canvas: { width: 512, height: 512 },
        goal: "draw shoes",
        joints: [
          { id: "left_foot", x: 120, y: 330 },
          { id: "right_foot", x: 260, y: 330 },
        ],
        worldSummary: "character stands on the ground line",
        acceptedCategories: ["shoe", "boot", "skate", "slipper"],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      analysis: { matchesGoal: boolean; objects: unknown[] };
      model: string;
    };
    expect(body.analysis.matchesGoal).toBe(true);
    expect(body.analysis.objects).toHaveLength(2);
    expect(body.model).toBe("mock");
  });

  it("handles a non-matching drawing", async () => {
    provider.responses = [
      {
        text: JSON.stringify({
          ...validDrawing,
          matchesGoal: false,
          mappedAction: "none",
          reaction: { emotion: "confused", bubble: "این کفشه یا سیب‌زمینی؟" },
        }),
        rawModel: "mock",
      },
    ];
    const res = await fetch(`${baseUrl}/api/drawing/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: pngDataUrl(),
        canvas: { width: 512, height: 512 },
        goal: "draw shoes",
        joints: [],
        worldSummary: "x",
        acceptedCategories: ["shoe"],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analysis: { matchesGoal: boolean } };
    expect(body.analysis.matchesGoal).toBe(false);
  });

  it("rejects malformed bodies", async () => {
    const res = await fetch(`${baseUrl}/api/drawing/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
