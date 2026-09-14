import type { HeroVoicePreset } from "../character/living-line-hero.js";
import { playbackSessionType, preferPlaybackSession } from "../audio/audio-session.js";

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
  analyser: AnalyserNode | null;
  analyserData: Uint8Array<ArrayBuffer> | null;
}

// A clean live take takes 5.5–7.5 s to generate and the server may need a
// second take, so a line waits well past one take for its voice. The shared
// request outlives any single line: late audio still lands in the cache.
const LINE_WAIT_MS = 18_000;
const GENERATION_TIMEOUT_MS = 40_000;
const RETRY_DELAY_MS = 250;
const DECODED_CACHE_LIMIT = 48;
const REFRESH_MIN_TEXT_LENGTH = 6;

export function isRetryableSpeechStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export class GeneratedSpeech {
  private context: AudioContext | null = null;
  private active: ActivePlayback | null = null;
  private readonly audioCache = new Map<string, ArrayBuffer>();
  private readonly decodedCache = new Map<string, AudioBuffer>();
  private readonly pendingAudio = new Map<string, Promise<ArrayBuffer>>();
  private readonly pendingDecoded = new Map<string, Promise<AudioBuffer>>();
  private token = 0;
  private voiceLevel = 0;

  constructor(private readonly diagnostic: GeneratedSpeechDiagnostic = () => void 0) {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.context?.state === "suspended") {
          void this.context.resume().then(() => {
            this.diagnostic("audio_context_resumed_on_visibility", this.snapshot());
          }).catch(() => void 0);
        }
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", () => {
        if (this.context?.state === "suspended") {
          void this.context.resume().then(() => {
            this.diagnostic("audio_context_resumed_on_pageshow", this.snapshot());
          }).catch(() => void 0);
        }
      });
    }
  }

  get supported(): boolean {
    return typeof window !== "undefined" && ("AudioContext" in window || "webkitAudioContext" in window);
  }

  async unlock(): Promise<boolean> {
    if (!this.supported) {
      this.diagnostic("unlock_unsupported", this.snapshot());
      return false;
    }
    // Before the first await, while the tap still counts as a user gesture.
    const session = preferPlaybackSession();
    try {
      const context = this.ensureContext();
      await context.resume();
      this.diagnostic("unlocked", { ...this.snapshot(), sessionRequest: session });
      return context.state === "running";
    } catch (error) {
      this.diagnostic("unlock_error", { ...this.snapshot(), message: describe(error) });
      return false;
    }
  }

  /**
   * iPadOS suspends or interrupts a running context (lock screen, Siri, a
   * notification) and only a user gesture may resume it; call on every tap.
   */
  keepAlive(): void {
    const context = this.context;
    if (!context || context.state === "running") return;
    preferPlaybackSession();
    const previous = context.state;
    void context.resume().then(() => {
      this.diagnostic("audio_context_resumed_on_gesture", { ...this.snapshot(), previous });
    }).catch(() => void 0);
  }

  getContext(): AudioContext | null {
    if (!this.supported) return null;
    return this.ensureContext();
  }

  preload(lines: SpeechPlaybackRequest[]): void {
    for (const line of lines) this.prime(line);
  }

  prime(request: SpeechPlaybackRequest): Promise<void> {
    const plan = this.planFor(request);
    const done = this.loadDecoded(this.cacheKey(plan.request), plan.request)
      .then((): void => undefined)
      .catch((error) => {
        this.diagnostic("prime_error", { message: describe(error), static: plan.kind === "static" });
      });
    if (plan.kind === "generated" || request.audioUrl) return done;
    const base = this.baseRequest(request);
    if (base.text.length >= REFRESH_MIN_TEXT_LENGTH && !this.audioCache.has(this.cacheKey(base))) {
      void this.loadAudio(base).catch((error) => {
        this.diagnostic("background_refresh_error", { textLength: base.text.length, message: describe(error) });
      });
    }
    return done;
  }

  isInstant(request: SpeechPlaybackRequest): boolean {
    if (request.audioUrl) return true;
    const base = this.baseRequest(request);
    return this.decodedCache.has(this.cacheKey(base)) || this.audioCache.has(this.cacheKey(base));
  }

  play(request: SpeechPlaybackRequest): Promise<SpeechPlaybackResult> {
    const text = request.text.trim();
    const sourceKind: SpeechPlaybackResult["source"] = request.audioUrl ? "static" : "generated";
    if (!this.supported || text.length === 0) {
      return Promise.resolve({ status: "failed", durationMs: 0, source: sourceKind });
    }

    this.cancel("replaced");
    const token = ++this.token;
    const abort = new AbortController();
    const startedAt = performance.now();

    return new Promise<SpeechPlaybackResult>((resolve) => {
      const active: ActivePlayback = {
        token, abort, source: null, resolve, startedAt, sourceKind,
        watchdog: null, analyser: null, analyserData: null,
      };
      this.active = active;
      this.diagnostic("generation_requested", {
        ...this.snapshot(),
        textLength: text.length,
        preset: request.preset ?? "curious",
        source: this.planFor(request).kind === "static" ? "static" : "generated",
        ready: this.isInstant(request),
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

  getVoiceLevel(): number {
    const active = this.active;
    if (!active?.analyser || !active.analyserData || active.source === null) {
      this.voiceLevel *= 0.8;
      return Math.min(1, this.voiceLevel);
    }
    active.analyser.getByteTimeDomainData(active.analyserData);
    let peak = 0;
    for (let i = 0; i < active.analyserData.length; i++) {
      const deviation = Math.abs(active.analyserData[i] - 128) / 128;
      if (deviation > peak) peak = deviation;
    }
    const instant = Math.min(1, peak * 1.8);
    this.voiceLevel = Math.max(instant, this.voiceLevel * 0.78);
    return this.voiceLevel;
  }

  snapshot(): Record<string, unknown> {
    return {
      supported: this.supported,
      contextState: this.context?.state ?? "not-created",
      audioSession: playbackSessionType(),
      generating: this.active !== null && this.active.source === null,
      playing: this.active?.source != null,
      cachedLines: this.audioCache.size,
      decodedLines: this.decodedCache.size,
      voiceLevel: Math.round(this.voiceLevel * 100) / 100,
    };
  }

  private async beginPlayback(active: ActivePlayback, request: SpeechPlaybackRequest): Promise<void> {
    try {
      const context = this.ensureContext();
      await this.ensureRunning(context, active.abort.signal);
      const buffer = await this.loadPreferred(active, request);
      if (!this.isActive(active)) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(context.destination);
      source.onended = () => {
        if (!this.isActive(active)) return;
        if (active.watchdog !== null) window.clearTimeout(active.watchdog);
        this.active = null;
        const result = this.result(active, "played");
        this.diagnostic("playback_ended", { ...this.snapshot(), durationMs: result.durationMs });
        active.resolve(result);
      };
      active.source = source;
      active.analyser = analyser;
      active.analyserData = new Uint8Array(analyser.frequencyBinCount);
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
      if (active.sourceKind === "static") this.primeGeneratedInBackground(request);
    } catch (error) {
      if (!this.isActive(active)) return;
      this.active = null;
      const result = this.result(active, "failed");
      this.diagnostic("playback_error", { ...this.snapshot(), message: describe(error), durationMs: result.durationMs });
      active.resolve(result);
    }
  }

  private primeGeneratedInBackground(request: SpeechPlaybackRequest): void {
    if (request.audioUrl) return;
    const base = this.baseRequest(request);
    if (base.text.length < REFRESH_MIN_TEXT_LENGTH) return;
    if (this.audioCache.has(this.cacheKey(base)) || this.pendingAudio.has(this.cacheKey(base))) return;
    void this.loadAudio(base).catch((error) => {
      this.diagnostic("background_refresh_error", { textLength: base.text.length, message: describe(error) });
    });
  }

  private planFor(request: SpeechPlaybackRequest): { kind: "static" | "generated"; request: SpeechPlaybackRequest } {
    const base = this.baseRequest(request);
    if (request.audioUrl) return { kind: "static", request: { ...base, audioUrl: request.audioUrl } };
    return { kind: "generated", request: base };
  }

  private candidates(request: SpeechPlaybackRequest): SpeechPlaybackRequest[] {
    const base = this.baseRequest(request);
    if (request.audioUrl) return [{ ...base, audioUrl: request.audioUrl }, base];
    if (request.fallbackAudioUrl) return [base, { ...base, audioUrl: request.fallbackAudioUrl }];
    return [base];
  }

  private async loadPreferred(active: ActivePlayback, request: SpeechPlaybackRequest): Promise<AudioBuffer> {
    const attempts = this.candidates(request);
    const deadline = active.startedAt + LINE_WAIT_MS;
    let lastError: unknown = new Error("speech playback failed");
    for (let index = 0; index < attempts.length; index++) {
      const candidate = attempts[index];
      if (active.abort.signal.aborted) throw abortError();
      const key = this.cacheKey(candidate);
      try {
        active.sourceKind = candidate.audioUrl ? "static" : "generated";
        const buffer = await this.within(this.loadDecoded(key, candidate), deadline, active.abort.signal);
        if (index > 0) {
          this.diagnostic(candidate.audioUrl ? "generated_fallback_static" : "static_fallback_generated", {
            textLength: candidate.text.length,
            message: describe(lastError),
          });
        }
        return buffer;
      } catch (error) {
        if (active.abort.signal.aborted) throw abortError();
        lastError = error;
        if (candidate.audioUrl) this.audioCache.delete(key);
        else this.decodedCache.delete(key);
      }
    }
    throw lastError;
  }

  /** Waits for shared work on behalf of one line without letting that line cancel it. */
  private within<T>(work: Promise<T>, deadline: number, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timer: number | null = null;
      const finish = (settle: () => void): void => {
        if (timer !== null) window.clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        settle();
      };
      const onAbort = (): void => finish(() => reject(abortError()));
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      timer = window.setTimeout(
        () => finish(() => reject(new Error(`speech not ready within ${LINE_WAIT_MS}ms`))),
        Math.max(0, deadline - performance.now()),
      );
      work.then((value) => finish(() => resolve(value)), (error: unknown) => finish(() => reject(error)));
    });
  }

  private async ensureRunning(context: AudioContext, signal: AbortSignal): Promise<void> {
    await context.resume();
    if (context.state === "running") return;
    await delay(80, signal);
    await context.resume();
    const resumedState = context.state as AudioContextState;
    if (resumedState !== "running") throw new Error(`audio context is ${resumedState}`);
  }

  private loadDecoded(key: string, request: SpeechPlaybackRequest): Promise<AudioBuffer> {
    const cached = this.decodedCache.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.pendingDecoded.get(key);
    if (pending) return pending;
    const promise = (async () => {
      const bytes = await this.loadAudio(request);
      const context = this.ensureContext();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      this.decodedCache.set(key, buffer);
      while (this.decodedCache.size > DECODED_CACHE_LIMIT) {
        this.decodedCache.delete(this.decodedCache.keys().next().value!);
      }
      return buffer;
    })().finally(() => {
      this.pendingDecoded.delete(key);
    });
    this.pendingDecoded.set(key, promise);
    return promise;
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

  private baseRequest(request: SpeechPlaybackRequest): SpeechPlaybackRequest {
    return { text: request.text.trim(), preset: request.preset ?? "curious" };
  }

  private cacheKey(request: SpeechPlaybackRequest): string {
    if (request.audioUrl) return `static\0${request.audioUrl}`;
    return `generated\0${request.preset ?? "curious"}\0${request.text.trim()}`;
  }

  private loadAudio(request: SpeechPlaybackRequest): Promise<ArrayBuffer> {
    const key = this.cacheKey(request);
    const cached = this.audioCache.get(key);
    if (cached) return Promise.resolve(cached.slice(0));
    const pending = this.pendingAudio.get(key);
    if (pending) return pending.then((bytes) => bytes.slice(0));
    const promise = request.audioUrl
      ? this.fetchStatic(request.audioUrl)
      : this.fetchGenerated(request.text, request.preset ?? "curious");
    const stored = promise.then((bytes) => {
      this.audioCache.set(key, bytes.slice(0));
      while (this.audioCache.size > 32) this.audioCache.delete(this.audioCache.keys().next().value!);
      return bytes;
    }).finally(() => this.pendingAudio.delete(key));
    this.pendingAudio.set(key, stored);
    return stored.then((bytes) => bytes.slice(0));
  }

  private async fetchStatic(url: string): Promise<ArrayBuffer> {
    let lastError: unknown = new Error("static speech failed");
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(url, { cache: attempt === 1 ? "default" : "reload" });
        if (response.ok) return await response.arrayBuffer();
        lastError = new Error(`static speech returned ${response.status}`);
        if (!isRetryableSpeechStatus(response.status)) throw lastError;
      } catch (error) {
        lastError = error;
      }
      if (attempt === 1) {
        this.diagnostic("static_retry", { url, attempt: 2, message: describe(lastError) });
        await delay(RETRY_DELAY_MS);
      }
    }
    throw lastError;
  }

  private async fetchGenerated(text: string, preset: HeroVoicePreset): Promise<ArrayBuffer> {
    const deadline = performance.now() + GENERATION_TIMEOUT_MS;
    let lastError: unknown = new Error("speech generation failed");
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), remaining);
      try {
        const response = await fetch("/api/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, preset }),
          signal: controller.signal,
        });
        if (response.ok) return await response.arrayBuffer();
        lastError = new Error(`speech endpoint returned ${response.status}`);
        if (!isRetryableSpeechStatus(response.status)) throw lastError;
      } catch (error) {
        if (error === lastError) throw error;
        lastError = error;
      } finally {
        window.clearTimeout(timeout);
      }
      if (attempt === 1 && performance.now() + RETRY_DELAY_MS < deadline) {
        this.diagnostic("generation_retry", { attempt: 2, message: describe(lastError) });
        await delay(RETRY_DELAY_MS);
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

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(id);
      reject(abortError());
    }, { once: true });
  });
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
