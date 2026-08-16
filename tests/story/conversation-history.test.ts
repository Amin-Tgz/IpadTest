import { describe, expect, it } from "vitest";
import { ConversationHistory } from "../../src/story/conversation-history.js";

describe("ConversationHistory", () => {
  it("restores chat and action facts in order for the next AI turn", () => {
    const history = new ConversationHistory();
    history.append("child", "drawing", "پل کشید");
    history.append("hero", "message", "از پل رد می‌شوم");
    history.append("system", "action", "Hero completed crossing the bridge.");

    const restored = new ConversationHistory();
    restored.restore(history.snapshot());
    expect(restored.forAI().map((entry) => entry.kind)).toEqual(["drawing", "message", "action"]);
    expect(restored.forAI().at(-1)?.text).toContain("completed crossing");
  });

  it("bounds history and normalizes long or multiline text", () => {
    const history = new ConversationHistory();
    for (let index = 0; index < 50; index++) history.append("system", "action", `action\n${index} ${"x".repeat(240)}`);
    const entries = history.snapshot();
    expect(entries).toHaveLength(40);
    expect(entries[0].text).toContain("action 10");
    expect(entries.every((entry) => entry.text.length <= 180 && !entry.text.includes("\n"))).toBe(true);
  });
});
