import { describe, expect, it } from "vitest";
import { validateActionRequest } from "../../src/ai/action-protocol.js";

describe("AI action protocol", () => {
  it("accepts target-free expressive actions", () => {
    expect(validateActionRequest({ type: "scratch_head", targetObjectIndex: null, direction: null, durationMs: 900 }, [])).toMatchObject({ valid: true });
  });

  it("rejects object actions whose target does not exist", () => {
    expect(validateActionRequest({ type: "climb", targetObjectIndex: 2, direction: "up", durationMs: 900 }, ["stairs"])).toEqual({ valid: false, reason: "missing_target" });
  });

  it("resolves an existing object index to a stable id", () => {
    expect(validateActionRequest({ type: "use", targetObjectIndex: 0, direction: null, durationMs: 700 }, ["tool"])).toEqual({ valid: true, targetId: "tool" });
  });
});
