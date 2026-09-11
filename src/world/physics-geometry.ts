export interface RectSpec {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SupportRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SurfacePoint {
  x: number;
  y: number;
}

export interface DrawnSurface {
  points: SurfacePoint[];
  bottomY: number;
  columnWidth: number;
}

export interface RouteWaypoint {
  x: number;
  y?: number;
  climb?: boolean;
  pauseMs?: number;
}

const SURFACE_COLUMN_WIDTH = 8;
const SURFACE_TOLERANCE = 6;
const SPIKE_MAX_WIDTH = 24;
const SPIKE_MIN_RISE = 16;
const TALL_RISE_HALF_HEIGHTS = 1.5;

export function stairStepRects(spec: RectSpec): RectSpec[] {
  const count = Math.max(2, Math.min(8, Math.round(spec.width / Math.max(24, spec.height / 3))));
  const stepWidth = spec.width / count;
  return Array.from({ length: count }, (_, index) => {
    const height = (spec.height * (index + 1)) / count;
    return {
      x: spec.x + stepWidth * (index + 0.5),
      y: spec.y + spec.height - height / 2,
      width: stepWidth + 1,
      height,
    };
  });
}

export function centeredRectToSupport(rect: RectSpec): SupportRect {
  return {
    left: rect.x - rect.width / 2,
    right: rect.x + rect.width / 2,
    top: rect.y - rect.height / 2,
    bottom: rect.y + rect.height / 2,
  };
}

/**
 * The walkable skyline of what the child actually drew: for every narrow
 * column, the top-most ink. Interior ink (an arrow drawn inside a tower, the
 * inner lines of a staircase) never becomes a surface, and ink far outside the
 * recognized box (a stray mark above it) is ignored.
 */
export function drawnSurface(
  strokes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  clip?: RectSpec,
  columnWidth = SURFACE_COLUMN_WIDTH,
): DrawnSurface | null {
  const pad = clip ? Math.max(16, Math.max(clip.width, clip.height) * 0.15) : 0;
  const inside = (point: { x: number; y: number }): boolean => !clip || (
    point.x >= clip.x - pad && point.x <= clip.x + clip.width + pad &&
    point.y >= clip.y - pad && point.y <= clip.y + clip.height + pad
  );
  const tops = new Map<number, number>();
  const mark = (column: number, y: number): void => {
    const current = tops.get(column);
    if (current === undefined || y < current) tops.set(column, y);
  };
  let bottomY = -Infinity;
  for (const stroke of strokes) {
    stroke.forEach((point, index) => {
      if (!inside(point)) return;
      bottomY = Math.max(bottomY, point.y);
      mark(Math.floor(point.x / columnWidth), point.y);
      const next = stroke[index + 1];
      if (!next || !inside(next)) return;
      const minX = Math.min(point.x, next.x);
      const maxX = Math.max(point.x, next.x);
      const yAt = (x: number): number => next.x === point.x
        ? Math.min(point.y, next.y)
        : point.y + ((next.y - point.y) * (x - point.x)) / (next.x - point.x);
      for (let column = Math.floor(minX / columnWidth); column <= Math.floor(maxX / columnWidth); column++) {
        const x0 = Math.max(minX, column * columnWidth);
        const x1 = Math.min(maxX, (column + 1) * columnWidth);
        mark(column, Math.min(yAt(x0), yAt(x1)));
      }
    });
  }
  if (tops.size < 2) return null;
  const columns = [...tops.keys()].sort((a, b) => a - b);
  const points: SurfacePoint[] = [];
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index];
    points.push({ x: (column + 0.5) * columnWidth, y: tops.get(column)! });
    const nextColumn = columns[index + 1];
    if (nextColumn === undefined) continue;
    const fromY = tops.get(column)!;
    const toY = tops.get(nextColumn)!;
    for (let gap = column + 1; gap < nextColumn; gap++) {
      const t = (gap - column) / (nextColumn - column);
      points.push({ x: (gap + 0.5) * columnWidth, y: fromY + (toY - fromY) * t });
    }
  }
  return { points, bottomY, columnWidth };
}

function mergeByTop(rects: SupportRect[], tolerance: number): SupportRect[] {
  const merged: Array<SupportRect & { low: number }> = [];
  for (const rect of rects) {
    const last = merged.at(-1);
    if (last && Math.max(last.low, rect.top) - Math.min(last.top, rect.top) <= tolerance) {
      last.right = rect.right;
      last.top = Math.min(last.top, rect.top);
      last.low = Math.max(last.low, rect.top);
      last.bottom = Math.max(last.bottom, rect.bottom);
    } else {
      merged.push({ ...rect, low: rect.top });
    }
  }
  return merged.map(({ low: _low, ...rect }) => rect);
}

/** Solid columns under the drawn skyline, merged into treads the hero can stand on. */
export function surfaceSupportRects(surface: DrawnSurface, tolerance = SURFACE_TOLERANCE): SupportRect[] {
  const half = surface.columnWidth / 2;
  const columns = surface.points.map((point) => ({
    left: point.x - half,
    right: point.x + half,
    top: point.y,
    bottom: Math.max(surface.bottomY, point.y + 4),
  }));
  const rects = mergeByTop(columns, tolerance);
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index];
    if (rect.right - rect.left >= SPIKE_MAX_WIDTH) continue;
    const neighbours = [rects[index - 1], rects[index + 1]].filter((neighbour): neighbour is SupportRect => Boolean(neighbour));
    if (neighbours.length === 0) continue;
    const highestNeighbour = Math.min(...neighbours.map((neighbour) => neighbour.top));
    if (neighbours.every((neighbour) => rect.top < neighbour.top - SPIKE_MIN_RISE)) rect.top = highestNeighbour;
  }
  return mergeByTop(rects, tolerance);
}

/**
 * Walks to the foot of the drawn structure, then follows its treads up to the
 * middle of the highest one. The first waypoint has no `y`: it is ordinary
 * ground walking; every later waypoint places the body's bottom on a tread.
 * A rise too tall to step up (a wall facing the hero) is climbed straight up
 * first (`climb`), then stepped onto.
 */
export function surfaceClimbRoute(
  rects: SupportRect[],
  body: { halfWidth: number; halfHeight: number },
  direction: -1 | 1,
): RouteWaypoint[] {
  if (rects.length === 0) return [];
  const ordered = direction > 0 ? [...rects] : [...rects].reverse();
  const minTop = Math.min(...ordered.map((rect) => rect.top));
  const summit = ordered.findIndex((rect) => rect.top <= minTop + 2);
  const near = (rect: SupportRect): number => (direction > 0 ? rect.left : rect.right);
  const far = (rect: SupportRect): number => (direction > 0 ? rect.right : rect.left);
  const inset = (rect: SupportRect): number => Math.min(body.halfWidth * 0.5, (rect.right - rect.left) / 2);
  const route: RouteWaypoint[] = [{ x: near(ordered[0]) - direction * (body.halfWidth + 6) }];
  const push = (x: number, y: number): void => {
    const last = route.at(-1);
    if (last?.y !== undefined && Math.abs(last.x - x) < 3 && Math.abs(last.y - y) < 3) return;
    route.push({ x, y });
  };
  let previousTop = ordered[0].bottom;
  for (let index = 0; index <= summit; index++) {
    const rect = ordered[index];
    const y = rect.top - body.halfHeight - 1;
    if (previousTop - rect.top > body.halfHeight * TALL_RISE_HALF_HEIGHTS) route.push({ x: route.at(-1)!.x, y, climb: true });
    push(near(rect) + direction * inset(rect), y);
    push(index < summit ? far(rect) - direction * inset(rect) : (rect.left + rect.right) / 2, y);
    previousTop = rect.top;
  }
  return route;
}

export function surfaceBounds(surface: DrawnSurface): SupportRect {
  const half = surface.columnWidth / 2;
  const xs = surface.points.map((point) => point.x);
  return {
    left: Math.min(...xs) - half,
    right: Math.max(...xs) + half,
    top: Math.min(...surface.points.map((point) => point.y)),
    bottom: surface.bottomY,
  };
}

/** The support a ladder leans on: level with its top and touching its side. */
export function ladderLanding(
  ladder: SupportRect,
  supports: SupportRect[],
  preferred: -1 | 1,
): { rect: SupportRect; direction: -1 | 1 } | null {
  const center = (ladder.left + ladder.right) / 2;
  const width = ladder.right - ladder.left;
  const candidates = supports
    .filter((support) => support.right - support.left >= 16 && support.top >= ladder.top - 28 && support.top <= ladder.top + 56)
    .map((support) => {
      const direction: -1 | 1 = (support.left + support.right) / 2 >= center ? 1 : -1;
      const gap = direction > 0 ? support.left - ladder.right : ladder.left - support.right;
      return { rect: support, direction, gap };
    })
    .filter((candidate) => candidate.gap <= 24 && candidate.gap >= -width - 8)
    .sort((a, b) =>
      Number(a.direction !== preferred) - Number(b.direction !== preferred) ||
      Math.abs(a.rect.top - ladder.top) - Math.abs(b.rect.top - ladder.top));
  const best = candidates[0];
  return best ? { rect: best.rect, direction: best.direction } : null;
}

/**
 * Up a drawn ladder: walk to its foot, climb to the top rung, then step onto
 * whatever it leans on. With nothing to step onto, look around and climb down.
 */
export function ladderClimbRoute(
  ladder: SupportRect,
  body: { halfWidth: number; halfHeight: number },
  standY: number,
  landing: { rect: SupportRect; direction: -1 | 1 } | null,
  direction: -1 | 1,
): RouteWaypoint[] {
  const center = (ladder.left + ladder.right) / 2;
  const topY = ladder.top + 6 - body.halfHeight - 1;
  const route: RouteWaypoint[] = [
    { x: center - direction * body.halfWidth * 0.5 },
    { x: center, y: topY, climb: true },
  ];
  if (!landing) {
    route.push({ x: center, y: topY, pauseMs: 900 }, { x: center, y: standY, climb: true });
    return route;
  }
  const { rect, direction: side } = landing;
  const y = rect.top - body.halfHeight - 1;
  const near = side > 0 ? rect.left : rect.right;
  const width = rect.right - rect.left;
  const onto = (depth: number): number => (side > 0 ? Math.max(center, near + depth) : Math.min(center, near - depth));
  route.push(
    { x: onto(Math.min(body.halfWidth * 0.5, width / 2)), y },
    { x: onto(Math.min(body.halfWidth * 1.5, width / 2)), y },
  );
  return route;
}
