import type { MotionId } from "../animation/motion-clips.js";
import type { HeroVoicePreset } from "../character/living-line-hero.js";

export type QuestState =
  | "DORMANT"
  | "SPAWN"
  | "AWAIT_SHOES"
  | "EQUIP_SHOES"
  | "WALK_TO_POND"
  | "REQUEST_TOOL"
  | "AWAIT_TOOL"
  | "EQUIP_TOOL"
  | "FISHING"
  | "ENDING";

export interface DialogueLine {
  bubble: string;
  spoken: string;
  emotion: HeroVoicePreset;
  audioUrl?: string;
  motion?: MotionId;
}

export type QuestEvent =
  | { type: "hero_ready" }
  | { type: "bubble_shown" }
  | {
      type: "drawing_validated";
      action: "equip_shoes" | "equip_tool";
      reactionBubble?: string;
      reactionSpoken?: string;
      emotion?: HeroVoicePreset;
    }
  | { type: "drawing_invalid"; message?: string }
  | { type: "walk_complete" }
  | { type: "fish_sequence_done" };

export type StoryCommand =
  | ({ type: "bubble" } & DialogueLine)
  | { type: "anim"; clip: MotionId; loop?: boolean }
  | { type: "await_drawing"; goalId: string }
  | { type: "attach_shoes" }
  | { type: "start_walk" }
  | { type: "reach_pond" }
  | { type: "attach_rod" }
  | { type: "cast_sequence" }
  | { type: "ending"; text: string };

export interface QuestDefinition {
  id: string;
  prompt: string;
  requests: DialogueLine[];
  acceptedCategories: string[];
  targetBones: string[];
  successAction: "equip_then_walk" | "equip_then_cast";
}

export const QUESTS: Record<string, QuestDefinition> = {
  draw_shoes: {
    id: "draw_shoes",
    prompt: "The child should draw two shoes, boots, skates, or slippers for the fixed hero, one near each foot.",
    requests: [
      { emotion: "protesting", motion: "protest", audioUrl: "/audio/hero/shoes-protest.pwa", bubble: "اِ! این خط برای پای برهنه‌ام خیلی زبره.", spoken: "اِ! این خط برای پای برهنه‌ام خیلی زبره." },
      { emotion: "curious", motion: "confused", audioUrl: "/audio/hero/shoes-request.pwa", bubble: "دو تا کفش برام می‌کشی؟ یکی برای هر پا.", spoken: "هوم... دو تا کفش برام می‌کشی؟ یکی برای هر پا." },
    ],
    acceptedCategories: ["shoe", "boot", "skate", "slipper"],
    targetBones: ["left_foot", "right_foot"],
    successAction: "equip_then_walk",
  },
  draw_fishing_tool: {
    id: "draw_fishing_tool",
    prompt: "The child should draw a fishing rod, net, spear, or magnet the fixed hero can hold in the right hand.",
    requests: [
      { emotion: "curious", motion: "stop_at_pond", audioUrl: "/audio/hero/pond-notice.pwa", bubble: "اوه! توی برکه یک چیزی تکان خورد.", spoken: "اوه! توی برکه یک چیزی تکان خورد." },
      { emotion: "protesting", motion: "protest", audioUrl: "/audio/hero/tool-request.pwa", bubble: "با دست خالی که نمی‌شه! یک ابزار برام بکش.", spoken: "اِ... با دست خالی که نمی‌شه! یک ابزار برام بکش." },
    ],
    acceptedCategories: ["fishing_rod", "net", "spear", "magnet"],
    targetBones: ["right_hand"],
    successAction: "equip_then_cast",
  },
};

const SHOES_FAILURES = [
  "هوم... پای دیگه‌ام هم کفش می‌خواد.",
  "اِ، این یکی کمی از پام دوره.",
  "این کفشه یا سیب‌زمینی؟ یک بند هم براش می‌کشی؟",
];
const TOOL_FAILURES = [
  "هوم... گرفتن ماهی با این یکی سخت می‌شه.",
  "اِ؟ یک دسته یا قلاب هم بهش اضافه کن.",
];

function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

export class QuestEngine {
  state: QuestState = "DORMANT";
  onCommand: (command: StoryCommand) => void = () => void 0;
  private bubbleQueue: DialogueLine[] = [];
  private pendingDone: (() => void) | null = null;

  restore(state: QuestState): void {
    this.state = state;
    this.bubbleQueue = [];
    this.pendingDone = null;
  }

  trigger(event: QuestEvent): void {
    switch (this.state) {
      case "DORMANT":
        if (event.type === "hero_ready") {
          this.state = "SPAWN";
          this.queueBubbles(QUESTS.draw_shoes.requests.map((line, index) => index === 0 ? { ...line, motion: "spawn" } : line), () => {
            this.state = "AWAIT_SHOES";
            this.command({ type: "await_drawing", goalId: "draw_shoes" });
          });
        }
        break;

      case "SPAWN":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;

      case "AWAIT_SHOES":
        if (event.type === "drawing_validated" && event.action === "equip_shoes") {
          this.state = "EQUIP_SHOES";
          this.command({ type: "attach_shoes" });
          this.queueBubbles([
            {
              bubble: event.reactionBubble ?? "آها! این شد یک کفش حسابی؛ بریم!",
              spoken: event.reactionSpoken ?? "آها! این شد یک کفش حسابی؛ بریم!",
              emotion: event.emotion ?? "delighted",
              motion: "happy",
            },
          ], () => {
            this.command({ type: "start_walk" });
            this.state = "WALK_TO_POND";
          });
        } else if (event.type === "drawing_invalid") {
          const text = event.message ?? pick(SHOES_FAILURES);
          this.command({ type: "bubble", bubble: text, spoken: text, emotion: "confused" });
        }
        break;

      case "EQUIP_SHOES":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;

      case "WALK_TO_POND":
        if (event.type === "walk_complete") {
          this.state = "REQUEST_TOOL";
          this.queueBubbles(QUESTS.draw_fishing_tool.requests, () => {
            this.state = "AWAIT_TOOL";
            this.command({ type: "await_drawing", goalId: "draw_fishing_tool" });
          });
        }
        break;

      case "REQUEST_TOOL":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;

      case "AWAIT_TOOL":
        if (event.type === "drawing_validated" && event.action === "equip_tool") {
          this.state = "EQUIP_TOOL";
          this.command({ type: "attach_rod" });
          this.queueBubbles([
            {
              bubble: event.reactionBubble ?? "آها! حالا ببین چطور ماهی می‌گیرم!",
              spoken: event.reactionSpoken ?? "آها! حالا ببین چطور ماهی می‌گیرم!",
              emotion: event.emotion ?? "delighted",
            },
          ], () => {
            this.command({ type: "cast_sequence" });
            this.state = "FISHING";
          });
        } else if (event.type === "drawing_invalid") {
          const text = event.message ?? pick(TOOL_FAILURES);
          this.command({ type: "bubble", bubble: text, spoken: text, emotion: "confused" });
        }
        break;

      case "EQUIP_TOOL":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;

      case "FISHING":
        if (event.type === "fish_sequence_done") {
          this.state = "ENDING";
          this.queueBubbles([
            { bubble: "این ماهی از کفش‌هام هم کوچیک‌تره!", spoken: "اِ؟ این ماهی از کفش‌هام هم کوچیک‌تره!", emotion: "protesting" },
            { bubble: "آها! حالا هرچی دوست داری بکش؛ من هم می‌آم.", spoken: "آها! حالا هرچی دوست داری بکش؛ من هم می‌آم.", emotion: "delighted" },
          ], () => this.command({ type: "ending", text: "حالا نوبت دنیای توست." }));
        }
        break;

      case "ENDING":
        if (event.type === "bubble_shown") this.advanceBubbles();
        break;
    }
  }

  private queueBubbles(lines: DialogueLine[], onDone: () => void): void {
    this.bubbleQueue = lines.map((line) => ({ ...line }));
    this.pendingDone = onDone;
    this.emitNextBubble();
  }

  private emitNextBubble(): void {
    const line = this.bubbleQueue.shift();
    if (!line) {
      const done = this.pendingDone;
      this.pendingDone = null;
      done?.();
      return;
    }
    this.command({ type: "bubble", ...line });
  }

  private advanceBubbles(): void {
    this.emitNextBubble();
  }

  private command(command: StoryCommand): void {
    this.onCommand(command);
  }
}
