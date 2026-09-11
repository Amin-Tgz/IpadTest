import type { Stroke } from "../drawing/stroke-store.js";

export type RescuePhase = "NONE" | "FALLEN_WAITING_RESCUE" | "RESCUING" | "RECOVERED";

export class RescueStateController {
  phase: RescuePhase = "NONE";

  markFallen(): boolean {
    if (this.phase === "FALLEN_WAITING_RESCUE" || this.phase === "RESCUING") return false;
    this.phase = "FALLEN_WAITING_RESCUE";
    return true;
  }

  begin(): boolean {
    if (this.phase !== "FALLEN_WAITING_RESCUE") return false;
    this.phase = "RESCUING";
    return true;
  }

  complete(): boolean {
    if (this.phase !== "RESCUING") return false;
    this.phase = "RECOVERED";
    return true;
  }
}

export interface MovableObjectTransform {
  originX: number;
  originY: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export interface LadderRescuePlan {
  edge: "left" | "right";
  edgeX: number;
  landing: { x: number; y: number };
  bottom: { x: number; y: number };
  top: { x: number; y: number };
  waypoints: Array<{ x: number; y: number }>;
  targetTransform: MovableObjectTransform;
}

export class MovableWorldObject {
  readonly rawStrokes: ReadonlyArray<ReadonlyArray<Readonly<{ x: number; y: number; pressure: number; time: number }>>>;
  readonly identity: MovableObjectTransform;
  transform: MovableObjectTransform;

  constructor(readonly id: string, strokes: Stroke[], origin?: { x: number; y: number }) {
    this.rawStrokes = strokes.map((stroke) => stroke.points.map((point) => Object.freeze({ ...point })));
    const points = this.rawStrokes.flat();
    const minX = Math.min(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const fallback = { x: (minX + maxX) / 2, y: maxY };
    const anchor = origin ?? fallback;
    this.identity = { originX: anchor.x, originY: anchor.y, x: anchor.x, y: anchor.y, rotation: 0, scale: 1 };
    this.transform = { ...this.identity };
  }

  setTransform(transform: MovableObjectTransform): void {
    this.transform = { ...transform };
  }

  setPlacementProgress(target: MovableObjectTransform, progress: number): void {
    const t = smooth(Math.max(0, Math.min(1, progress)));
    this.transform = {
      originX: this.identity.originX,
      originY: this.identity.originY,
      x: mix(this.identity.x, target.x, t),
      y: mix(this.identity.y, target.y, t),
      rotation: mix(this.identity.rotation, target.rotation, t),
      scale: mix(this.identity.scale, target.scale, t),
    };
  }

  transformedStrokes(): Array<Array<{ x: number; y: number }>> {
    return this.rawStrokes.map((stroke) => stroke.map((point) => this.transformPoint(point)));
  }

  /** Maps a point given in the drawing's original coordinates to where it is now. */
  transformPoint(point: { x: number; y: number }): { x: number; y: number } {
    const radians = this.transform.rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const localX = (point.x - this.transform.originX) * this.transform.scale;
    const localY = (point.y - this.transform.originY) * this.transform.scale;
    return {
      x: this.transform.x + localX * cos - localY * sin,
      y: this.transform.y + localX * sin + localY * cos,
    };
  }
}

export function createLadderRescuePlan(input: {
  hero: { x: number; y: number };
  baselineY: number;
  leftEdge: number | null;
  rightEdge: number | null;
  ladder: MovableWorldObject;
}): LadderRescuePlan {
  const choices = [
    input.leftEdge === null ? null : { edge: "left" as const, x: input.leftEdge, distance: Math.abs(input.hero.x - input.leftEdge) },
    input.rightEdge === null ? null : { edge: "right" as const, x: input.rightEdge, distance: Math.abs(input.hero.x - input.rightEdge) },
  ].filter((choice): choice is NonNullable<typeof choice> => choice !== null);
  const selected = choices.sort((a, b) => a.distance - b.distance || (a.edge === "left" ? -1 : 1))[0];
  if (!selected) throw new Error("no intact ground edge for ladder rescue");
  const landingX = selected.x + (selected.edge === "left" ? -34 : 34);
  const top = { x: selected.x + (selected.edge === "left" ? -5 : 5), y: input.baselineY - 5 };
  const bottom = { x: input.hero.x, y: Math.max(input.hero.y + 58, input.baselineY + 125) };
  const distance = Math.max(80, Math.hypot(top.x - bottom.x, top.y - bottom.y));
  const rawHeight = Math.max(24, input.ladder.identity.originY - Math.min(...input.ladder.rawStrokes.flat().map((point) => point.y)));
  const rotation = Math.atan2(top.y - bottom.y, top.x - bottom.x) * 180 / Math.PI + 90;
  const steps = Math.max(4, Math.ceil(distance / 34));
  const waypoints = Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return { x: mix(input.hero.x, top.x, t), y: mix(input.hero.y, top.y - 18, t) };
  });
  const landing = { x: landingX, y: input.baselineY - 72 };
  waypoints.push(landing);
  return {
    edge: selected.edge,
    edgeX: selected.x,
    landing,
    bottom,
    top,
    waypoints,
    targetTransform: {
      originX: input.ladder.identity.originX,
      originY: input.ladder.identity.originY,
      x: bottom.x,
      y: bottom.y,
      rotation,
      scale: distance / rawHeight,
    },
  };
}

export function rescueWaypointAt(plan: LadderRescuePlan, progress: number): { x: number; y: number; index: number } {
  const scaled = Math.max(0, Math.min(1, progress)) * (plan.waypoints.length - 1);
  const index = Math.min(plan.waypoints.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return {
    x: mix(plan.waypoints[index].x, plan.waypoints[index + 1].x, t),
    y: mix(plan.waypoints[index].y, plan.waypoints[index + 1].y, t),
    index,
  };
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
