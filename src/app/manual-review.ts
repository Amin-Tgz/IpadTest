export interface ReviewableStroke {
  active: boolean;
  entityId: string | null;
}

export function hasReviewableChanges(
  strokes: ReviewableStroke[],
  checkpoint: number,
  groundChanged: boolean,
): boolean {
  return groundChanged || strokes
    .slice(Math.max(0, checkpoint))
    .some((stroke) => stroke.active && stroke.entityId === null);
}

export function nextReviewCheckpoint(current: number, strokeCount: number, reset: boolean): number {
  return reset ? strokeCount : current;
}

export function temporaryReviewStrokeIds(
  strokes: Array<ReviewableStroke & { id: string }>,
  sourceStrokeIds: ReadonlySet<string>,
  retainedStrokeIds: ReadonlySet<string>,
): string[] {
  return strokes
    .filter((stroke) => sourceStrokeIds.has(stroke.id) && stroke.active && stroke.entityId === null && !retainedStrokeIds.has(stroke.id))
    .map((stroke) => stroke.id);
}
