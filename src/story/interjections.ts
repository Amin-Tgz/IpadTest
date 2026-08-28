export type InterjectionPreset = "curious" | "confused" | "delighted";

export interface InterjectionClip {
  key: string;
  text: string;
  preset: InterjectionPreset;
  path: string;
}

export const INTERJECTIONS: Record<InterjectionPreset, InterjectionClip> = {
  curious: { key: "interjection-curious", text: "اِ؟", preset: "curious", path: "/audio/hero/interjection-curious.pwa" },
  confused: { key: "interjection-thinking", text: "هوم...", preset: "confused", path: "/audio/hero/interjection-thinking.pwa" },
  delighted: { key: "interjection-delighted", text: "آها!", preset: "delighted", path: "/audio/hero/interjection-delighted.pwa" },
};

const PRESET_BY_EMOTION: Record<string, InterjectionPreset> = {
  curious: "curious",
  confused: "confused",
  protesting: "confused",
  effort: "confused",
  sad: "confused",
  delighted: "delighted",
};

export function interjectionFor(emotion: string): InterjectionClip | null {
  const preset = PRESET_BY_EMOTION[emotion];
  return preset ? INTERJECTIONS[preset] : null;
}
