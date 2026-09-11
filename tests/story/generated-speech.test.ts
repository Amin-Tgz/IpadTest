import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isRetryableSpeechStatus } from "../../src/story/generated-speech.js";

describe("generated speech policy", () => {
  it.each([408, 429, 500, 502, 503])("retries transient HTTP %s", (status) => {
    expect(isRetryableSpeechStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])("does not retry permanent HTTP %s", (status) => {
    expect(isRetryableSpeechStatus(status)).toBe(false);
  });

  it("ships every tutorial manifest entry as WAV-encoded local audio", async () => {
    const root = path.resolve(process.cwd(), "public/audio/hero");
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as Record<string, { path: string }>;
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(7);
    for (const entry of Object.values(manifest)) {
      expect(entry.path).toMatch(/^\/audio\/hero\/.+\.pwa$/);
      const bytes = await readFile(path.join(process.cwd(), "public", entry.path.replace(/^\/audio\//, "audio/")));
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    }
  });
});
