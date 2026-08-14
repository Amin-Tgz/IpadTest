import type { GroundPath } from "./ground-path.js";

export class Walker {
  distance = 0;
  speed = 96;

  constructor(
    private readonly path: GroundPath,
    private readonly stopDistance: number,
  ) {}

  start(): void {
    this.distance = 0;
  }

  get finished(): boolean {
    return this.distance >= this.stopDistance;
  }

  step(dtMs: number): void {
    if (this.finished) return;
    this.distance = Math.min(this.stopDistance, this.distance + (this.speed * dtMs) / 1000);
  }

  position(): { x: number; y: number; tangentAngle: number } {
    const { point, tangentAngle } = this.path.pointAtDistance(this.distance);
    return { x: point.x, y: point.y, tangentAngle };
  }
}

export function easeToward(current: number, target: number, dtMs: number, speed = 3.2): number {
  const t = Math.min(1, (dtMs / 1000) * speed);
  return current + (target - current) * t;
}
