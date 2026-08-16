export type ConversationRole = "child" | "hero" | "system";
export type ConversationKind = "drawing" | "message" | "action";

export interface ConversationEntry {
  id: string;
  role: ConversationRole;
  kind: ConversationKind;
  text: string;
  createdAt: number;
}

const MAX_ENTRIES = 40;
const MAX_TEXT_LENGTH = 180;

export class ConversationHistory {
  private entries: ConversationEntry[] = [];
  private sequence = 0;

  append(role: ConversationRole, kind: ConversationKind, text: string, createdAt = Date.now()): ConversationEntry | null {
    const normalized = text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
    if (!normalized) return null;
    const entry = { id: `memory_${createdAt.toString(36)}_${++this.sequence}`, role, kind, text: normalized, createdAt };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    return entry;
  }

  restore(entries: ConversationEntry[]): void {
    this.entries = entries
      .filter(isConversationEntry)
      .slice(-MAX_ENTRIES)
      .map((entry) => ({ ...entry, text: entry.text.slice(0, MAX_TEXT_LENGTH) }));
    this.sequence = this.entries.length;
  }

  snapshot(): ConversationEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  forAI(limit = 24): ConversationEntry[] {
    return this.snapshot().slice(-Math.max(1, Math.min(MAX_ENTRIES, limit)));
  }
}

function isConversationEntry(value: unknown): value is ConversationEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ConversationEntry>;
  return (entry.role === "child" || entry.role === "hero" || entry.role === "system")
    && (entry.kind === "drawing" || entry.kind === "message" || entry.kind === "action")
    && typeof entry.id === "string"
    && typeof entry.text === "string"
    && Number.isFinite(entry.createdAt);
}
