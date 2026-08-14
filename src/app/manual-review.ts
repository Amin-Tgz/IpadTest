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
