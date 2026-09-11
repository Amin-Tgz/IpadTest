import { describe, expect, it } from "vitest";
import { hasEngine, vehicleLayout, VehicleRide, type RideSetup, type VehicleLayout } from "../../src/world/vehicle-ride.js";

const GROUND = 553;
const LEG = 72;

function circle(cx: number, cy: number, r: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 25 }, (_, i) => ({ x: cx + Math.cos((i / 24) * Math.PI * 2) * r, y: cy + Math.sin((i / 24) * Math.PI * 2) * r }));
}

// A side-view motorcycle facing right: two wheels, frame, seat, handlebar, and
// an exhaust pipe sticking out behind the rear wheel.
const MOTORCYCLE = [
  circle(500, 528, 24),
  circle(620, 528, 24),
  [{ x: 500, y: 528 }, { x: 540, y: 490 }, { x: 600, y: 490 }, { x: 620, y: 528 }],
  [{ x: 520, y: 482 }, { x: 575, y: 482 }],
  [{ x: 600, y: 490 }, { x: 612, y: 462 }, { x: 628, y: 458 }],
  [{ x: 505, y: 508 }, { x: 468, y: 512 }],
];

function ride(layout: VehicleLayout, overrides: Partial<RideSetup> = {}): { frames: ReturnType<VehicleRide["update"]>[]; ride: VehicleRide } {
  const vehicle = new VehicleRide({
    layout,
    pivot: { x: 560, y: GROUND },
    riderStart: { x: 540, y: GROUND - LEG },
    groundY: GROUND,
    legReach: LEG,
    distance: 600,
    blockedAhead: () => false,
    ...overrides,
  });
  const frames = [];
  for (let i = 0; i < 1000 && vehicle.phase !== "done"; i++) frames.push(vehicle.update(16.667));
  return { frames, ride: vehicle };
}

describe("vehicle layout", () => {
  it("seats the rider on the drawn seat line and puts the exhaust at the rear, low down", () => {
    const layout = vehicleLayout(MOTORCYCLE, "motorcycle", null, null)!;
    expect(layout.facing).toBe(1);
    expect(layout.seat.x).toBeGreaterThan(520);
    expect(layout.seat.x).toBeLessThan(575);
    expect(layout.seat.y).toBeCloseTo(482, 0);
    expect(layout.exhaust!.x).toBeLessThan(layout.seat.x - 40);
    expect(layout.exhaust!.y).toBeGreaterThan(layout.seat.y);
  });

  it("uses the provider's seat and exhaust when they land on the drawing", () => {
    const hints = { facing: "right" as const, seat: { x: 548, y: 470 }, exhaust: { x: 470, y: 512 } };
    const layout = vehicleLayout(MOTORCYCLE, "motorcycle", hints, null)!;
    expect(layout.seat.x).toBe(548);
    expect(layout.seat.y).toBeCloseTo(482, 0);
    expect(layout.exhaust).toEqual({ x: 470, y: 512 });
  });

  it("ignores hints far from the drawing and mirrors for a vehicle facing left", () => {
    const hints = { facing: "left" as const, seat: { x: 50, y: 40 }, exhaust: { x: 9000, y: 40 } };
    const layout = vehicleLayout(MOTORCYCLE, "motorcycle", hints, null)!;
    expect(layout.facing).toBe(-1);
    expect(layout.seat.x).toBeGreaterThan(560);
    expect(layout.exhaust!.x).toBeGreaterThan(600);
  });

  it("gives a bicycle or a skateboard no exhaust", () => {
    expect(vehicleLayout(MOTORCYCLE, "bicycle", null, null)!.exhaust).toBeNull();
    expect(vehicleLayout(MOTORCYCLE, "motorcycle", { facing: "right", seat: { x: 548, y: 482 }, exhaust: null }, null)!.exhaust).toBeNull();
    expect(hasEngine("موتور سیکلت")).toBe(true);
    expect(hasEngine("دوچرخه")).toBe(false);
  });
});

describe("vehicle ride", () => {
  const layout = vehicleLayout(MOTORCYCLE, "motorcycle", null, null)!;

  it("gets on, rides forward the requested distance, stops, and gets off onto the ground", () => {
    const { frames, ride: vehicle } = ride(layout);
    const phases = [...new Set(frames.map((frame) => frame.phase))];
    expect(phases).toEqual(["mount", "ride", "dismount", "done"]);
    expect(vehicle.traveled).toBeCloseTo(600, 0);
    const end = frames.at(-1)!;
    expect(end.stoppedBy).toBe("distance");
    expect(end.riderRoot.y).toBeCloseTo(GROUND - LEG, 5);
    expect(end.riderRoot.x).toBeGreaterThan(layout.seat.x + 590);
  });

  it("keeps the seated rider's feet above the ground and on the seat", () => {
    const riding = ride(layout).frames.filter((frame) => frame.phase === "ride");
    for (const frame of riding) {
      expect(frame.riderRoot.y).toBeLessThanOrEqual(GROUND - LEG * 0.68 + 0.001);
    }
    // During the wheelie the rider tilts with the seat; once level, the rider is right on it.
    for (const frame of riding.filter((frame) => frame.tilt === 0)) {
      expect(Math.abs(frame.riderRoot.x - (layout.seat.x + frame.offsetX))).toBeLessThan(0.5);
    }
  });

  it("carries the exhaust with the vehicle, behind the rider, with the throttle open", () => {
    const riding = ride(layout).frames.filter((frame) => frame.phase === "ride");
    const middle = riding[Math.floor(riding.length / 2)];
    expect(middle.exhaust!.x).toBeLessThan(middle.riderRoot.x);
    expect(middle.throttle).toBeGreaterThan(0.5);
    expect(middle.exhaust!.x - layout.exhaust!.x).toBeCloseTo(middle.offsetX, 0);
  });

  it("pops a small wheelie as it sets off", () => {
    const riding = ride(layout).frames.filter((frame) => frame.phase === "ride");
    expect(Math.min(...riding.slice(0, 40).map((frame) => frame.tilt))).toBeLessThan(-4);
    expect(riding.at(-1)!.tilt).toBe(0);
  });

  it("stops before a gap or a wall instead of riding into it", () => {
    const { frames, ride: vehicle } = ride(layout, { blockedAhead: (frontX) => frontX > 900 });
    expect(frames.at(-1)!.stoppedBy).toBe("blocked");
    expect(vehicle.traveled).toBeLessThan(300);
    expect(layout.bounds.right + vehicle.traveled).toBeLessThanOrEqual(900);
  });

  it("rides left when the vehicle faces left", () => {
    const left = vehicleLayout(MOTORCYCLE, "motorcycle", { facing: "left", seat: { x: 590, y: 482 }, exhaust: { x: 650, y: 512 } }, null)!;
    const { frames } = ride(left);
    expect(frames.at(-1)!.offsetX).toBeLessThan(-590);
  });
});
