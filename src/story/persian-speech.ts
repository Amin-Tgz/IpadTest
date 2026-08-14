export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
}

const CHILD_FRIENDLY_NAMES = ["darya", "lili", "female", "woman", "زن"];

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

export class PersianSpeech {
  private active: SpeechSynthesisUtterance | null = null;

  get supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  speak(text: string, onEnd: () => void = () => void 0): boolean {
    if (!this.supported || text.trim().length === 0) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fa-IR";
    utterance.rate = 0.9;
    utterance.pitch = 1.18;
    utterance.volume = 1;
    const voice = choosePersianVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    const finish = (): void => {
      if (this.active !== utterance) return;
      this.active = null;
      onEnd();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    this.active = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  stop(): void {
    if (!this.supported) return;
    this.active = null;
    window.speechSynthesis.cancel();
  }
}
