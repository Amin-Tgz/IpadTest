import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { loadConfig, type ServerConfig } from "./config.js";
import type { AIProvider } from "./ai/provider.js";
import { OpenAICompatibleProvider } from "./ai/openai-compatible.js";
import { analyzeCharacterRoute } from "./routes/analyze-character.js";
import { analyzeDrawingRoute } from "./routes/analyze-drawing.js";
import { configPublicRoute } from "./routes/config-public.js";
import { rateLimiter } from "./middleware/rate-limit.js";
import { GeminiSpeechGenerator, type SpeechGenerator } from "./ai/gemini-tts.js";
import { speechRoute } from "./routes/speech.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppDeps {
  config?: ServerConfig;
  provider?: AIProvider;
  enableRateLimit?: boolean;
  enableLegacyCharacterAnalysis?: boolean;
  speechGenerator?: SpeechGenerator;
}

export function createApp(deps: AppDeps = {}) {
  const cfg = deps.config ?? loadConfig();
  const provider = deps.provider ?? new OpenAICompatibleProvider(cfg);
  const speechGenerator = deps.speechGenerator ?? new GeminiSpeechGenerator(cfg);
  const app = express();

  app.use(express.json({ limit: "24mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/debug/speech-log", (req, res) => {
    const event = typeof req.body?.event === "string" ? req.body.event.slice(0, 80) : "invalid_event";
    const detail = req.body?.detail && typeof req.body.detail === "object" ? req.body.detail : {};
    const userAgent = typeof req.body?.userAgent === "string" ? req.body.userAgent.slice(0, 240) : "unknown";
    console.log(`[pencil-ai] speech_debug ${event}`, { ...detail, userAgent });
    res.status(204).end();
  });

  app.use("/api/config/public", configPublicRoute(provider.model));

  if (deps.enableRateLimit ?? true) {
    app.use("/api/character", rateLimiter(12, 60_000));
    app.use("/api/drawing", rateLimiter(20, 60_000));
    app.use("/api/speech", rateLimiter(30, 60_000));
  }
  if (deps.enableLegacyCharacterAnalysis) {
    app.use("/api/character/analyze", analyzeCharacterRoute(provider, cfg));
  }
  app.use("/api/drawing/analyze", analyzeDrawingRoute(provider, cfg));
  app.use("/api/speech", speechRoute(speechGenerator));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
    console.error("[pencil-ai] unhandled error:", error);
    res.status(500).json({ error: "internal_error" });
  });

  const distDir = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
  }

  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const app = createApp({
    config,
    enableLegacyCharacterAnalysis: process.env.ENABLE_LEGACY_CHARACTER_ANALYSIS === "1",
  });
  const server = app.listen(config.PORT, () => {
    console.log(`[pencil-ai] server listening on http://localhost:${config.PORT}`);
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[pencil-ai] port ${config.PORT} is already in use. Stop the existing Pencil AI server or change PORT in .env.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  });
}
