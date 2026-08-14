import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { AIProvider } from "../ai/provider.js";
import { withRetries, extractJson, isProviderError } from "../ai/retry-policy.js";
import { drawingAnalysisPrompt, drawingRepairPrompt, DRAWING_JSON_SCHEMA, type DrawingPromptContext } from "../ai/drawing-prompts.js";
import { sanitizeDrawingAnalysis } from "../ai/drawing-validation.js";
import { IMAGE_MAX_BYTES, CANVAS_MAX } from "../ai/skeleton.js";
import type { ServerConfig } from "../config.js";

const bodySchema = z.object({
  image: z.string().min(100).max(20000000),
  deltaCrop: z.string().nullable().optional(),
  deltaCropInImageA: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }).nullable().optional(),
  canvas: z.object({
    width: z.number().min(1).max(CANVAS_MAX),
    height: z.number().min(1).max(CANVAS_MAX),
  }),
  goal: z.string().min(1).max(200),
  joints: z.array(z.object({ id: z.string().max(40), x: z.number(), y: z.number() })).max(32),
  worldSummary: z.string().max(400),
  acceptedCategories: z.array(z.string().max(40)).max(12),
});

function checkImage(image: string): void {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(image);
  if (!match) throw new Error("image must be a data URL");
  const mime = match[1];
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new Error("unsupported image mime");
  }
  const data = Buffer.from(match[2], "base64");
  if (data.byteLength > IMAGE_MAX_BYTES) throw new Error("image too large");
}

export function analyzeDrawingRoute(provider: AIProvider, config: ServerConfig) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const started = Date.now();
    try {
      const body = bodySchema.parse(req.body);
      checkImage(body.image);
      if (body.deltaCrop) checkImage(body.deltaCrop);

      const context: DrawingPromptContext = {
        goal: body.goal,
        acceptedCategories: body.acceptedCategories,
        joints: body.joints,
        worldSummary: body.worldSummary,
        width: body.canvas.width,
        height: body.canvas.height,
      };
      const prompt = drawingAnalysisPrompt(context);

      const messages = [
        {
          role: "system" as const,
          content: [{ type: "text" as const, text: prompt }],
        },
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: "Analyze the newly drawn object." },
            { type: "text" as const, text: `IMAGE A — full scene\nwidth: ${body.canvas.width}\nheight: ${body.canvas.height}` },
            { type: "image_url" as const, image_url: { url: body.image } },
            ...(body.deltaCrop
              ? [
                  { type: "text" as const, text: `IMAGE B — newly added strokes only\ncrop in IMAGE A: x=${body.deltaCropInImageA?.x ?? 0}, y=${body.deltaCropInImageA?.y ?? 0}, width=${body.deltaCropInImageA?.width ?? body.canvas.width}, height=${body.deltaCropInImageA?.height ?? body.canvas.height}` },
                  { type: "image_url" as const, image_url: { url: body.deltaCrop } },
                ]
              : []),
          ],
        },
      ];

      const result = await withRetries(
        () => provider.complete({ messages, responseSchema: DRAWING_JSON_SCHEMA, responseName: "drawing_analysis" }),
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
              content: [{ type: "text" as const, text: drawingRepairPrompt(`could not parse JSON: ${error instanceof Error ? error.message : "parse error"}`) }],
            },
          ],
        });
        raw = extractJson(repair.text);
      }

      let analysis;
      try {
        analysis = sanitizeDrawingAnalysis(raw, body.canvas);
      } catch (error) {
        const repair = await provider.complete({
          messages: [
            ...messages,
            {
              role: "user" as const,
              content: [{ type: "text" as const, text: drawingRepairPrompt(error instanceof Error ? error.message : "validation failed") }],
            },
          ],
        });
        analysis = sanitizeDrawingAnalysis(extractJson(repair.text), body.canvas);
      }

      res.json({
        analysis,
        latencyMs: Date.now() - started,
        model: result.rawModel ?? provider.model,
      });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 422;
      console.error("[pencil-ai] drawing_analysis_failed", {
        status,
        message: error instanceof Error ? error.message : "unknown error",
      });
      res.status(status).json({
        error: "drawing_analysis_failed",
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  return router;
}
