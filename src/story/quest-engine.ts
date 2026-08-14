import type { MotionId } from "../animation/motion-clips.js";

export type QuestState =
  | "DRAW_CHARACTER"
  | "SPAWN"
  | "REQUEST_SHOES"
  | "AWAIT_SHOES"
  | "EQUIP_SHOES"
  | "WALK_TO_POND"
  | "REQUEST_TOOL"
  | "AWAIT_TOOL"
  | "EQUIP_TOOL"
  | "FISHING"
  | "ENDING";

export type QuestEvent =
  | { type: "character_alive" }
  | { type: "bubble_shown" }
  | { type: "drawing_validated"; action: "equip_shoes" | "equip_tool" | null; reactionBubble?: string; emotion?: string }
  | { type: "drawing_invalid"; message?: string }
  | { type: "equip_complete" }
  | { type: "walk_complete" }
  | { type: "fish_sequence_done" };

export type StoryCommand =
  | { type: "bubble"; text: string; emotion: string }
  | { type: "anim"; clip: MotionId; loop?: boolean }
  | { type: "await_drawing"; goalId: string }
  | { type: "attach_shoes" }
  | { type: "start_walk" }
  | { type: "reach_pond" }
  | { type: "attach_rod" }
  | { type: "cast_sequence" }
  | { type: "fish_jump" }
  | { type: "fish_talk"; text: string }
  | { type: "ending"; text: string };

export interface QuestDefinition {
  id: string;
  requests: Array<{ emotion: string; bubble: string }>;
  acceptedCategories: string[];
  targetBones: string[];
  successAction: "equip_then_walk" | "equip_then_cast";
}

export const QUESTS: Record<string, QuestDefinition> = {
  draw_shoes: {
    id: "draw_shoes",
    requests: [
      { emotion: "uncomfortable", bubble: "این خط برای پای برهنه‌ام خیلی زبره…" },
      { emotion: "hopeful", bubble: "می‌تونی برام کفش بکشی؟" },
    ],
    acceptedCategories: ["shoe", "boot", "skate", "slipper"],
    targetBones: ["left_foot", "right_foot"],
    successAction: "equip_then_walk",
  },
  draw_fishing_tool: {
    id: "draw_fishing_tool",
    requests: [
      { emotion: "curious", bubble: "ته برکه یه ماهی جر می‌خوره…" },
      { emotion: "curious", bubble: "یک قلاب می‌خوام!" },
    ],
    acceptedCategories: ["fishing_rod", "net"],
    targetBones: ["right_hand"],
    successAction: "equip_then_cast",
  },
};

const SHOES_FAILURES = [
  "پای دیگه‌ام داره حسودی می‌کنه.",
  "فکر کنم باید یکم نزدیک‌تر پام باشه.",
  "این کفشه یا سیب‌زمینی؟ یه بند هم براش می‌کشی؟",
];
const TOOL_FAILURES = [
  "هوم… با این که قلاب درست کنیم، سخت می‌شه.",
  "این چیزی بود یا یک خط اشتباهی؟",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class QuestEngine {
  state: QuestState = "DRAW_CHARACTER";
  onCommand: (command: StoryCommand) => void = () => void 0;
  private bubbleQueue: string[] = [];
  private bubbleEmotions: string[] = [];

  trigger(event: QuestEvent): void {
    switch (this.state) {
      case "DRAW_CHARACTER":
        if (event.type === "character_alive") {
          this.state = "SPAWN";
          this.playAnim("spawn");
          this.queueBubbles(
            QUESTS.draw_shoes.requests.map((r) => ({ text: r.bubble, emotion: r.emotion })),
            () => {
              this.state = "AWAIT_SHOES";
              this.command({ type: "await_drawing", goalId: "draw_shoes" });
            },
          );
        }
        break;

      case "SPAWN":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;

      case "AWAIT_SHOES":
        if (event.type === "drawing_validated") {
          this.state = "EQUIP_SHOES";
          this.command({ type: "attach_shoes" });
          this.playAnim("happy");
          this.queueBubbles(
            [
              { text: event.reactionBubble ?? "وای! خیلی خوبه! حالا می‌تونم راه برم!", emotion: event.emotion ?? "excited" },
            ],
            () => {
              this.command({ type: "start_walk" });
              this.state = "WALK_TO_POND";
            },
          );
        } else if (event.type === "drawing_invalid") {
          this.command({
            type: "bubble",
            text: event.message ?? pick(SHOES_FAILURES),
            emotion: "confused",
          });
        }
        break;

      case "EQUIP_SHOES":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;

      case "WALK_TO_POND":
        if (event.type === "walk_complete") {
          this.state = "REQUEST_TOOL";
          this.playAnim("stop_at_pond");
          this.queueBubbles(
            [
              { text: "آه… آب! اونجا چیزی پرید!", emotion: "curious" },
              ...QUESTS.draw_fishing_tool.requests.map((r) => ({ text: r.bubble, emotion: r.emotion })),
            ],
            () => {
              this.state = "AWAIT_TOOL";
              this.command({ type: "await_drawing", goalId: "draw_fishing_tool" });
            },
          );
        }
        break;

      case "REQUEST_TOOL":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;

      case "AWAIT_TOOL":
        if (event.type === "drawing_validated") {
          this.state = "EQUIP_TOOL";
          this.command({ type: "attach_rod" });
          this.queueBubbles(
            [
              { text: event.reactionBubble ?? "آفرین! حالا ببین چطور ماهی می‌گیرم!", emotion: event.emotion ?? "excited" },
            ],
            () => {
              this.command({ type: "cast_sequence" });
              this.state = "FISHING";
            },
          );
        } else if (event.type === "drawing_invalid") {
          this.command({
            type: "bubble",
            text: event.message ?? pick(TOOL_FAILURES),
            emotion: "confused",
          });
        }
        break;

      case "EQUIP_TOOL":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;

      case "FISHING":
        if (event.type === "fish_sequence_done") {
          this.state = "ENDING";
          this.queueBubbles(
            [
              { text: "من خیلی کوچیکم!", emotion: "tiny" },
              { text: "…", emotion: "thoughtful" },
              { text: "ادامهٔ این خط را تو می‌کشی.", emotion: "warm" },
            ],
            () => {
              this.command({ type: "ending", text: "" });
            },
          );
        }
        break;

      case "ENDING":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;
    }
  }

  private queueBubbles(
    bubbles: Array<{ text: string; emotion: string }>,
    onDone: () => void,
  ): void {
    this.bubbleQueue = bubbles.map((b) => b.text);
    this.bubbleEmotions = bubbles.map((b) => b.emotion);
    this.pendingDone = onDone;
    this.emitNextBubble();
  }

  private pendingDone: (() => void) | null = null;

  private emitNextBubble(): void {
    const text = this.bubbleQueue.shift();
    const emotion = this.bubbleEmotions.shift() ?? "neutral";
    if (text === undefined) {
      const done = this.pendingDone;
      this.pendingDone = null;
      if (done) done();
      return;
    }
    this.command({ type: "bubble", text, emotion });
  }

  private advanceBubbles(): void {
    this.emitNextBubble();
  }

  private playAnim(clip: MotionId): void {
    this.command({ type: "anim", clip });
  }

  private command(command: StoryCommand): void {
    this.onCommand(command);
  }
}
