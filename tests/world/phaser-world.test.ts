import { describe, expect, it } from "vitest";
import {
  centeredRectToSupport,
  drawnSurface,
  ladderClimbRoute,
  ladderLanding,
  stairStepRects,
  surfaceClimbRoute,
  surfaceSupportRects,
} from "../../src/world/physics-geometry.js";

const BODY = { halfWidth: 20, halfHeight: 40 };

// Traced from a child's screenshot: four stairs rising right onto a tall
// plateau whose right wall slopes back to the ground, an arrow drawn inside the
// structure pointing up, and a stray tick far above it.
const STAIRS_OUTLINE = [
  { x: 370, y: 655 }, { x: 375, y: 625 }, { x: 435, y: 622 }, { x: 425, y: 535 },
  { x: 490, y: 535 }, { x: 478, y: 450 }, { x: 555, y: 450 }, { x: 545, y: 350 },
  { x: 612, y: 350 }, { x: 592, y: 185 }, { x: 818, y: 175 }, { x: 905, y: 685 },
];
const INNER_ARROW = [{ x: 530, y: 685 }, { x: 600, y: 560 }, { x: 690, y: 430 }, { x: 715, y: 340 }];
const STRAY_TICK = [{ x: 675, y: 30 }, { x: 676, y: 60 }];
const RECOGNIZED_BOX = { x: 365, y: 170, width: 545, height: 520 };

function bodyYFor(treadTop: number): number {
  return treadTop - BODY.halfHeight - 1;
}

describe("drawn physics geometry", () => {
  it("converts recognized stairs into ascending collision rectangles", () => {
    const steps = stairStepRects({ x: 100, y: 200, width: 160, height: 80 });
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0].height).toBeLessThan(steps.at(-1)!.height);
    expect(steps[0].x).toBeLessThan(steps.at(-1)!.x);
    expect(steps.every((step) => step.width > 0 && step.height > 0)).toBe(true);
  });

  it("reads the walkable skyline from the child's ink, ignoring inner and stray marks", () => {
    const surface = drawnSurface([STAIRS_OUTLINE, INNER_ARROW, STRAY_TICK], RECOGNIZED_BOX)!;
    expect(surface).not.toBeNull();
    expect(Math.min(...surface.points.map((point) => point.y))).toBeGreaterThanOrEqual(170);
    const at = (x: number) => surface.points.find((point) => Math.abs(point.x - x) <= 4)!.y;
    expect(at(400)).toBeCloseTo(624, -1);
    expect(at(520)).toBeCloseTo(450, -1);
    expect(at(700)).toBeLessThan(185);
    expect(surface.bottomY).toBeGreaterThanOrEqual(680);
  });

  it("merges the skyline into treads that match the drawn steps", () => {
    const rects = surfaceSupportRects(drawnSurface([STAIRS_OUTLINE, INNER_ARROW], RECOGNIZED_BOX)!);
    const treadTops = rects.filter((rect) => rect.right - rect.left >= 40).map((rect) => Math.round(rect.top));
    for (const expected of [622, 535, 450, 350, 175]) {
      expect(treadTops.some((top) => Math.abs(top - expected) <= 8)).toBe(true);
    }
    expect(rects.every((rect) => rect.bottom > rect.top)).toBe(true);
  });

  it("climbs tread by tread to the middle of the highest drawn level", () => {
    const rects = surfaceSupportRects(drawnSurface([STAIRS_OUTLINE, INNER_ARROW], RECOGNIZED_BOX)!);
    const route = surfaceClimbRoute(rects, BODY, 1);
    expect(route[0].y).toBeUndefined();
    expect(route[0].x).toBeLessThan(370 - BODY.halfWidth);
    const climbing = route.slice(1);
    for (let index = 1; index < climbing.length; index++) {
      expect(climbing[index].x).toBeGreaterThanOrEqual(climbing[index - 1].x);
      expect(climbing[index].y!).toBeLessThanOrEqual(climbing[index - 1].y! + 8);
    }
    for (const tread of [622, 535, 450, 350]) {
      expect(climbing.some((point) => Math.abs(point.y! - bodyYFor(tread)) <= 8)).toBe(true);
    }
    const end = climbing.at(-1)!;
    expect(end.x).toBeGreaterThan(600);
    expect(end.x).toBeLessThan(818);
    expect(end.y!).toBeCloseTo(bodyYFor(175), -1);
  });

  it("climbs a mirrored staircase from the right", () => {
    const mirrored = STAIRS_OUTLINE.map((point) => ({ x: 1200 - point.x, y: point.y }));
    const box = { ...RECOGNIZED_BOX, x: 1200 - RECOGNIZED_BOX.x - RECOGNIZED_BOX.width };
    const route = surfaceClimbRoute(surfaceSupportRects(drawnSurface([mirrored], box)!), BODY, -1);
    expect(route[0].x).toBeGreaterThan(1200 - 370 + BODY.halfWidth);
    expect(route.at(-1)!.x).toBeLessThan(1200 - 600);
    expect(route.at(-1)!.y!).toBeCloseTo(bodyYFor(175), -1);
  });

  it("walks up a smooth ramp without jumping over it", () => {
    const ramp = [{ x: 100, y: 400 }, { x: 300, y: 300 }, { x: 360, y: 300 }];
    const route = surfaceClimbRoute(surfaceSupportRects(drawnSurface([ramp])!), BODY, 1);
    const climbing = route.slice(1);
    expect(climbing.length).toBeGreaterThan(6);
    expect(climbing.some((point) => point.climb)).toBe(false);
    const largestRise = Math.max(...climbing.slice(1).map((point, index) => climbing[index].y! - point.y!));
    expect(largestRise).toBeLessThan(BODY.halfHeight / 2);
    expect(climbing.at(-1)!.y!).toBeCloseTo(bodyYFor(300), -1);
  });

  it("climbs a tall wall straight up before stepping onto it", () => {
    const block = [{ x: 300, y: 600 }, { x: 300, y: 450 }, { x: 420, y: 450 }, { x: 420, y: 600 }];
    const route = surfaceClimbRoute(surfaceSupportRects(drawnSurface([block])!), BODY, 1);
    expect(route[1]).toMatchObject({ x: route[0].x, climb: true });
    expect(route[1].y!).toBeCloseTo(bodyYFor(450), 0);
    expect(route.slice(2).every((point) => !point.climb)).toBe(true);
    expect(route.at(-1)!.x).toBeGreaterThan(300);
  });

  it("reaches the top of stairs that face away by climbing their tall side", () => {
    const facingAway = [
      { x: 300, y: 600 }, { x: 300, y: 400 }, { x: 380, y: 400 }, { x: 380, y: 470 },
      { x: 440, y: 470 }, { x: 440, y: 540 }, { x: 500, y: 540 }, { x: 500, y: 600 },
    ];
    const route = surfaceClimbRoute(surfaceSupportRects(drawnSurface([facingAway])!), BODY, 1);
    expect(route[1].climb).toBe(true);
    const end = route.at(-1)!;
    expect(end.y!).toBeCloseTo(bodyYFor(400), 0);
    expect(end.x).toBeGreaterThan(300);
    expect(end.x).toBeLessThan(384);
  });

  it("flattens a narrow pen tick instead of climbing onto it", () => {
    const tread = [{ x: 100, y: 300 }, { x: 200, y: 300 }, { x: 204, y: 250 }, { x: 208, y: 300 }, { x: 300, y: 300 }];
    const rects = surfaceSupportRects(drawnSurface([tread])!);
    expect(Math.min(...rects.map((rect) => rect.top))).toBeGreaterThan(290);
  });

  it("also climbs the synthetic steps used when no ink is available", () => {
    const rects = stairStepRects({ x: 100, y: 200, width: 160, height: 80 }).map(centeredRectToSupport);
    const right = surfaceClimbRoute(rects, { halfWidth: 10, halfHeight: 30 }, 1);
    const left = surfaceClimbRoute(rects, { halfWidth: 10, halfHeight: 30 }, -1);
    expect(right.at(-1)!.y).toBeCloseTo(200 - 31, 0);
    expect(right[1].x).toBeLessThan(right.at(-1)!.x);
    expect(left[1].x).toBeGreaterThan(left.at(-1)!.x);
  });
});

describe("drawn ladders", () => {
  const LADDER = { left: 300, right: 340, top: 350, bottom: 600 };
  const STAND_Y = 559;

  it("steps off a ladder onto the block it leans on", () => {
    const block = { left: 330, right: 520, top: 360, bottom: 600 };
    const farAway = { left: 0, right: 200, top: 360, bottom: 600 };
    const landing = ladderLanding(LADDER, [farAway, block], 1);
    expect(landing?.rect).toBe(block);
    const route = ladderClimbRoute(LADDER, BODY, STAND_Y, landing, 1);
    expect(route[0].y).toBeUndefined();
    expect(route[1]).toMatchObject({ x: 320, climb: true });
    expect(route[1].y!).toBeCloseTo(350 + 6 - 41, 0);
    expect(route.slice(2).every((point) => !point.climb)).toBe(true);
    expect(route.at(-1)!.x).toBeGreaterThan(340);
    expect(route.at(-1)!.y!).toBeCloseTo(360 - 41, 0);
  });

  it("climbs a free-standing ladder, looks around, and climbs back down", () => {
    const landing = ladderLanding(LADDER, [{ left: 600, right: 800, top: 360, bottom: 600 }, { left: 340, right: 500, top: 560, bottom: 600 }], 1);
    expect(landing).toBeNull();
    const route = ladderClimbRoute(LADDER, BODY, STAND_Y, landing, 1);
    expect(route[2].pauseMs).toBeGreaterThan(0);
    expect(route.at(-1)).toEqual({ x: 320, y: STAND_Y, climb: true });
  });
});
