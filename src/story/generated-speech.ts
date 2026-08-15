import type { HeroVoicePreset } from "../character/living-line-hero.js";

export type GeneratedSpeechDiagnostic = (event: string, detail: Record<string, unknown>) => void;

export class GeneratedSpeech {
  private context: AudioContext | null = null;
  private active: AudioBufferSourceNode | null = null;
  private request: AbortController | null = null;
  private readonly audioCache = new Map<string, ArrayBuffer>();
  private readonly pendingAudio = new Map<string, Promise<ArrayBuffer>>();

  constructor(private readonly diagnostic: GeneratedSpeechDiagnostic = () => void 0) {}

  get supported(): boolean {
    return typeof window !== "undefined" && ("AudioContext" in window || "webkitAudioContext" in window);
  }

  unlock(): void {
    if (!this.supported) {
      this.diagnostic("unlock_unsupported", this.snapshot());
      return;
    }
    const context = this.ensureContext();
    void context.resume().then(() => this.diagnostic("unlocked", this.snapshot())).catch((error) => {
      this.diagnostic("unlock_error", { ...this.snapshot(), message: error instanceof Error ? error.message : String(error) });
    });
  }

  preload(lines: Array<{ text: string; preset: HeroVoicePreset }>): void {
    for (const line of lines) {
      void this.loadAudio(line.text, line.preset).catch((error) => {
        this.diagnostic("preload_error", { textLength: line.text.length, message: error instanceof Error ? error.message : String(error) });
      });
    }
  }

  async speak(
    text: string,
    onEnd: () => void = () => void 0,
    preset: HeroVoicePreset = "curious",
  ): Promise<boolean> {
    if (!this.supported || text.trim().length === 0) return false;
    this.stop();
    const request = new AbortController();
    this.request = request;
    const startedAt = performance.now();
    this.diagnostic("generation_requested", { ...this.snapshot(), textLength: text.length, preset });
    try {
      const cacheKey = this.cacheKey(text, preset);
      const wasCached = this.audioCache.has(cacheKey);
      const bytes = await this.loadAudio(text, preset);
      if (this.request !== request) return false;
      const context = this.ensureContext();
      await context.resume();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      if (this.request !== request) return false;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (this.active !== source) return;
        this.active = null;
        this.request = null;
        this.diagnostic("playback_ended", this.snapshot());
        onEnd();
      };
      this.active = source;
      source.start();
      this.diagnostic("playback_started", {
        ...this.snapshot(),
        durationSeconds: Math.round(buffer.duration * 100) / 100,
        elapsedMs: Math.round(performance.now() - startedAt),
        cache: wasCached ? "client-hit" : "server-or-network",
        preset,
      });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      this.diagnostic("playback_error", { ...this.snapshot(), message: error instanceof Error ? error.message : String(error) });
      if (this.request === request) this.request = null;
      return false;
    }
  }

  stop(): void {
    this.request?.abort();
    this.request = null;
    if (this.active) {
      const source = this.active;
      this.active = null;
      source.onended = null;
      try {
        source.stop();
      } catch {
        void 0;
      }
    }
  }

  snapshot(): Record<string, unknown> {
    return {
      supported: this.supported,
      contextState: this.context?.state ?? "not-created",
      generating: this.request !== null && this.active === null,
      playing: this.active !== null,
      cachedLines: this.audioCache.size,
    };
  }

  private cacheKey(text: string, preset: HeroVoicePreset): string {
    return `${preset}\0${text.trim()}`;
  }

  private loadAudio(text: string, preset: HeroVoicePreset): Promise<ArrayBuffer> {
    const key = this.cacheKey(text, preset);
    const cached = this.audioCache.get(key);
    if (cached) return Promise.resolve(cached.slice(0));
    const pending = this.pendingAudio.get(key);
    if (pending) return pending.then((bytes) => bytes.slice(0));
    const request = fetch("/api/speech", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, preset }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`speech endpoint returned ${response.status}`);
      const bytes = await response.arrayBuffer();
      this.audioCache.set(key, bytes.slice(0));
      while (this.audioCache.size > 24) this.audioCache.delete(this.audioCache.keys().next().value!);
      return bytes;
    }).finally(() => this.pendingAudio.delete(key));
    this.pendingAudio.set(key, request);
    return request.then((bytes) => bytes.slice(0));
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    this.context = new AudioContextConstructor();
    return this.context;
  }
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
