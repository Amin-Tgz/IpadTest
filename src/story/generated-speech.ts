export type GeneratedSpeechDiagnostic = (event: string, detail: Record<string, unknown>) => void;

export class GeneratedSpeech {
  private context: AudioContext | null = null;
  private active: AudioBufferSourceNode | null = null;
  private request: AbortController | null = null;

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

  async speak(text: string, onEnd: () => void = () => void 0): Promise<boolean> {
    if (!this.supported || text.trim().length === 0) return false;
    this.stop();
    const request = new AbortController();
    this.request = request;
    const startedAt = performance.now();
    this.diagnostic("generation_requested", { ...this.snapshot(), textLength: text.length });
    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: request.signal,
      });
      if (!response.ok) throw new Error(`speech endpoint returned ${response.status}`);
      const bytes = await response.arrayBuffer();
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
        cache: response.headers.get("x-tts-cache"),
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
    };
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
