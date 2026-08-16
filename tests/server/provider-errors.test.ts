import { describe, expect, it } from "vitest";
import { isRetryableProviderError } from "../../server/ai/provider.js";

function withCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

describe("isRetryableProviderError", () => {
  it("retries the OpenAI SDK connection failure", () => {
    // The SDK collapses DNS, TCP and TLS failures into this exact message; a
    // transient blip must not cost the child a whole story beat.
    expect(isRetryableProviderError(new Error("Connection error."))).toBe(true);
  });

  it("retries a connect timeout reported only on the cause chain", () => {
    const cause = Object.assign(new Error("fetch failed"), { code: "UND_ERR_CONNECT_TIMEOUT" });
    expect(isRetryableProviderError(withCause("Connection error.", cause))).toBe(true);
  });

  it("retries transient DNS failures", () => {
    expect(isRetryableProviderError(Object.assign(new Error("request failed"), { code: "EAI_AGAIN" }))).toBe(true);
    expect(isRetryableProviderError(new Error("getaddrinfo ENOTFOUND api.example.com"))).toBe(true);
  });

  it("retries socket resets, refusals and gateway errors", () => {
    for (const message of ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "Request timed out", "503 Service Unavailable"]) {
      expect(isRetryableProviderError(new Error(message)), message).toBe(true);
    }
  });

  it("retries an explicitly retryable status", () => {
    expect(isRetryableProviderError(Object.assign(new Error("rate limited"), { status: 429 }))).toBe(true);
    expect(isRetryableProviderError(Object.assign(new Error("bad gateway"), { status: 502 }))).toBe(true);
  });

  it("does not retry a request the provider rejected on its merits", () => {
    expect(isRetryableProviderError(Object.assign(new Error("invalid schema"), { status: 400 }))).toBe(false);
    expect(isRetryableProviderError(new Error("unsupported image mime"))).toBe(false);
    expect(isRetryableProviderError("not an error")).toBe(false);
  });
});
