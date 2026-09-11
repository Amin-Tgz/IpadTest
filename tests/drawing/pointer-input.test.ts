import { describe, expect, it } from "vitest";
import { PointerInput, pointerMoveSamples } from "../../src/drawing/pointer-input.js";

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

describe("PointerInput two-finger tap gesture", () => {
  it("detects a clean two-finger tap without drawing", () => {
    const events: Record<string, Function> = {};
    const canvasMock = {
      style: {},
      addEventListener: (type: string, fn: Function) => { events[type] = fn; },
      removeEventListener: () => void 0,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      hasPointerCapture: () => false,
      setPointerCapture: () => void 0,
      releasePointerCapture: () => void 0,
    } as unknown as HTMLCanvasElement;

    const storeMock = {
      add: () => void 0,
      eraseNearWithIds: () => ({ count: 0, strokeIds: [] }),
    } as unknown as any;

    const cameraMock = {
      screenToWorld: (p: { x: number; y: number }) => p,
    } as unknown as any;

    let twoFingerTapped = false;
    new PointerInput(
      canvasMock,
      storeMock,
      cameraMock,
      { onTwoFingerTap: () => { twoFingerTapped = true; } },
    );

    // Finger 1 down
    events["pointerdown"]({
      pointerType: "touch",
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      preventDefault: () => void 0,
    });
    // Finger 2 down
    events["pointerdown"]({
      pointerType: "touch",
      pointerId: 2,
      clientX: 150,
      clientY: 110,
      preventDefault: () => void 0,
    });

    // Finger 1 up
    events["pointerup"]({
      pointerType: "touch",
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      preventDefault: () => void 0,
    });

    expect(twoFingerTapped).toBe(true);
  });
});
