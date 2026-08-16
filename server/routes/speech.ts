import { Router } from "express";
import { z } from "zod";
import type { SpeechGenerator } from "../ai/gemini-tts.js";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(200),
  preset: z.enum(["curious", "protesting", "confused", "effort", "delighted", "sad"]).default("curious"),
});

export function speechRoute(generator: SpeechGenerator): Router {
  const router = Router();
  router.post("/", async (req, res) => {
    try {
      const { text, preset } = bodySchema.parse(req.body);
      const audio = await generator.generate(text, preset);
      res.setHeader("content-type", audio.contentType);
      res.setHeader("cache-control", "private, max-age=86400");
      res.setHeader("x-tts-cache", audio.cacheHit ? "hit" : "miss");
      res.send(audio.bytes);
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 502;
      console.error("[line-pal] tts_failed", error instanceof Error ? error.message : error);
      res.status(status).json({ error: status === 400 ? "invalid_speech_request" : "speech_generation_failed" });
    }
  });
  return router;
}
