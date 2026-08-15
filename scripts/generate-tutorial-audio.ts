import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../server/config.js";
import { GeminiSpeechGenerator, type VoicePreset } from "../server/ai/gemini-tts.js";

const lines: Array<{ file: string; text: string; preset: VoicePreset }> = [
  { file: "shoes-protest.pwa", text: "اِ! این خط برای پای برهنه‌ام خیلی زبره.", preset: "protesting" },
  { file: "shoes-request.pwa", text: "هوم... دو تا کفش برام می‌کشی؟ یکی برای هر پا.", preset: "curious" },
  { file: "pond-notice.pwa", text: "اوه! توی برکه یک چیزی تکان خورد.", preset: "curious" },
  { file: "tool-request.pwa", text: "اِ... با دست خالی که نمی‌شه! یک ابزار برام بکش.", preset: "protesting" },
  { file: "interjection-curious.pwa", text: "اِ؟", preset: "curious" },
  { file: "interjection-thinking.pwa", text: "هوم...", preset: "confused" },
  { file: "interjection-delighted.pwa", text: "آها!", preset: "delighted" },
];

const config = loadConfig();
const generator = new GeminiSpeechGenerator(config);
const outputDirectory = path.resolve(process.cwd(), "public/audio/hero");
await mkdir(outputDirectory, { recursive: true });

const manifest: Record<string, { text: string; preset: VoicePreset; path: string }> = {};
for (const line of lines) {
  const audio = await generator.generate(line.text, line.preset);
  await writeFile(path.join(outputDirectory, line.file), audio.bytes);
  manifest[line.file.replace(/\.pwa$/, "")] = {
    text: line.text,
    preset: line.preset,
    path: `/audio/hero/${line.file}`,
  };
}
await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[pencil-ai] wrote ${lines.length} Puck voice assets to ${outputDirectory}`);
