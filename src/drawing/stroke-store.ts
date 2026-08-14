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
    const last = this.strokes[this.strokes.length - 1];
    if (!last) return undefined;
    last.active = false;
    this.onRemove.forEach((fn) => fn(last));
    return last;
  }
}
