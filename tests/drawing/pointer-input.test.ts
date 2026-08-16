import { describe, expect, it } from "vitest";
import { pointerMoveSamples } from "../../src/drawing/pointer-input.js";

describe("pointerMoveSamples", () => {
  it("uses the coalesced samples a pen delivers between frames", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const event = { id: "move", getCoalescedEvents: () => [a, b] };
    expect(pointerMoveSamples(event)).toEqual([a, b]);
  });

  it("falls back to the event when the browser reports no coalesced samples", () => {
    // An empty list taken literally loses every point of the stroke.
    const event = { id: "move", getCoalescedEvents: () => [] };
    expect(pointerMoveSamples(event)).toEqual([event]);
  });

  it("falls back to the event when the API is unavailable", () => {
    const event = { id: "move", getCoalescedEvents: undefined };
    expect(pointerMoveSamples(event)).toEqual([event]);
  });

  it("survives a non-array answer", () => {
    const event = { id: "move", getCoalescedEvents: () => undefined as unknown as unknown[] };
    expect(pointerMoveSamples(event)).toEqual([event]);
  });
});
