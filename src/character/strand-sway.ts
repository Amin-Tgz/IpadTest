const STIFFNESS = 70;
const DAMPING = 7;
const LAG_SPEED_PX_PER_RADIAN = 700;
const MAX_LAG_RADIANS = 0.6;
const MAX_SPEED = 1500;
const MAX_STEP_SECONDS = 0.2;

/**
 * Secondary motion for a loose strand such as a ponytail: it trails behind the
 * movement of its root and springs back once the hero stops. Points are world
 * coordinates and the first point is the fixed root.
 */
export class StrandSway {
  private angle = 0;
  private velocity = 0;
  private lastRoot: { x: number; y: number } | null = null;
  private lastTime: number | null = null;

  apply(points: Array<{ x: number; y: number }>, timeMs: number): Array<{ x: number; y: number }> {
    if (points.length < 2) return points;
    const root = points[0];
    let reach = 0;
    let tip = root;
    for (const point of points) {
      const distance = Math.hypot(point.x - root.x, point.y - root.y);
      if (distance > reach) {
        reach = distance;
        tip = point;
      }
    }
    if (reach < 1) return points;
    if (this.lastTime === null || timeMs > this.lastTime) {
      const dt = this.lastTime === null ? 0 : (timeMs - this.lastTime) / 1000;
      if (this.lastRoot && dt > 0 && dt <= MAX_STEP_SECONDS) this.step(root, tip, reach, this.lastRoot, dt);
      this.lastRoot = { x: root.x, y: root.y };
      this.lastTime = timeMs;
    }
    if (Math.abs(this.angle) < 1e-4) return points;
    return points.map((point) => {
      const dx = point.x - root.x;
      const dy = point.y - root.y;
      const bend = this.angle * Math.min(1, Math.hypot(dx, dy) / reach);
      const cos = Math.cos(bend);
      const sin = Math.sin(bend);
      return { x: root.x + dx * cos - dy * sin, y: root.y + dx * sin + dy * cos };
    });
  }

  private step(
    root: { x: number; y: number },
    tip: { x: number; y: number },
    reach: number,
    lastRoot: { x: number; y: number },
    dt: number,
  ): void {
    const vx = clamp((root.x - lastRoot.x) / dt, MAX_SPEED);
    const vy = clamp((root.y - lastRoot.y) / dt, MAX_SPEED);
    // Air drag pushes the strand opposite to the root's velocity; its torque
    // about the root sets how far the strand trails.
    const lag = ((tip.y - root.y) * vx - (tip.x - root.x) * vy) / reach / LAG_SPEED_PX_PER_RADIAN;
    const target = clamp(lag, MAX_LAG_RADIANS);
    this.velocity += (STIFFNESS * (target - this.angle) - DAMPING * this.velocity) * dt;
    this.angle += this.velocity * dt;
  }
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
