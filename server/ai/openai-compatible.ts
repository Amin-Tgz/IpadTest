import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ResponseFormatJSONObject, ResponseFormatJSONSchema } from "openai/resources/shared";
import type { ServerConfig } from "../config.js";
import type { AIProvider, ProviderRequest, ProviderResult, JsonMode } from "./provider.js";

interface OpenAiLikeError extends Error {
  status?: number;
  code?: string;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly model: string;
  readonly jsonModes: JsonMode[];
  private client: OpenAI;
  private readonly thinkingLevel: "low" | "medium" | "high" | null;

  constructor(config: ServerConfig) {
    this.model = config.AI_MODEL;
    this.jsonModes = config.AI_JSON_MODE === "json_schema"
      ? ["json_schema", "json_object", "text"]
      : config.AI_JSON_MODE === "json_object"
        ? ["json_object", "text"]
        : ["text"];
    this.client = new OpenAI({
      baseURL: config.AI_BASE_URL,
      apiKey: config.AI_API_KEY,
      timeout: config.AI_TIMEOUT_MS,
      maxRetries: 0,
    });
    this.thinkingLevel = /^(gpt-5|o[1-9])/i.test(config.AI_MODEL) ? config.AI_THINKING_LEVEL : null;
  }

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    let lastError: unknown = null;
    for (const mode of this.jsonModes) {
      const startedAt = Date.now();
      console.info("[line-pal] provider_request_started", {
        model: this.model,
        mode,
        timeoutMs: this.client.timeout,
        imageCount: request.messages.reduce((count, message) => count + message.content.filter((part) => part.type === "image_url").length, 0),
      });
      try {
        const responseFormat = this.buildResponseFormat(mode, request);
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content.map((p) =>
              p.type === "text"
                ? { type: "text" as const, text: p.text ?? "" }
                : { type: "image_url" as const, image_url: p.image_url ?? { url: "" } },
            ),
          })) as ChatCompletionMessageParam[],
          response_format: responseFormat,
          ...(mode === "json_schema" ? { temperature: 0.2 } : {}),
          ...(this.thinkingLevel ? { reasoning_effort: this.thinkingLevel } : {}),
        });
        const text = completion.choices[0]?.message?.content ?? "";
        if (!text.trim()) {
          throw new Error("empty completion from provider");
        }
        console.info("[line-pal] provider_request_succeeded", {
          model: completion.model,
          mode,
          elapsedMs: Date.now() - startedAt,
        });
        return { text, rawModel: completion.model };
      } catch (error) {
        lastError = error;
        const status = (error as OpenAiLikeError).status;
        console.error("[line-pal] provider_request_failed", {
          model: this.model,
          mode,
          elapsedMs: Date.now() - startedAt,
          status: status ?? null,
          message: describeError(error),
        });
        if (status === 400 || status === 422 || status === 404) {
          continue;
        }
        throw error;
      }
    }
    throw new Error(`provider failed in all json modes: ${describeError(lastError)}`);
  }

  private buildResponseFormat(
    mode: JsonMode,
    request: ProviderRequest,
  ): ResponseFormatJSONObject | ResponseFormatJSONSchema | undefined {
    if (mode === "json_object") {
      return { type: "json_object" };
    }
    if (mode === "json_schema" && request.responseSchema) {
      return {
        type: "json_schema",
        json_schema: {
          name: request.responseName ?? "analysis",
          strict: true,
          schema: request.responseSchema,
        },
      };
    }
    return undefined;
  }
}
