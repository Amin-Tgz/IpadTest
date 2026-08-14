export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string;
  baseWidth: number;
  tool: "pen" | "eraser";
  createdAt: number;
  worldSpace: true;
  entityId: string | null;
  active: boolean;
  groupId: string | null;
}

let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export class StrokeStore {
  private strokes: Stroke[] = [];
  private onAdd: ((stroke: Stroke) => void)[] = [];
  private onRemove: ((stroke: Stroke) => void)[] = [];

  subscribeAdd(fn: (stroke: Stroke) => void): void {
    this.onAdd.push(fn);
  }

  subscribeRemove(fn: (stroke: Stroke) => void): void {
    this.onRemove.push(fn);
  }

  all(): Stroke[] {
    return this.strokes;
  }

  active(): Stroke[] {
    return this.strokes.filter((s) => s.active);
  }

  byId(id: string): Stroke | undefined {
    return this.strokes.find((s) => s.id === id);
  }

  count(): number {
    return this.strokes.length;
  }

  add(stroke: Stroke): void {
    this.strokes.push(stroke);
    this.onAdd.forEach((fn) => fn(stroke));
  }

  deactivate(id: string): void {
    const stroke = this.byId(id);
    if (stroke) stroke.active = false;
  }

  setInactiveFrom(index: number): void {
    for (let i = index; i < this.strokes.length; i++) {
      this.strokes[i].active = false;
    }
  }

  setEntityId(id: string, entityId: string | null): void {
    const stroke = this.byId(id);
    if (stroke) stroke.entityId = entityId;
  }

  undo(): Stroke | undefined {
    const last = [...this.strokes].reverse().find((stroke) => stroke.active);
    if (!last) return undefined;
    last.active = false;
    this.onRemove.forEach((fn) => fn(last));
    return last;
  }

  eraseNear(point: { x: number; y: number }, radius = 16): number {
    const radiusSquared = radius * radius;
    let affected = 0;
    for (const stroke of [...this.strokes]) {
      if (!stroke.active || stroke.entityId !== null) continue;
      const keep = stroke.points.map((sample) => {
        const dx = sample.x - point.x;
        const dy = sample.y - point.y;
        return dx * dx + dy * dy > radiusSquared;
      });
      if (keep.every(Boolean)) continue;
      const segments: StrokePoint[][] = [];
      let segment: StrokePoint[] = [];
      stroke.points.forEach((sample, index) => {
        if (keep[index]) segment.push(sample);
        else if (segment.length > 0) {
          segments.push(segment);
          segment = [];
        }
      });
      if (segment.length > 0) segments.push(segment);
      stroke.active = false;
      this.onRemove.forEach((fn) => fn(stroke));
      affected += 1;
      segments.filter((samples) => samples.length >= 2).forEach((samples) => {
        this.add({ ...stroke, id: nextId("stroke"), points: samples, active: true });
      });
    }
    return affected;
  }
}
