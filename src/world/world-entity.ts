import type { PhysicsShape } from "./phaser-world.js";
import type { MovableObjectTransform } from "./ladder-rescue.js";

export interface WorldEntity {
  id: string;
  type: string;
  sourceStrokeIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
  affordances: string[];
  physicsShape: PhysicsShape | null;
  transform?: MovableObjectTransform;
}

export class WorldEntityRegistry {
  private readonly entities = new Map<string, WorldEntity>();

  upsert(entity: WorldEntity): void {
    this.entities.set(entity.id, entity);
  }

  get(id: string): WorldEntity | null {
    return this.entities.get(id) ?? null;
  }

  setTransform(id: string, transform: MovableObjectTransform, bounds?: WorldEntity["bounds"]): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;
    entity.transform = { ...transform };
    if (bounds) entity.bounds = { ...bounds };
    return true;
  }

  setSourceStrokeIds(id: string, sourceStrokeIds: string[]): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;
    entity.sourceStrokeIds = [...new Set(sourceStrokeIds)];
    return true;
  }

  all(): WorldEntity[] {
    return [...this.entities.values()];
  }

  removeByStrokeIds(strokeIds: ReadonlySet<string>): string[] {
    const removed: string[] = [];
    for (const entity of this.entities.values()) {
      if (!entity.sourceStrokeIds.some((id) => strokeIds.has(id))) continue;
      this.entities.delete(entity.id);
      removed.push(entity.id);
    }
    return removed;
  }

  summary(): string {
    return this.all().slice(-12).map((entity) =>
      `${entity.id}:${entity.type}[${entity.affordances.join(",")}]`,
    ).join(" ");
  }
}
