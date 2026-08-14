import type { CharacterAnalyzeResult, DrawingAnalyzeResult, DrawingAnalysis } from "./schemas";

export class AiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = "AiError";
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new AiError(error instanceof Error ? error.message : "network failure");
  }
  if (!response.ok) {
    let message = `server error ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string; error?: string };
      message = data.message ?? data.error ?? message;
    } catch {
      // keep fallback message
    }
    throw new AiError(message, response.status);
  }
  return (await response.json()) as T;
}

export function analyzeCharacter(
  image: string,
  canvas: { width: number; height: number },
): Promise<CharacterAnalyzeResult> {
  return postJson<CharacterAnalyzeResult>("/api/character/analyze", { image, canvas });
}

export function analyzeDrawing(
  image: string,
  deltaCrop: string | null,
  canvas: { width: number; height: number },
  goal: string,
  joints: Array<{ id: string; x: number; y: number }>,
  worldSummary: string,
  acceptedCategories: string[],
): Promise<DrawingAnalyzeResult> {
  return postJson<DrawingAnalyzeResult>("/api/drawing/analyze", {
    image,
    deltaCrop,
    canvas,
    goal,
    joints,
    worldSummary,
    acceptedCategories,
  });
}

export function isMatchesGoal(analysis: DrawingAnalysis): boolean {
  return analysis.recognized && analysis.matchesGoal;
}
