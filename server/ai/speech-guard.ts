export interface SpeechSpan {
  start: number;
  end: number;
}

export interface SpeechInspection {
  durationSeconds: number;
  phrases: SpeechSpan[];
  budgetSeconds: number;
  overBudget: boolean;
  repeatCutSeconds: number | null;
}

const FRAME_SECONDS = 0.02;
const PHRASE_MERGE_GAP_SECONDS = 0.3;
const TAKE_PAUSE_SECONDS = 0.45;
const BALANCED_TAKE_RATIO = 0.7;
const TEXT_SPLIT_TOLERANCE = 0.2;
const LEAD_PAD_SECONDS = 0.08;
const TAIL_PAD_SECONDS = 0.15;

export function speechBudgetSeconds(text: string): number {
  return Math.max(4, 1 + 0.17 * [...text.replace(/\s+/g, " ").trim()].length);
}

export function speechPhrases(pcm: Buffer, sampleRate: number): SpeechSpan[] {
  const frame = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const samples = Math.floor(pcm.length / 2);
  const energy: number[] = [];
  for (let start = 0; start + frame <= samples; start += frame) {
    let sum = 0;
    for (let i = start; i < start + frame; i++) {
      const value = pcm.readInt16LE(i * 2);
      sum += value * value;
    }
    energy.push(Math.sqrt(sum / frame));
  }
  if (energy.length === 0) return [];
  const sorted = [...energy].sort((a, b) => a - b);
  const threshold = Math.max(300, 0.1 * sorted[Math.floor(sorted.length * 0.95)]);
  const raw: SpeechSpan[] = [];
  let open = -1;
  energy.forEach((value, index) => {
    if (value > threshold && open < 0) open = index;
    if (value <= threshold && open >= 0) {
      raw.push({ start: open * FRAME_SECONDS, end: index * FRAME_SECONDS });
      open = -1;
    }
  });
  if (open >= 0) raw.push({ start: open * FRAME_SECONDS, end: energy.length * FRAME_SECONDS });
  const merged: SpeechSpan[] = [];
  for (const span of raw) {
    const last = merged.at(-1);
    if (last && span.start - last.end < PHRASE_MERGE_GAP_SECONDS) last.end = span.end;
    else merged.push({ ...span });
  }
  return merged;
}

/**
 * Character fractions at which the text itself has a sentence break. A pause
 * the voice takes there is phrasing; a balanced pause anywhere else is the
 * TTS model starting the whole line over.
 */
function textSplitFractions(text: string): number[] {
  const chars = [...text.trim()];
  const fractions: number[] = [];
  chars.forEach((char, index) => {
    if (index < chars.length - 1 && /[.!?؟…،,:;]/.test(char)) fractions.push((index + 1) / chars.length);
  });
  return fractions;
}

export function inspectSpeech(pcm: Buffer, sampleRate: number, text: string): SpeechInspection {
  const phrases = speechPhrases(pcm, sampleRate);
  const durationSeconds = pcm.length / 2 / sampleRate;
  const budgetSeconds = speechBudgetSeconds(text);
  if (phrases.length === 0) {
    return { durationSeconds, phrases, budgetSeconds, overBudget: false, repeatCutSeconds: null };
  }
  const first = phrases[0].start;
  const last = phrases[phrases.length - 1].end;
  const splits = textSplitFractions(text);
  let repeatCutSeconds: number | null = null;
  for (let index = 0; index + 1 < phrases.length && repeatCutSeconds === null; index++) {
    const pauseStart = phrases[index].end;
    const pauseEnd = phrases[index + 1].start;
    if (pauseEnd - pauseStart < TAKE_PAUSE_SECONDS) continue;
    const head = pauseStart - first;
    const tail = last - pauseEnd;
    if (Math.min(head, tail) / Math.max(head, tail) < BALANCED_TAKE_RATIO) continue;
    const headFraction = head / (head + tail);
    if (splits.some((fraction) => Math.abs(fraction - headFraction) <= TEXT_SPLIT_TOLERANCE)) continue;
    repeatCutSeconds = pauseStart;
  }
  return {
    durationSeconds,
    phrases,
    budgetSeconds,
    overBudget: last - first > budgetSeconds,
    repeatCutSeconds: repeatCutSeconds ?? extraTailCut(phrases, text),
  };
}

const SPOKEN_SECONDS_PER_LETTER = 0.09;

function letters(text: string): string {
  return text.replace(/[\s.!?؟…،,:;«»"'‌]/g, "");
}

/**
 * A short sound after the last full phrase that the text's final clause
 * cannot account for: the model echoing its opening «اِ»/«اوه» after the
 * sentence, or adding a word after a one-word interjection.
 */
function extraTailCut(phrases: SpeechSpan[], text: string): number | null {
  if (phrases.length < 2) return null;
  const words = text.trim().split(/\s+/).filter((word) => letters(word).length > 0);
  if (words.length <= 1) return phrases[0].end;
  const tail = phrases[phrases.length - 1];
  const chars = [...text.trim()];
  let lastBreak = -1;
  chars.forEach((char, index) => {
    if (index < chars.length - 1 && /[.!?؟…،,:;]/.test(char)) lastBreak = index;
  });
  const expectedTail = [...letters(chars.slice(lastBreak + 1).join(""))].length * SPOKEN_SECONDS_PER_LETTER;
  const tailSeconds = tail.end - tail.start;
  return tailSeconds < 0.6 && tailSeconds < expectedTail * 0.4 ? phrases[phrases.length - 2].end : null;
}

export function isCleanSpeech(inspection: SpeechInspection): boolean {
  return !inspection.overBudget && inspection.repeatCutSeconds === null;
}

/**
 * Keeps exactly one take of the line: trims the silent lead-in/tail and, when
 * the model repeated or rambled, cuts at the end of the first take or at the
 * last phrase that fits the text's duration budget.
 */
export function trimSpeech(pcm: Buffer, sampleRate: number, inspection: SpeechInspection): Buffer {
  const { phrases } = inspection;
  if (phrases.length === 0) return pcm;
  const speechStart = phrases[0].start;
  let speechEnd = inspection.repeatCutSeconds ?? phrases[phrases.length - 1].end;
  const limit = speechStart + inspection.budgetSeconds;
  if (speechEnd > limit) {
    const fitting = phrases.filter((phrase) => phrase.end <= limit).at(-1);
    speechEnd = fitting ? fitting.end : limit;
  }
  const startSample = Math.max(0, Math.floor((speechStart - LEAD_PAD_SECONDS) * sampleRate));
  const endSample = Math.min(pcm.length / 2, Math.ceil((speechEnd + TAIL_PAD_SECONDS) * sampleRate));
  const out = Buffer.from(pcm.subarray(startSample * 2, endSample * 2));
  const fadeSamples = Math.min(Math.floor(out.length / 2), Math.round(sampleRate * 0.03));
  const total = out.length / 2;
  for (let i = 0; i < fadeSamples; i++) {
    const index = total - fadeSamples + i;
    out.writeInt16LE(Math.round(out.readInt16LE(index * 2) * (1 - i / fadeSamples)), index * 2);
  }
  return out;
}
