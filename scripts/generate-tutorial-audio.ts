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
  { file: "ladder-fall.pwa", text: "اوه! افتادم... یک نردبان پله‌پله برام بکش تا بیام بالا.", preset: "sad" },
];

const MAX_ATTEMPTS = 4;
const config = loadConfig();
const outputDirectory = path.resolve(process.cwd(), "public/audio/hero");
await mkdir(outputDirectory, { recursive: true });

const manifest: Record<string, { text: string; preset: VoicePreset; path: string }> = {};
for (const line of lines) {
  let accepted: Buffer | null = null;
  let fallback: Buffer | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !accepted; attempt++) {
    // A fresh generator per attempt: the in-memory cache would hand back the same take.
    const audio = await generateWithRetry(new GeminiSpeechGenerator(config), line.text, line.preset);
    fallback ??= audio.bytes;
    const check = await listen(audio.bytes, line.text);
    console.log(`[line-pal] ${line.file} attempt ${attempt}: ${check.exact ? "exact" : "rejected"} — heard «${check.heard}»`);
    if (check.exact) accepted = audio.bytes;
  }
  if (!accepted) console.warn(`[line-pal] ${line.file}: no exact take after ${MAX_ATTEMPTS} attempts; keeping the first guarded take`);
  await writeFile(path.join(outputDirectory, line.file), accepted ?? fallback!);
  manifest[line.file.replace(/\.pwa$/, "")] = { text: line.text, preset: line.preset, path: `/audio/hero/${line.file}` };
}
await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[line-pal] wrote ${lines.length} ${config.TTS_VOICE} voice assets to ${outputDirectory}`);

async function generateWithRetry(generator: GeminiSpeechGenerator, text: string, preset: VoicePreset) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await generator.generate(text, preset);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

/**
 * Asks the analysis model to listen to a clip: duration checks cannot hear an
 * interjection echoed after the sentence or an extra word, a listener can.
 */
async function listen(wav: Buffer, expected: string): Promise<{ exact: boolean; heard: string }> {
  try {
    const response = await fetch(`${config.AI_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.AI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.AI_MODEL,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Listen to this Persian audio. Expected line: «${expected}». Reply with only JSON {"heard": "<verbatim transcript, including every interjection>", "exact": true|false}. exact is true only if the line is spoken exactly once with no extra, missing, or repeated words or interjections at the start or end; colloquial pronunciation of the same word (تکان/تکون) counts as the same word.`,
            },
            { type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } },
          ],
        }],
      }),
    });
    const json = await response.json() as { choices?: Array<{ message: { content: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)) as { heard?: unknown; exact?: unknown };
    return { exact: parsed.exact === true, heard: String(parsed.heard ?? "") };
  } catch (error) {
    return { exact: false, heard: `listening failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
