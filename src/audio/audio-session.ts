export type PlaybackSessionResult = "audio-session" | "silent-element" | "unsupported";

interface AudioSessionLike {
  type: string;
}

interface NavigatorLike {
  audioSession?: AudioSessionLike;
}

interface SilentElementLike {
  src: string;
  loop: boolean;
  preload: string;
  paused: boolean;
  setAttribute(name: string, value: string): void;
  play(): Promise<void> | void;
  pause(): void;
}

interface DocumentLike {
  createElement(tag: "audio"): SilentElementLike;
  addEventListener?(type: "visibilitychange", listener: () => void): void;
  visibilityState?: string;
}

let silentElement: SilentElementLike | null = null;

/**
 * iPadOS plays Web Audio through an "ambient" session that Silent mode mutes:
 * the context reports `running` and every clip "plays", yet nothing is heard.
 * HTML media uses a "playback" session instead. Ask for that session through
 * the Audio Session API, or on older Safari hold it with a silent looping
 * <audio> element. Must be called from inside a user gesture.
 */
export function preferPlaybackSession(
  nav: NavigatorLike = globalThis.navigator as unknown as NavigatorLike,
  doc: DocumentLike | undefined = globalThis.document as unknown as DocumentLike | undefined,
): PlaybackSessionResult {
  const session = nav?.audioSession;
  if (session) {
    try {
      if (session.type !== "playback") session.type = "playback";
      if (session.type === "playback") return "audio-session";
    } catch {
      void 0;
    }
  }
  if (!doc) return "unsupported";
  if (!silentElement) {
    const element = doc.createElement("audio");
    element.src = SILENT_WAV_DATA_URI;
    element.loop = true;
    element.preload = "auto";
    element.setAttribute("playsinline", "");
    element.setAttribute("aria-hidden", "true");
    silentElement = element;
    doc.addEventListener?.("visibilitychange", () => {
      if (!silentElement) return;
      if (doc.visibilityState === "hidden") silentElement.pause();
      else if (silentElement.paused) void Promise.resolve(silentElement.play()).catch(() => void 0);
    });
  }
  try {
    void Promise.resolve(silentElement.play()).catch(() => void 0);
  } catch {
    return "unsupported";
  }
  return "silent-element";
}

export function playbackSessionType(nav: NavigatorLike = globalThis.navigator as unknown as NavigatorLike): string {
  return nav?.audioSession?.type ?? (silentElement ? "silent-element" : "unsupported");
}

export function resetPlaybackSessionForTests(): void {
  silentElement = null;
}

function silentWavDataUri(): string {
  const sampleRate = 8000;
  const samples = sampleRate / 4;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const SILENT_WAV_DATA_URI = silentWavDataUri();
