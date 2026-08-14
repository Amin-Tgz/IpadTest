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
