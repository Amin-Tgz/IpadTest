import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { AIProvider } from "../ai/provider.js";
import { withRetries, extractJson, isProviderError } from "../ai/retry-policy.js";
import { characterAnalysisPrompt, characterRepairPrompt, CHARACTER_JSON_SCHEMA } from "../ai/prompts.js";
import { sanitizeCharacterAnalysis, skeletonIsSound } from "../ai/validation.js";
import { IMAGE_MAX_BYTES, CANVAS_MAX } from "../ai/skeleton.js";
import type { ServerConfig } from "../config.js";

const bodySchema = z.object({
  image: z.string().min(100).max(20000000),
  canvas: z.object({
    width: z.number().min(1).max(CANVAS_MAX),
    height: z.number().min(1).max(CANVAS_MAX),
  }),
});

function decodeImage(image: string): { mime: string; data: Buffer } {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(image);
  if (!match) throw new Error("image must be a data URL");
  const mime = match[1];
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new Error("unsupported image mime");
  }
  const data = Buffer.from(match[2], "base64");
  if (data.byteLength > IMAGE_MAX_BYTES) throw new Error("image too large");
  return { mime, data };
}

export function analyzeCharacterRoute(provider: AIProvider, config: ServerConfig) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const started = Date.now();
    try {
      const body = bodySchema.parse(req.body);
      const { mime } = decodeImage(body.image);
      void mime;

      const prompt = characterAnalysisPrompt(body.canvas.width, body.canvas.height);
      const messages = [
        {
          role: "system" as const,
          content: [{ type: "text" as const, text: prompt }],
        },
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: "Analyze this drawing." }, { type: "image_url" as const, image_url: { url: body.image } }],
        },
      ];

      const result = await withRetries(
        () => provider.complete({ messages, responseSchema: CHARACTER_JSON_SCHEMA, responseName: "character_analysis" }),
        isProviderError,
        { maxRetries: config.AI_MAX_RETRIES, delayMs: 700, backoffFactor: 2 },
      );

      let raw: unknown;
      try {
        raw = extractJson(result.text);
      } catch (error) {
        const repair = await provider.complete({
          messages: [
            ...messages,
            {
              role: "user" as const,
              content: [{ type: "text" as const, text: characterRepairPrompt(`could not parse JSON: ${error instanceof Error ? error.message : "parse error"}`) }],
            },
          ],
        });
        raw = extractJson(repair.text);
      }

      let analysis;
      try {
        analysis = sanitizeCharacterAnalysis(raw, body.canvas);
      } catch (error) {
        const repair = await provider.complete({
          messages: [
            ...messages,
            {
              role: "user" as const,
              content: [{ type: "text" as const, text: characterRepairPrompt(error instanceof Error ? error.message : "validation failed") }],
            },
          ],
        });
        analysis = sanitizeCharacterAnalysis(extractJson(repair.text), body.canvas);
      }

      res.json({
        analysis,
        skeletonSound: skeletonIsSound(analysis),
        latencyMs: Date.now() - started,
        model: result.rawModel ?? provider.model,
      });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 422;
      console.error("[pencil-ai] character_analysis_failed", {
        status,
        message: error instanceof Error ? error.message : "unknown error",
      });
      res.status(status).json({
        error: "character_analysis_failed",
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  return router;
}
