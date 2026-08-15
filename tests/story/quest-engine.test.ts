import { describe, expect, it } from "vitest";
import { QuestEngine, type StoryCommand } from "../../src/story/quest-engine.js";

function collectCommands(engine: QuestEngine): StoryCommand[] {
  const commands: StoryCommand[] = [];
  engine.onCommand = (command) => commands.push(command);
  return commands;
}

describe("QuestEngine", () => {
  it("runs the full story to the ending", () => {
    const engine = new QuestEngine();
    const commands = collectCommands(engine);

    engine.trigger({ type: "hero_ready" });
    expect(commands[0]).toMatchObject({ type: "anim", clip: "spawn" });
    expect(commands[1]).toMatchObject({ type: "bubble" });

    engine.trigger({ type: "bubble_shown" });
    engine.trigger({ type: "bubble_shown" });
    const awaitCmd = commands.find((c) => c.type === "await_drawing");
    expect(awaitCmd).toMatchObject({ type: "await_drawing", goalId: "draw_shoes" });
    expect(engine.state).toBe("AWAIT_SHOES");

    engine.trigger({ type: "drawing_validated", action: "equip_shoes" });
    expect(commands.some((c) => c.type === "attach_shoes")).toBe(true);
    engine.trigger({ type: "bubble_shown" });
    expect(commands.some((c) => c.type === "start_walk")).toBe(true);
    expect(engine.state).toBe("WALK_TO_POND");

    engine.trigger({ type: "walk_complete" });
    expect(engine.state).toBe("REQUEST_TOOL");
    engine.trigger({ type: "bubble_shown" });
    engine.trigger({ type: "bubble_shown" });
    engine.trigger({ type: "bubble_shown" });
    expect(engine.state).toBe("AWAIT_TOOL");
    expect(commands.some((c) => c.type === "await_drawing" && c.goalId === "draw_fishing_tool")).toBe(true);

    engine.trigger({ type: "drawing_validated", action: "equip_tool" });
    expect(commands.some((c) => c.type === "attach_rod")).toBe(true);
    engine.trigger({ type: "bubble_shown" });
    expect(commands.some((c) => c.type === "cast_sequence")).toBe(true);
    expect(engine.state).toBe("FISHING");

    engine.trigger({ type: "fish_sequence_done" });
    expect(engine.state).toBe("ENDING");
    engine.trigger({ type: "bubble_shown" });
    engine.trigger({ type: "bubble_shown" });
    engine.trigger({ type: "bubble_shown" });
    expect(commands.some((c) => c.type === "ending")).toBe(true);
  });

  it("stays awaiting shoes when drawing is invalid", () => {
    const engine = new QuestEngine();
    const commands = collectCommands(engine);
    engine.trigger({ type: "hero_ready" });
    engine.trigger({ type: "bubble_shown" });
    engine.trigger({ type: "bubble_shown" });

    engine.trigger({ type: "drawing_invalid", message: "این کفشه یا سیب‌زمینی؟" });
    expect(engine.state).toBe("AWAIT_SHOES");
    expect(commands.some((c) => c.type === "bubble" && c.bubble.includes("سیب‌زمینی"))).toBe(true);
  });

  it("ignores unknown events in states", () => {
    const engine = new QuestEngine();
    collectCommands(engine);
    engine.trigger({ type: "walk_complete" });
    expect(engine.state).toBe("DORMANT");
  });

  it("keeps visible and spoken Persian separate", () => {
    const engine = new QuestEngine();
    const commands = collectCommands(engine);
    engine.trigger({ type: "hero_ready" });
    const line = commands.find((command) => command.type === "bubble");
    expect(line).toMatchObject({ type: "bubble", emotion: "protesting" });
    if (line?.type === "bubble") {
      expect(line.bubble.length).toBeGreaterThan(0);
      expect(line.spoken.length).toBeGreaterThanOrEqual(line.bubble.length);
    }
  });
});
