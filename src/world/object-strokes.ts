export interface ObjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StrokeGeometry {
  id: string;
  points: Array<{ x: number; y: number }>;
}

export interface ObjectStrokeAssignment {
  perObject: string[][];
  unmatched: string[];
}

const CONTAINMENT_PADDING = 12;
const NEAR_TOLERANCE_RATIO = 0.75;
const NEAR_TOLERANCE_MAX = 240;

/**
 * Decides which of the child's new strokes each recognized object is made of.
 *
 * A provider bounding box is an approximation: it routinely lands tens of
 * pixels away from the ink it describes. Strict containment therefore cannot be
 * the only test, because an unmatched stroke is treated as instruction ink and
 * erased — silently destroying the child's drawing. Strokes near an object fall
 * back to a nearest-box match, and only ink far from every object stays
 * unmatched.
 */
export function resolveObjectStrokes(
  strokes: StrokeGeometry[],
  boxes: ObjectBox[],
  padding = CONTAINMENT_PADDING,
): ObjectStrokeAssignment {
  const perObject: string[][] = boxes.map(() => []);
  const unmatched: string[] = [];

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const index = bestBoxFor(stroke, boxes, padding);
    if (index === null) unmatched.push(stroke.id);
    else perObject[index].push(stroke.id);
  }

  return { perObject, unmatched };
}

function bestBoxFor(stroke: StrokeGeometry, boxes: ObjectBox[], padding: number): number | null {
  let containedIndex: number | null = null;
  let containedCount = 0;
  let nearestIndex: number | null = null;
  let nearestDistance = Infinity;

  boxes.forEach((box, index) => {
    const inside = stroke.points.filter((point) => withinBox(point, box, padding)).length;
    if (inside > containedCount) {
      containedCount = inside;
      containedIndex = index;
    }
    const distance = strokeDistanceToBox(stroke, box);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  if (containedIndex !== null) return containedIndex;
  if (nearestIndex === null) return null;
  return nearestDistance <= nearTolerance(boxes[nearestIndex]) ? nearestIndex : null;
}

function nearTolerance(box: ObjectBox): number {
  return Math.min(NEAR_TOLERANCE_MAX, Math.max(box.width, box.height) * NEAR_TOLERANCE_RATIO);
}

function withinBox(point: { x: number; y: number }, box: ObjectBox, padding: number): boolean {
  return (
    point.x >= box.x - padding &&
    point.x <= box.x + box.width + padding &&
    point.y >= box.y - padding &&
    point.y <= box.y + box.height + padding
  );
}

function strokeDistanceToBox(stroke: StrokeGeometry, box: ObjectBox): number {
  let best = Infinity;
  for (const point of stroke.points) {
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
    const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
    best = Math.min(best, Math.hypot(dx, dy));
    if (best === 0) return 0;
  }
  return best;
}
