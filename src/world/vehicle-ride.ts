import { drawnSurface } from "./physics-geometry.js";

export interface RidePoint {
  x: number;
  y: number;
}

/** What the provider saw in the drawing, in world coordinates. */
export interface VehicleHints {
  facing: "left" | "right";
  seat: RidePoint;
  exhaust: RidePoint | null;
}

export interface VehicleLayout {
  facing: -1 | 1;
  seat: RidePoint;
  exhaust: RidePoint | null;
  bounds: { left: number; right: number; top: number; bottom: number };
}

export type RidePhase = "mount" | "ride" | "dismount" | "done";
export type RideStop = "distance" | "blocked";

export interface RideSetup {
  layout: VehicleLayout;
  /** The vehicle's transform origin in world coordinates when the ride begins. */
  pivot: RidePoint;
  riderStart: RidePoint;
  groundY: number;
  /** Rest distance from the hero's hips to its feet. */
  legReach: number;
  distance: number;
  blockedAhead(frontX: number): boolean;
}

export interface RideFrame {
  phase: RidePhase;
  offsetX: number;
  tilt: number;
  bounce: number;
  riderRoot: RidePoint;
  exhaust: RidePoint | null;
  throttle: number;
  stoppedBy: RideStop | null;
}

const ENGINE_VEHICLE = /motor|scooter|vespa|\bcar\b|truck|\bbus\b|jeep|tractor|train|موتور|ماشین|اسکوتر|کامیون|اتوبوس|جیپ|تراکتور|قطار/i;
const MOUNT_MS = 450;
const DISMOUNT_MS = 420;
const CRUISE_PX_PER_S = 320;
const ACCEL_PX_PER_S2 = 520;
const BRAKE_PX_PER_S2 = 640;
const WHEELIE_MS = 650;
const SITTING_LEG_FRACTION = 0.68;

export function hasEngine(type: string): boolean {
  return ENGINE_VEHICLE.test(type);
}

/**
 * Where the child's vehicle is sat on and where it breathes smoke. Provider
 * hints are used when they land on the drawing; otherwise the seat is the top
 * line a little behind the middle and the exhaust is at the rear, low down.
 * The seat height always comes from the ink, so the rider sits on the line
 * the child drew rather than on a guessed point.
 */
export function vehicleLayout(
  strokes: ReadonlyArray<ReadonlyArray<RidePoint>>,
  type: string,
  hints: VehicleHints | null,
  preferredFacing: -1 | 1 | null,
): VehicleLayout | null {
  const points = strokes.flat();
  if (points.length < 2) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const facing: -1 | 1 = hints ? (hints.facing === "left" ? -1 : 1) : preferredFacing ?? 1;
  const onDrawing = (point: RidePoint): boolean =>
    point.x >= bounds.left - 24 && point.x <= bounds.right + 24 && point.y >= bounds.top - 24 && point.y <= bounds.bottom + 24;
  const surface = drawnSurface(strokes);
  const topAt = (x: number): number => surface
    ? surface.points.reduce((best, point) => (Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best)).y
    : bounds.top;
  const seatX = hints && onDrawing(hints.seat)
    ? Math.max(bounds.left, Math.min(bounds.right, hints.seat.x))
    : (bounds.left + bounds.right) / 2 - facing * width * 0.12;
  const engine = hints ? hints.exhaust !== null : hasEngine(type);
  const exhaust = !engine
    ? null
    : hints?.exhaust && onDrawing(hints.exhaust)
      ? { ...hints.exhaust }
      : { x: facing > 0 ? bounds.left + width * 0.04 : bounds.right - width * 0.04, y: bounds.bottom - height * 0.3 };
  return { facing, seat: { x: seatX, y: topAt(seatX) }, exhaust, bounds };
}

function rotateAround(origin: RidePoint, point: RidePoint, degrees: number): RidePoint {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

function smooth(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Mount, ride forward, stop, and get off. Time-driven and free of rendering
 * so the whole trip can be checked without a browser.
 */
export class VehicleRide {
  phase: RidePhase = "mount";
  private phaseMs = 0;
  private rideMs = 0;
  private offsetX = 0;
  private speed = 0;
  private stoppedBy: RideStop | null = null;

  constructor(private readonly setup: RideSetup) {}

  get traveled(): number {
    return Math.abs(this.offsetX);
  }

  update(dtMs: number): RideFrame {
    const dt = Math.max(0, Math.min(64, dtMs));
    this.phaseMs += dt;
    if (this.phase === "mount" && this.phaseMs >= MOUNT_MS) this.enter("ride");
    if (this.phase === "ride") this.advance(dt);
    if (this.phase === "dismount" && this.phaseMs >= DISMOUNT_MS) this.enter("done");
    return this.frame();
  }

  private enter(phase: RidePhase): void {
    this.phase = phase;
    this.phaseMs = 0;
  }

  private advance(dt: number): void {
    this.rideMs += dt;
    const { layout, distance } = this.setup;
    const remaining = Math.max(0, distance - this.traveled);
    const brakeLimit = Math.sqrt(2 * BRAKE_PX_PER_S2 * remaining);
    const speed = Math.min(CRUISE_PX_PER_S, this.speed + (ACCEL_PX_PER_S2 * dt) / 1000, brakeLimit);
    const step = Math.min(remaining, (speed * dt) / 1000);
    const front = (layout.facing > 0 ? layout.bounds.right : layout.bounds.left) + this.offsetX;
    if (this.setup.blockedAhead(front + layout.facing * (step + 18))) {
      this.stop("blocked");
      return;
    }
    this.speed = speed;
    this.offsetX += layout.facing * step;
    if (remaining - step <= 0.5 || (speed < 4 && this.rideMs > 300)) this.stop("distance");
  }

  private stop(reason: RideStop): void {
    this.stoppedBy = reason;
    this.speed = 0;
    this.enter("dismount");
  }

  private frame(): RideFrame {
    const { layout, pivot, groundY, legReach, riderStart } = this.setup;
    const riding = this.phase === "ride";
    const tilt = riding && this.rideMs < WHEELIE_MS ? -layout.facing * 7 * Math.sin((Math.PI * this.rideMs) / WHEELIE_MS) : 0;
    const bounce = riding ? Math.sin(this.rideMs / 42) * 1.4 * (this.speed / CRUISE_PX_PER_S) : 0;
    const origin = { x: pivot.x + this.offsetX, y: pivot.y + bounce };
    const place = (point: RidePoint): RidePoint => rotateAround(origin, { x: point.x + this.offsetX, y: point.y + bounce }, tilt);
    const seat = place(layout.seat);
    const sitRoot = { x: seat.x, y: Math.min(seat.y - 2, groundY - legReach * SITTING_LEG_FRACTION) };
    let riderRoot = sitRoot;
    if (this.phase === "mount") {
      const t = smooth(this.phaseMs / MOUNT_MS);
      riderRoot = {
        x: riderStart.x + (sitRoot.x - riderStart.x) * t,
        y: riderStart.y + (sitRoot.y - riderStart.y) * t - Math.sin(Math.PI * t) * 26,
      };
    } else if (this.phase === "dismount" || this.phase === "done") {
      const standRoot = { x: sitRoot.x + layout.facing * 14, y: groundY - legReach };
      const t = this.phase === "done" ? 1 : smooth(this.phaseMs / DISMOUNT_MS);
      riderRoot = {
        x: sitRoot.x + (standRoot.x - sitRoot.x) * t,
        y: sitRoot.y + (standRoot.y - sitRoot.y) * t - Math.sin(Math.PI * t) * 14,
      };
    }
    return {
      phase: this.phase,
      offsetX: this.offsetX,
      tilt,
      bounce,
      riderRoot,
      exhaust: layout.exhaust ? place(layout.exhaust) : null,
      throttle: riding ? Math.max(0.25, this.speed / CRUISE_PX_PER_S) : this.phase === "mount" ? 0.2 : 0,
      stoppedBy: this.stoppedBy,
    };
  }
}
