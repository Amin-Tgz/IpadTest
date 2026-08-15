import type { AIActionRequest } from "./schemas.js";

const TARGET_REQUIRED = new Set<AIActionRequest["type"]>(["equip", "use", "climb", "interact", "point", "rescue"]);

export function validateActionRequest(
  action: AIActionRequest,
  objectIds: string[],
): { valid: true; targetId: string | null } | { valid: false; reason: string } {
  if (!Number.isFinite(action.durationMs) || action.durationMs < 100 || action.durationMs > 5000) {
    return { valid: false, reason: "duration_out_of_range" };
  }
  const targetId = action.targetObjectIndex === null ? null : objectIds[action.targetObjectIndex] ?? null;
  if (TARGET_REQUIRED.has(action.type) && targetId === null) {
    return { valid: false, reason: "missing_target" };
  }
  return { valid: true, targetId };
}
