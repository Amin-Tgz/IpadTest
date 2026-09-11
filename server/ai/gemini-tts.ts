import { createHash } from "node:crypto";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import { inspectSpeech, isCleanSpeech, trimSpeech, type SpeechInspection } from "./speech-guard.js";

const responseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.object({
        inlineData: z.object({ data: z.string().min(1), mimeType: z.string().min(1) }).optional(),
      }).passthrough()),
    }),
  }).passthrough()).min(1),
});

export interface SpeechAudio {
  bytes: Buffer;
  contentType: "audio/wav";
  cacheHit: boolean;
}

export type VoicePreset = "curious" | "protesting" | "confused" | "effort" | "delighted" | "sad";

const PRESET_TONE: Record<VoicePreset, string> = {
  curious: "curious, soft and a little questioning",
  protesting: "playfully protesting, quick but kind",
  confused: "hesitant and puzzled, with a short pause",
  effort: "energetic, with a little strain of effort",
  delighted: "happy and warm, with a small lift in pitch",
  sad: "gently sad and endearing, without exaggeration",
};

export interface SpeechGenerator {
  generate(text: string, preset?: VoicePreset): Promise<SpeechAudio>;
}

export function pcmToWav(pcm: Buffer, sampleRate = 24_000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export class GeminiSpeechGenerator implements SpeechGenerator {
  private readonly cache = new Map<string, Buffer>();
  private readonly endpoint: string;

  constructor(private readonly config: ServerConfig) {
    const nativeBase = config.AI_BASE_URL.replace(/\/+$/, "").replace(/\/v1$/, "");
    this.endpoint = `${nativeBase}/v1beta/models/${encodeURIComponent(config.TTS_MODEL)}:generateContent`;
  }

  async generate(text: string, preset: VoicePreset = "curious"): Promise<SpeechAudio> {
    const key = createHash("sha256")
      .update(`${this.config.TTS_MODEL}\0${this.config.TTS_VOICE}\0${this.config.TTS_STYLE}\0${preset}\0${text}`)
      .digest("hex");
    const cached = this.cache.get(key);
    if (cached) return { bytes: cached, contentType: "audio/wav", cacheHit: true };

    const startedAt = Date.now();
    let best: { pcm: Buffer; sampleRate: number; inspection: SpeechInspection } | null = null;
    let takes = 0;
    while (takes < MAX_TAKES) {
      takes++;
      const take = await this.requestTake(text, preset);
      const inspection = inspectSpeech(take.pcm, take.sampleRate, text);
      if (!best || takeBadness(inspection) < takeBadness(best.inspection)) best = { ...take, inspection };
      if (isCleanSpeech(inspection)) break;
      console.warn("[line-pal] tts_take_rejected", {
        preset,
        textLength: text.length,
        take: takes,
        spokenSeconds: speechSpanSeconds(inspection),
        budgetSeconds: Math.round(inspection.budgetSeconds * 100) / 100,
        repeated: inspection.repeatCutSeconds !== null,
      });
    }
    const chosen = best!;
    const wav = pcmToWav(trimSpeech(chosen.pcm, chosen.sampleRate, chosen.inspection), chosen.sampleRate);
    this.cache.set(key, wav);
    while (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value!);
    console.info("[line-pal] tts_generated", {
      model: this.config.TTS_MODEL,
      voice: this.config.TTS_VOICE,
      preset,
      textLength: text.length,
      audioBytes: wav.length,
      takes,
      clean: isCleanSpeech(chosen.inspection),
      elapsedMs: Date.now() - startedAt,
    });
    return { bytes: wav, contentType: "audio/wav", cacheHit: false };
  }

  private async requestTake(text: string, preset: VoicePreset): Promise<{ pcm: Buffer; sampleRate: number }> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.AI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: speechDirection(this.config.TTS_STYLE, preset, text) }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.TTS_VOICE } } },
        },
      }),
      signal: AbortSignal.timeout(Math.max(15_000, this.config.AI_TIMEOUT_MS)),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new Error(`Gemini TTS failed (${response.status}): ${body}`);
    }
    const parsed = responseSchema.parse(await response.json());
    const inline = parsed.candidates.flatMap((candidate) => candidate.content.parts)
      .find((part) => part.inlineData?.data)?.inlineData;
    if (!inline) throw new Error("Gemini TTS returned no audio data");
    const sampleRate = Number(/rate=(\d+)/i.exec(inline.mimeType)?.[1] ?? 24_000);
    return { pcm: Buffer.from(inline.data, "base64"), sampleRate };
  }
}

const MAX_TAKES = 3;

/**
 * A short English director's note followed by the Persian line. Measured
 * against the live model, Persian meta-instructions in the prompt made it read
 * the line two or more times (up to 49s for one sentence); this form did not.
 */
export function speechDirection(style: string, preset: VoicePreset, text: string): string {
  return `${style.trim().replace(/[.\s]+$/, "")}, ${PRESET_TONE[preset]}. Say it once: ${text}`;
}

function speechSpanSeconds(inspection: SpeechInspection): number {
  const { phrases } = inspection;
  if (phrases.length === 0) return 0;
  return Math.round((phrases[phrases.length - 1].end - phrases[0].start) * 100) / 100;
}

function takeBadness(inspection: SpeechInspection): number {
  if (isCleanSpeech(inspection)) return 0;
  return 1 + Math.max(0, speechSpanSeconds(inspection) - inspection.budgetSeconds);
}
