export interface ProviderMessagePart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ProviderRequest {
  messages: Array<{ role: "system" | "user"; content: ProviderMessagePart[] }>;
  responseSchema?: Record<string, unknown>;
  responseName?: string;
}

export interface ProviderResult {
  text: string;
  rawModel?: string;
}

export interface AIProvider {
  readonly model: string;
  complete(request: ProviderRequest): Promise<ProviderResult>;
}

export type JsonMode = "json_schema" | "json_object" | "text";

export interface ProviderCapabilities {
  jsonModes: JsonMode[];
}

export function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message;
    if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|429|500|502|503|504/i.test(message)) {
      return true;
    }
  }
  return false;
}
