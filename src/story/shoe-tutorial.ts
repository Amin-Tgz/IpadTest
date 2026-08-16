import type { DrawingObject, Vec2 } from "../ai/schemas.js";

export type ShoeSlot = "left_foot" | "right_foot";

export interface ShoeCandidate {
  slot: ShoeSlot;
  object: DrawingObject;
  /** Index of the analysis object this candidate came from. */
  sourceIndex: number;
  /** True when one detected pair was divided between the two feet. */
  split: boolean;
}

export class ShoeTutorialProgress {
  private readonly slots: Partial<Record<ShoeSlot, string>> = {};

  fill(slot: ShoeSlot, attachmentId: string): boolean {
    if (this.slots[slot]) return false;
    this.slots[slot] = attachmentId;
    return true;
  }

  has(slot: ShoeSlot): boolean {
    return Boolean(this.slots[slot]);
  }

  get complete(): boolean {
    return this.has("left_foot") && this.has("right_foot");
  }

  get missing(): ShoeSlot[] {
    return (["left_foot", "right_foot"] as const).filter((slot) => !this.has(slot));
  }

  snapshot(): Readonly<Partial<Record<ShoeSlot, string>>> {
    return { ...this.slots };
  }

  reset(): void {
    delete this.slots.left_foot;
    delete this.slots.right_foot;
  }
}

export function normalizeShoeCandidates(
  objects: DrawingObject[],
  feet: Record<ShoeSlot, Vec2>,
  occupied: Readonly<Partial<Record<ShoeSlot, string>>>,
): ShoeCandidate[] {
  const shoes = objects
    .map((object, sourceIndex) => ({ object, sourceIndex }))
    .filter((entry) => isShoe(entry.object));
  const unique = shoes.filter((entry, index, all) =>
    all.findIndex((candidate) => overlapRatio(candidate.object.boundingBox, entry.object.boundingBox) >= 0.58) === index,
  );
  const available = new Set<ShoeSlot>((["left_foot", "right_foot"] as const).filter((slot) => !occupied[slot]));
  const result: ShoeCandidate[] = [];

  for (const { object, sourceIndex } of unique) {
    if (available.size === 0) break;
    if (available.size === 2 && spansBothFeet(object, feet)) {
      const splitX = (feet.left_foot.x + feet.right_foot.x) / 2;
      for (const slot of ["left_foot", "right_foot"] as const) {
        const leftSide = feet[slot].x <= splitX;
        const minX = object.boundingBox.x;
        const maxX = minX + object.boundingBox.width;
        const x = leftSide ? minX : splitX;
        const width = leftSide ? splitX - minX : maxX - splitX;
        result.push({
          slot,
          sourceIndex,
          split: true,
          object: {
            ...object,
            boundingBox: { ...object.boundingBox, x, width: Math.max(8, width) },
            attachTo: slot,
            anchor: { ...feet[slot] },
          },
        });
        available.delete(slot);
      }
      continue;
    }

    const preferred = object.attachTo === "left_foot" || object.attachTo === "right_foot" ? object.attachTo : null;
    const slot = preferred && available.has(preferred)
      ? preferred
      : [...available].sort((a, b) => distanceToBox(feet[a], object) - distanceToBox(feet[b], object))[0];
    if (!slot) continue;
    result.push({ slot, sourceIndex, split: false, object: { ...object, attachTo: slot, anchor: { ...feet[slot] } } });
    available.delete(slot);
  }
  return result;
}

function isShoe(object: DrawingObject): boolean {
  return object.category === "wearable" && /shoe|boot|skate|slipper|کفش|چکمه|دمپایی/i.test(object.type);
}

function spansBothFeet(object: DrawingObject, feet: Record<ShoeSlot, Vec2>): boolean {
  const box = object.boundingBox;
  const padding = Math.max(8, box.width * 0.08);
  return [feet.left_foot, feet.right_foot].every((foot) =>
    foot.x >= box.x - padding && foot.x <= box.x + box.width + padding,
  );
}

function distanceToBox(point: Vec2, object: DrawingObject): number {
  const centerX = object.boundingBox.x + object.boundingBox.width / 2;
  const centerY = object.boundingBox.y + object.boundingBox.height / 2;
  return Math.hypot(point.x - centerX, point.y - centerY);
}

function overlapRatio(a: DrawingObject["boundingBox"], b: DrawingObject["boundingBox"]): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smaller = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return intersection / smaller;
}
