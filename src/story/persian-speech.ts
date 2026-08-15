export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
}

export type SpeechDiagnostic = (event: string, detail: Record<string, unknown>) => void;

const CHILD_FRIENDLY_NAMES = ["darya", "lili", "female", "woman", "زن"];

export function normalizePersianSpeechText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[*_#~`<>|=+\\/()[\]{}]/g, " ")
    .replace(/[!?؟¡‼⁉.,،؛:;…«»"'“”‘’ـ-]+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function choosePersianVoice<T extends VoiceLike>(voices: T[]): T | null {
  const persian = voices.filter((voice) => /^fa(?:-|$)/i.test(voice.lang));
  return [...persian].sort((left, right) => {
    const score = (voice: VoiceLike): number =>
      (voice.lang.toLowerCase() === "fa-ir" ? 4 : 0) +
      (voice.localService ? 2 : 0) +
      (CHILD_FRIENDLY_NAMES.some((name) => voice.name.toLowerCase().includes(name)) ? 1 : 0);
    return score(right) - score(left);
  })[0] ?? null;
}

export function chooseSpeechVoice<T extends VoiceLike>(voices: T[], preferredLanguage = ""): T | null {
  const persian = choosePersianVoice(voices);
  if (persian) return persian;
  const preferred = preferredLanguage.toLowerCase();
  const preferredBase = preferred.split("-")[0];
  return voices.find((voice) => voice.lang.toLowerCase() === preferred) ??
    voices.find((voice) => preferredBase.length > 0 && voice.lang.toLowerCase().split("-")[0] === preferredBase) ??
    voices.find((voice) => voice.lang.toLowerCase() === "en-us") ??
    voices[0] ??
    null;
}

export class PersianSpeech {
  private active: SpeechSynthesisUtterance | null = null;
  private unlocked = false;

  constructor(private readonly diagnostic: SpeechDiagnostic = () => void 0) {
    if (this.supported) {
      window.speechSynthesis.addEventListener("voiceschanged", () => {
        this.diagnostic("voices_changed", this.snapshot());
      });
    }
    this.diagnostic("initialized", this.snapshot());
  }

  get supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  unlock(): void {
    this.diagnostic("unlock_requested", this.snapshot());
    if (!this.supported || this.unlocked) return;
    const utterance = new SpeechSynthesisUtterance(".");
    utterance.lang = "fa-IR";
    utterance.volume = 0;
    utterance.onend = () => {
      this.unlocked = true;
      this.diagnostic("unlock_ended", this.snapshot());
    };
    utterance.onerror = (event) => {
      this.unlocked = true;
      this.diagnostic("unlock_error", { ...this.snapshot(), error: event.error });
    };
    window.speechSynthesis.speak(utterance);
    this.unlocked = true;
    this.diagnostic("unlock_queued", this.snapshot());
  }

  speak(text: string, onEnd: () => void = () => void 0): boolean {
    const normalizedText = normalizePersianSpeechText(text);
    this.diagnostic("speak_requested", { ...this.snapshot(), textLength: normalizedText.length });
    if (!this.supported || normalizedText.length === 0) {
      this.diagnostic("speak_rejected", { ...this.snapshot(), reason: this.supported ? "empty_text" : "unsupported" });
      return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(normalizedText);
    utterance.lang = "fa-IR";
    utterance.rate = 0.9;
    utterance.pitch = 1.18;
    utterance.volume = 1;
    const voice = chooseSpeechVoice(window.speechSynthesis.getVoices(), navigator.language);
    if (voice) utterance.voice = voice;
    const finish = (): void => {
      if (this.active !== utterance) return;
      this.active = null;
      onEnd();
    };
    utterance.onstart = () => this.diagnostic("utterance_started", { ...this.snapshot(), voice: utterance.voice?.name ?? null });
    utterance.onend = () => {
      this.diagnostic("utterance_ended", this.snapshot());
      finish();
    };
    utterance.onerror = (event) => {
      this.diagnostic("utterance_error", { ...this.snapshot(), error: event.error, charIndex: event.charIndex });
      finish();
    };
    this.active = utterance;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    this.diagnostic("utterance_queued", { ...this.snapshot(), voice: voice?.name ?? null, voiceLang: voice?.lang ?? null });
    window.setTimeout(() => {
      if (this.active === utterance) this.diagnostic("utterance_start_watchdog", this.snapshot());
    }, 1500);
    return true;
  }

  stop(): void {
    if (!this.supported) return;
    this.diagnostic("stop_requested", this.snapshot());
    this.active = null;
    window.speechSynthesis.cancel();
  }

  snapshot(): Record<string, unknown> {
    if (!this.supported) return { supported: false, unlocked: this.unlocked };
    const voices = window.speechSynthesis.getVoices();
    return {
      supported: true,
      unlocked: this.unlocked,
      speaking: window.speechSynthesis.speaking,
      pending: window.speechSynthesis.pending,
      paused: window.speechSynthesis.paused,
      voiceCount: voices.length,
      persianVoices: voices.filter((voice) => /^fa(?:-|$)/i.test(voice.lang)).map((voice) => `${voice.name}:${voice.lang}`),
    };
  }
}
