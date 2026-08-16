import type { HeroVoicePreset } from "../character/living-line-hero.js";

export type SpeechPlaybackStatus = "played" | "failed" | "cancelled";

export interface SpeechPlaybackRequest {
  text: string;
  preset?: HeroVoicePreset;
  audioUrl?: string;
  fallbackAudioUrl?: string;
  onPlaybackStart?: () => void;
}

export interface SpeechPlaybackResult {
  status: SpeechPlaybackStatus;
  durationMs: number;
  source: "static" | "generated";
}

export type GeneratedSpeechDiagnostic = (event: string, detail: Record<string, unknown>) => void;

interface ActivePlayback {
  token: number;
  abort: AbortController;
  source: AudioBufferSourceNode | null;
  resolve: (result: SpeechPlaybackResult) => void;
  startedAt: number;
  sourceKind: "static" | "generated";
  watchdog: number | null;
}

const GENERATED_BUDGET_MS = 8_000;
const RETRY_DELAY_MS = 250;

export function isRetryableSpeechStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export class GeneratedSpeech {
  private context: AudioContext | null = null;
  private active: ActivePlayback | null = null;
  private readonly audioCache = new Map<string, ArrayBuffer>();
  private readonly pendingAudio = new Map<string, Promise<ArrayBuffer>>();
  private token = 0;

  constructor(private readonly diagnostic: GeneratedSpeechDiagnostic = () => void 0) {}

  get supported(): boolean {
    return typeof window !== "undefined" && ("AudioContext" in window || "webkitAudioContext" in window);
  }

  async unlock(): Promise<boolean> {
    if (!this.supported) {
      this.diagnostic("unlock_unsupported", this.snapshot());
      return false;
    }
    try {
      const context = this.ensureContext();
      await context.resume();
      this.diagnostic("unlocked", this.snapshot());
      return context.state === "running";
    } catch (error) {
      this.diagnostic("unlock_error", { ...this.snapshot(), message: describe(error) });
      return false;
    }
  }

  preload(lines: SpeechPlaybackRequest[]): void {
    for (const line of lines) {
      const preloadRequest = line.fallbackAudioUrl
        ? { ...line, audioUrl: line.fallbackAudioUrl, fallbackAudioUrl: undefined }
        : line;
      void this.loadAudio(preloadRequest, new AbortController().signal).catch((error) => {
        this.diagnostic("preload_error", { textLength: line.text.length, message: describe(error) });
      });
    }
  }

  play(request: SpeechPlaybackRequest): Promise<SpeechPlaybackResult> {
    const text = request.text.trim();
    const sourceKind = request.audioUrl ? "static" : "generated";
    if (!this.supported || text.length === 0) {
      return Promise.resolve({ status: "failed", durationMs: 0, source: sourceKind });
    }

    this.cancel("replaced");
    const token = ++this.token;
    const abort = new AbortController();
    const startedAt = performance.now();

    return new Promise<SpeechPlaybackResult>((resolve) => {
      const active: ActivePlayback = { token, abort, source: null, resolve, startedAt, sourceKind, watchdog: null };
      this.active = active;
      this.diagnostic("generation_requested", {
        ...this.snapshot(),
        textLength: text.length,
        preset: request.preset ?? "curious",
        source: sourceKind,
      });
      void this.beginPlayback(active, { ...request, text });
    });
  }

  cancel(reason = "cancelled"): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.abort.abort();
    if (active.watchdog !== null) window.clearTimeout(active.watchdog);
    if (active.source) {
      active.source.onended = null;
      try {
        active.source.stop();
      } catch {
        void 0;
      }
    }
    const result = this.result(active, "cancelled");
    this.diagnostic("playback_cancelled", { ...this.snapshot(), reason, durationMs: result.durationMs });
    active.resolve(result);
  }

  snapshot(): Record<string, unknown> {
    return {
      supported: this.supported,
      contextState: this.context?.state ?? "not-created",
      generating: this.active !== null && this.active.source === null,
      playing: this.active?.source != null,
      cachedLines: this.audioCache.size,
    };
  }

  private async beginPlayback(active: ActivePlayback, request: SpeechPlaybackRequest): Promise<void> {
    try {
      const context = this.ensureContext();
      await this.ensureRunning(context, active.abort.signal);
      const buffer = await this.decodeWithGeneratedFallback(active, request, context);
      if (!this.isActive(active)) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (!this.isActive(active)) return;
        if (active.watchdog !== null) window.clearTimeout(active.watchdog);
        this.active = null;
        const result = this.result(active, "played");
        this.diagnostic("playback_ended", { ...this.snapshot(), durationMs: result.durationMs });
        active.resolve(result);
      };
      active.source = source;
      source.start();
      request.onPlaybackStart?.();
      active.watchdog = window.setTimeout(() => {
        if (!this.isActive(active)) return;
        source.onended = null;
        this.active = null;
        const result = this.result(active, "played");
        this.diagnostic("playback_watchdog_completed", { ...this.snapshot(), durationMs: result.durationMs });
        active.resolve(result);
      }, Math.ceil(buffer.duration * 1000) + 1500);
      this.diagnostic("playback_started", {
        ...this.snapshot(),
        durationSeconds: Math.round(buffer.duration * 100) / 100,
        elapsedMs: Math.round(performance.now() - active.startedAt),
        preset: request.preset ?? "curious",
        source: active.sourceKind,
      });
    } catch (error) {
      if (!this.isActive(active)) return;
      this.active = null;
      const result = this.result(active, "failed");
      this.diagnostic("playback_error", { ...this.snapshot(), message: describe(error), durationMs: result.durationMs });
      active.resolve(result);
    }
  }

  private async ensureRunning(context: AudioContext, signal: AbortSignal): Promise<void> {
    await context.resume();
    if (context.state === "running") return;
    await delay(80, signal);
    await context.resume();
    const resumedState = context.state as AudioContextState;
    if (resumedState !== "running") throw new Error(`audio context is ${resumedState}`);
  }

  private async decodeWithGeneratedFallback(
    active: ActivePlayback,
    request: SpeechPlaybackRequest,
    context: AudioContext,
  ): Promise<AudioBuffer> {
    try {
      const bytes = await this.loadAudio(request, active.abort.signal);
      return await context.decodeAudioData(bytes.slice(0));
    } catch (error) {
      if (request.fallbackAudioUrl && !active.abort.signal.aborted) {
        active.sourceKind = "static";
        this.diagnostic("generated_fallback_static", { textLength: request.text.length, message: describe(error) });
        const fallback = { text: request.text, preset: request.preset, audioUrl: request.fallbackAudioUrl } satisfies SpeechPlaybackRequest;
        const bytes = await this.loadAudio(fallback, active.abort.signal);
        return context.decodeAudioData(bytes.slice(0));
      }
      if (!request.audioUrl || active.abort.signal.aborted) throw error;
      this.audioCache.delete(this.cacheKey(request));
      active.sourceKind = "generated";
      this.diagnostic("static_fallback_generated", { textLength: request.text.length, message: describe(error) });
      const fallback = { text: request.text, preset: request.preset } satisfies SpeechPlaybackRequest;
      const bytes = await this.loadAudio(fallback, active.abort.signal);
      return context.decodeAudioData(bytes.slice(0));
    }
  }

  private result(active: ActivePlayback, status: SpeechPlaybackStatus): SpeechPlaybackResult {
    return {
      status,
      durationMs: Math.max(0, Math.round(performance.now() - active.startedAt)),
      source: active.sourceKind,
    };
  }

  private isActive(active: ActivePlayback): boolean {
    return this.active === active && this.token === active.token && !active.abort.signal.aborted;
  }

  private cacheKey(request: SpeechPlaybackRequest): string {
    if (request.audioUrl) return `static\0${request.audioUrl}`;
    return `generated\0${request.preset ?? "curious"}\0${request.text.trim()}`;
  }

  private loadAudio(request: SpeechPlaybackRequest, signal: AbortSignal): Promise<ArrayBuffer> {
    const key = this.cacheKey(request);
    const cached = this.audioCache.get(key);
    if (cached) return Promise.resolve(cached.slice(0));
    const pending = this.pendingAudio.get(key);
    if (pending) return pending.then((bytes) => bytes.slice(0));
    const promise = request.audioUrl
      ? this.fetchStatic(request.audioUrl, signal)
      : this.fetchGenerated(request.text, request.preset ?? "curious", signal);
    const stored = promise.then((bytes) => {
      this.audioCache.set(key, bytes.slice(0));
      while (this.audioCache.size > 32) this.audioCache.delete(this.audioCache.keys().next().value!);
      return bytes;
    }).finally(() => this.pendingAudio.delete(key));
    this.pendingAudio.set(key, stored);
    return stored.then((bytes) => bytes.slice(0));
  }

  private async fetchStatic(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
    let lastError: unknown = new Error("static speech failed");
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(url, { signal, cache: attempt === 1 ? "default" : "reload" });
        if (response.ok) return await response.arrayBuffer();
        lastError = new Error(`static speech returned ${response.status}`);
        if (!isRetryableSpeechStatus(response.status)) throw lastError;
      } catch (error) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        lastError = error;
      }
      if (attempt === 1) {
        this.diagnostic("static_retry", { url, attempt: 2, message: describe(lastError) });
        await delay(RETRY_DELAY_MS, signal);
      }
    }
    throw lastError;
  }

  private async fetchGenerated(text: string, preset: HeroVoicePreset, outerSignal: AbortSignal): Promise<ArrayBuffer> {
    const deadline = performance.now() + GENERATED_BUDGET_MS;
    let lastError: unknown = new Error("speech generation failed");
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      const attemptController = new AbortController();
      const abortAttempt = () => attemptController.abort();
      outerSignal.addEventListener("abort", abortAttempt, { once: true });
      const timeout = window.setTimeout(() => attemptController.abort(), remaining);
      let retryableFailure = true;
      try {
        const response = await fetch("/api/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, preset }),
          signal: attemptController.signal,
        });
        if (response.ok) return await response.arrayBuffer();
        const retryable = isRetryableSpeechStatus(response.status);
        lastError = new Error(`speech endpoint returned ${response.status}`);
        retryableFailure = retryable;
        if (!retryableFailure) throw lastError;
      } catch (error) {
        if (outerSignal.aborted) throw new DOMException("Aborted", "AbortError");
        lastError = error;
        if (!retryableFailure) throw error;
      } finally {
        window.clearTimeout(timeout);
        outerSignal.removeEventListener("abort", abortAttempt);
      }
      if (attempt === 1 && performance.now() + RETRY_DELAY_MS < deadline) {
        this.diagnostic("generation_retry", { attempt: 2, message: describe(lastError) });
        await delay(RETRY_DELAY_MS, outerSignal);
      }
    }
    throw lastError;
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    this.context = new AudioContextConstructor();
    return this.context;
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
