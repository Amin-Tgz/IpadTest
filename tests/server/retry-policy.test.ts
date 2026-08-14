import { describe, expect, it, vi } from "vitest";
import { withRetries, extractJson } from "../../server/ai/retry-policy.js";

describe("withRetries", () => {
  it("succeeds on first attempt", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetries(fn, () => true, { maxRetries: 3, delayMs: 1, backoffFactor: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("boom");
      return "ok";
    });
    const result = await withRetries(fn, () => true, { maxRetries: 5, delayMs: 1, backoffFactor: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("runs once when maxRetries is 0", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetries(fn, () => true, { maxRetries: 0, delayMs: 1, backoffFactor: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-retryable errors immediately", async () => {
    const error = new Error("schema mismatch");
    await expect(
      withRetries(() => Promise.reject(error), () => false, { maxRetries: 3, delayMs: 1, backoffFactor: 1 }),
    ).rejects.toBe(error);
  });

  it("exhausts retries and rethrows the last error", async () => {
    await expect(
      withRetries(() => Promise.reject(new Error("boom")), () => true, { maxRetries: 2, delayMs: 1, backoffFactor: 1 }),
    ).rejects.toThrow("boom");
  });
});

describe("extractJson", () => {
  it("parses raw JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("extracts JSON from prose", () => {
    expect(extractJson('Here you go: {"a":[1,2]} thanks!')).toEqual({ a: [1, 2] });
  });

  it("throws when no JSON present", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
