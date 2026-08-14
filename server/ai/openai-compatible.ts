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

  constructor(config: ServerConfig) {
    this.model = config.AI_MODEL;
    this.jsonModes = config.AI_JSON_MODE === "text" ? ["text"] : ["json_schema", "json_object", "text"];
    this.client = new OpenAI({
      baseURL: config.AI_BASE_URL,
      apiKey: config.AI_API_KEY,
      timeout: config.AI_TIMEOUT_MS,
      maxRetries: 0,
    });
  }

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    let lastError: unknown = null;
    for (const mode of this.jsonModes) {
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
        });
        const text = completion.choices[0]?.message?.content ?? "";
        if (!text.trim()) {
          throw new Error("empty completion from provider");
        }
        return { text, rawModel: completion.model };
      } catch (error) {
        lastError = error;
        const status = (error as OpenAiLikeError).status;
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
