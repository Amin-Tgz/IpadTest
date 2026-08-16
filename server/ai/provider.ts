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

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

// The OpenAI SDK reports every DNS, TCP and TLS failure as the opaque string
// "Connection error.", with the real code buried on the cause chain. Those are
// exactly the failures a retry fixes, so both forms have to be recognized.
const RETRYABLE_PATTERN =
  /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|ECONNABORTED|EHOSTUNREACH|ENETUNREACH|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|socket hang up|network error|fetch failed|connection error|429|500|502|503|504/i;

export function isRetryableProviderError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") return RETRYABLE_STATUS.has(status);

  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (RETRYABLE_PATTERN.test(current.message) || (typeof code === "string" && RETRYABLE_PATTERN.test(code))) {
      return true;
    }
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}
