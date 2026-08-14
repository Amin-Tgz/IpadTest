import { isRetryableProviderError } from "./provider.js";

export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffFactor: number;
}

export function isProviderError(error: unknown): boolean {
  return isRetryableProviderError(error);
}

export class RetryExhaustedError extends Error {
  constructor(readonly attempts: number, readonly lastError: unknown) {
    super(`operation failed after ${attempts} attempts`);
    this.name = "RetryExhaustedError";
  }
}

export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  shouldRetry: (error: unknown, attempt: number) => boolean,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === options.maxRetries || !shouldRetry(error, attempt)) throw error;
      const delay = options.delayMs * Math.pow(options.backoffFactor, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new RetryExhaustedError(options.maxRetries + 1, lastError);
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("no JSON object found in provider text");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
