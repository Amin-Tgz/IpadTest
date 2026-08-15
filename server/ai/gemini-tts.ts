import { createHash } from "node:crypto";
import { z } from "zod";
import type { ServerConfig } from "../config.js";

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

export interface SpeechGenerator {
  generate(text: string): Promise<SpeechAudio>;
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

  async generate(text: string): Promise<SpeechAudio> {
    const key = createHash("sha256")
      .update(`${this.config.TTS_MODEL}\0${this.config.TTS_VOICE}\0${this.config.TTS_STYLE}\0${text}`)
      .digest("hex");
    const cached = this.cache.get(key);
    if (cached) return { bytes: cached, contentType: "audio/wav", cacheHit: true };

    const startedAt = Date.now();
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.AI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${this.config.TTS_STYLE} بگو: ${text}` }] }],
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
    const wav = pcmToWav(Buffer.from(inline.data, "base64"), sampleRate);
    this.cache.set(key, wav);
    while (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value!);
    console.info("[pencil-ai] tts_generated", {
      model: this.config.TTS_MODEL,
      voice: this.config.TTS_VOICE,
      textLength: text.length,
      audioBytes: wav.length,
      elapsedMs: Date.now() - startedAt,
    });
    return { bytes: wav, contentType: "audio/wav", cacheHit: false };
  }
}
