import { REPAIR_PARTS, partColor, type RepairPart } from "../character/segment-repair.js";

export interface UiOverlayCallbacks {
  onUndo(): void;
  onToolChange(tool: "pen" | "eraser"): void;
  onReview(): void;
  onRevive(): void;
  onSampleDemo(): void;
  onReset(): void;
  onRepair(): void;
  onRepairDone(): void;
  onRepairPartSelect(part: RepairPart): void;
  onStageButtonClick(): void;
  onStartExperience(): void;
  onSpeechDebugTest?(): void;
}

export class UiOverlayManager {
  readonly undoEl: HTMLButtonElement;
  readonly eraserEl: HTMLButtonElement;
  readonly reviewEl: HTMLButtonElement;
  readonly reviveEl: HTMLButtonElement;
  readonly repairEl: HTMLButtonElement;
  readonly repairPaletteEl: HTMLDivElement;
  readonly repairDoneEl: HTMLButtonElement;
  readonly repairPartButtons = new Map<RepairPart, HTMLButtonElement>();
  readonly sampleDemoEl: HTMLButtonElement;
  readonly resetEl: HTMLButtonElement;
  readonly stageButton: HTMLButtonElement;
  readonly stageTitleEl: HTMLDivElement;
  readonly startExperienceEl: HTMLButtonElement;
  readonly speechDebugEl: HTMLButtonElement | null = null;

  private activeTool: "pen" | "eraser" = "pen";

  constructor(
    private readonly container: HTMLElement,
    callbacks: UiOverlayCallbacks,
    options: { speechDebugEnabled: boolean },
  ) {
    // 1. Undo button
    this.undoEl = this.createButton({
      id: "undo-btn",
      title: "پاک کردن آخرین خط",
      html: `${this.controlIcon("undo")}<span style="font-size:12px;font-weight:600">واگرد</span>`,
      style: "top:max(94px, env(safe-area-inset-top));left:max(14px, env(safe-area-inset-left));",
      onClick: () => callbacks.onUndo(),
    });

    // 2. Eraser button
    this.eraserEl = this.createButton({
      id: "eraser-btn",
      title: "پاک‌کن",
      html: `${this.controlIcon("eraser")}<span style="font-size:12px;font-weight:600">پاک‌کن</span>`,
      style: "top:max(172px, env(safe-area-inset-top));left:max(14px, env(safe-area-inset-left));",
      onClick: () => {
        this.activeTool = this.activeTool === "eraser" ? "pen" : "eraser";
        this.updateToolAppearance(this.activeTool);
        callbacks.onToolChange(this.activeTool);
      },
    });

    // 3. Review CTA button (▶ ببین نقاشی‌مو)
    this.reviewEl = document.createElement("button");
    this.reviewEl.id = "review-cta-btn";
    this.reviewEl.style.cssText = [
      "position:absolute",
      "z-index:35",
      "bottom:max(28px, env(safe-area-inset-bottom))",
      "left:50%",
      "transform:translateX(-50%)",
      "color:#103B46",
      "background:#D8F6FF",
      "font-size:19px",
      "font-weight:800",
      "padding:14px 38px",
      "min-height:58px",
      "border-radius:999px",
      "border:2.5px solid rgba(247,245,238,0.85)",
      "direction:rtl",
      "opacity:0",
      "transition:opacity 220ms, transform 160ms",
      "pointer-events:none",
      "touch-action:manipulation",
      "box-shadow:0 8px 24px rgba(0,0,0,0.35)",
    ].join(";");
    this.reviewEl.textContent = "▶ ببین نقاشی‌مو";
    this.reviewEl.title = "حالا نقاشی من را ببین";
    this.reviewEl.addEventListener("click", () => callbacks.onReview());
    this.container.appendChild(this.reviewEl);

    // 4. Revive button
    this.reviveEl = document.createElement("button");
    this.reviveEl.style.cssText = [
      "position:absolute",
      "z-index:35",
      "bottom:max(28px, env(safe-area-inset-bottom))",
      "left:50%",
      "transform:translateX(-50%)",
      "color:#F7F5EE",
      "background:rgba(16,59,70,0.92)",
      "font-size:18px",
      "font-weight:700",
      "padding:12px 32px",
      "min-height:56px",
      "border-radius:999px",
      "border:1.5px solid rgba(247,245,238,0.5)",
      "direction:rtl",
      "opacity:0",
      "transition:opacity 300ms",
      "pointer-events:none",
    ].join(";");
    this.reviveEl.textContent = "زنده‌اش کن";
    this.reviveEl.addEventListener("click", () => callbacks.onRevive());
    this.container.appendChild(this.reviveEl);

    // 5. Stage Title & Stage Button
    this.stageTitleEl = document.createElement("div");
    this.stageTitleEl.style.cssText = [
      "position:absolute",
      "z-index:35",
      "top:max(22px, env(safe-area-inset-top))",
      "left:50%",
      "transform:translateX(-50%)",
      "color:#F7F5EE",
      "font-size:19px",
      "font-weight:700",
      "text-align:center",
      "direction:rtl",
      "opacity:0",
      "transition:opacity 200ms",
      "pointer-events:none",
      "text-shadow:0 2px 10px rgba(0,0,0,0.5)",
    ].join(";");
    this.container.appendChild(this.stageTitleEl);

    this.stageButton = document.createElement("button");
    this.stageButton.style.cssText = [
      "position:absolute",
      "z-index:35",
      "bottom:max(28px, env(safe-area-inset-bottom))",
      "left:50%",
      "transform:translateX(-50%)",
      "color:#103B46",
      "background:#D8F6FF",
      "font-size:18px",
      "font-weight:700",
      "padding:12px 34px",
      "min-height:54px",
      "border-radius:999px",
      "border:2px solid rgba(247,245,238,0.7)",
      "direction:rtl",
      "opacity:0",
      "transition:opacity 200ms",
      "pointer-events:none",
    ].join(";");
    this.stageButton.textContent = "ادامه";
    this.stageButton.addEventListener("click", () => callbacks.onStageButtonClick());
    this.container.appendChild(this.stageButton);

    // 6. Repair controls
    this.repairEl = document.createElement("button");
    this.repairEl.style.cssText = [
      "position:absolute", "z-index:35", "top:max(18px, env(safe-area-inset-top))",
      "right:max(18px, env(safe-area-inset-right))", "padding:10px 18px", "min-height:48px",
      "border-radius:999px", "border:1px solid rgba(216,246,255,.45)", "background:#103B46",
      "color:#D8F6FF", "font-size:15px", "font-weight:600", "direction:rtl", "opacity:0", "pointer-events:none",
      "touch-action:manipulation", "transition:opacity 220ms",
    ].join(";");
    this.repairEl.textContent = "اصلاح بخش‌های بدن";
    this.repairEl.addEventListener("click", () => callbacks.onRepair());
    this.container.appendChild(this.repairEl);

    this.repairPaletteEl = document.createElement("div");
    this.repairPaletteEl.style.cssText = [
      "position:absolute", "z-index:50", "top:max(14px, env(safe-area-inset-top))", "left:50%",
      "transform:translateX(-50%)", "display:none", "gap:6px", "align-items:center", "flex-wrap:wrap",
      "justify-content:center", "max-width:calc(100vw - 180px)", "padding:8px", "border-radius:18px",
      "background:rgba(5,24,30,.92)", "direction:rtl", "box-shadow:0 8px 30px rgba(0,0,0,0.4)",
    ].join(";");

    const repairLabels: Record<RepairPart, string> = {
      head: "سر", torso: "بدن", left_arm: "بازوی چپ", right_arm: "بازوی راست",
      left_hand: "دست چپ", right_hand: "دست راست", left_fingers: "انگشت‌های چپ", right_fingers: "انگشت‌های راست",
      left_leg: "پای چپ", right_leg: "پای راست", left_foot: "کف پای چپ", right_foot: "کف پای راست",
      left_eyebrow: "ابروی چپ", right_eyebrow: "ابروی راست",
    };

    for (const part of REPAIR_PARTS) {
      const button = document.createElement("button");
      button.textContent = repairLabels[part];
      button.style.cssText = `min-height:44px;padding:8px 12px;border-radius:12px;border:3px solid ${partColor(part)};background:#103B46;color:#F7F5EE;font-size:14px;font-weight:600;touch-action:manipulation`;
      button.addEventListener("click", () => {
        callbacks.onRepairPartSelect(part);
        this.repairPartButtons.forEach((item, key) => {
          item.style.background = key === part ? "#D8F6FF" : "#103B46";
          item.style.color = key === part ? "#103B46" : "#F7F5EE";
        });
      });
      this.repairPartButtons.set(part, button);
      this.repairPaletteEl.appendChild(button);
    }

    this.repairDoneEl = document.createElement("button");
    this.repairDoneEl.textContent = "تمام شد";
    this.repairDoneEl.style.cssText = "min-height:44px;padding:8px 18px;border-radius:12px;border:0;background:#F7F5EE;color:#103B46;font-size:14px;font-weight:700;touch-action:manipulation";
    this.repairDoneEl.addEventListener("click", () => callbacks.onRepairDone());
    this.repairPaletteEl.appendChild(this.repairDoneEl);
    this.container.appendChild(this.repairPaletteEl);

    // 7. Sample demo button
    this.sampleDemoEl = document.createElement("button");
    this.sampleDemoEl.style.cssText = [
      "position:absolute",
      "z-index:35",
      "bottom:max(28px, env(safe-area-inset-bottom))",
      "left:50%",
      "transform:translateX(-50%)",
      "color:rgba(247,245,238,0.75)",
      "background:transparent",
      "font-size:13px",
      "padding:6px 16px",
      "border-radius:999px",
      "border:1px dashed rgba(247,245,238,0.35)",
      "direction:rtl",
      "opacity:0",
      "transition:opacity 220ms",
      "pointer-events:none",
    ].join(";");
    this.sampleDemoEl.textContent = "یا استفاده از نقاشی نمونه";
    this.sampleDemoEl.addEventListener("click", () => callbacks.onSampleDemo());
    this.container.appendChild(this.sampleDemoEl);

    // 8. Reset button
    this.resetEl = document.createElement("button");
    this.resetEl.style.cssText = [
      "position:absolute",
      "z-index:45",
      "top:max(14px, env(safe-area-inset-top))",
      "left:max(14px, env(safe-area-inset-left))",
      "width:72px",
      "height:68px",
      "border-radius:16px",
      "border:2px solid rgba(247,245,238,0.75)",
      "background:#103B46",
      "color:#F7F5EE",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:3px",
      "opacity:0.92",
      "transition:opacity 200ms",
      "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
    ].join(";");
    this.resetEl.innerHTML = `${this.controlIcon("restart")}<span style="font-size:11px;font-weight:600">شروع دوباره</span>`;
    this.resetEl.title = "شروع دوباره";
    this.resetEl.addEventListener("click", () => callbacks.onReset());
    this.container.appendChild(this.resetEl);

    // 9. Start Experience Button (iOS Web Audio Unlock)
    this.startExperienceEl = document.createElement("button");
    this.startExperienceEl.textContent = "شروع";
    this.startExperienceEl.title = "شروع داستان";
    this.startExperienceEl.setAttribute("aria-label", "شروع داستان");
    this.startExperienceEl.style.cssText = [
      "position:absolute",
      "z-index:100",
      "left:50%",
      "top:50%",
      "transform:translate(-50%,-50%)",
      "min-width:136px",
      "min-height:60px",
      "padding:12px 28px",
      "border-radius:999px",
      "border:3px solid #F7F5EE",
      "background:#103B46",
      "color:#F7F5EE",
      "font-size:23px",
      "font-weight:800",
      "cursor:pointer",
      "box-shadow:0 12px 36px rgba(0,0,0,.4)",
    ].join(";");
    this.startExperienceEl.addEventListener("click", () => callbacks.onStartExperience());
    this.container.appendChild(this.startExperienceEl);

    // 10. Speech debug button
    if (options.speechDebugEnabled && callbacks.onSpeechDebugTest) {
      this.speechDebugEl = document.createElement("button");
      this.speechDebugEl.textContent = "🔊 تست صدا";
      this.speechDebugEl.title = "تست مستقیم صدای مرورگر";
      this.speechDebugEl.style.cssText = [
        "position:absolute", "z-index:60", "top:max(14px, env(safe-area-inset-top))", "right:14px",
        "min-height:52px", "padding:10px 18px", "border-radius:14px", "border:2px solid #D8F6FF",
        "background:#103B46", "color:#F7F5EE", "font-size:16px", "font-weight:700", "direction:rtl",
      ].join(";");
      this.speechDebugEl.addEventListener("click", () => callbacks.onSpeechDebugTest?.());
      this.container.appendChild(this.speechDebugEl);
    }
  }

  setTool(tool: "pen" | "eraser"): void {
    this.activeTool = tool;
    this.updateToolAppearance(tool);
  }

  updateToolAppearance(tool: "pen" | "eraser"): void {
    this.eraserEl.style.background = tool === "eraser" ? "#F7F5EE" : "rgba(16,59,70,0.88)";
    this.eraserEl.style.color = tool === "eraser" ? "#103B46" : "#F7F5EE";
  }

  hideReview(): void {
    this.reviewEl.hidden = true;
    this.reviewEl.style.opacity = "0";
    this.reviewEl.style.pointerEvents = "none";
    this.reviewEl.tabIndex = -1;
    this.reviewEl.setAttribute("aria-hidden", "true");
  }

  showReview(): void {
    this.reviewEl.hidden = false;
    this.reviewEl.style.opacity = "1";
    this.reviewEl.style.pointerEvents = "auto";
    this.reviewEl.tabIndex = 0;
    this.reviewEl.setAttribute("aria-hidden", "false");
  }

  hideRevive(): void {
    this.reviveEl.style.opacity = "0";
    this.reviveEl.style.pointerEvents = "none";
  }

  hideSampleDemo(): void {
    this.sampleDemoEl.style.opacity = "0";
    this.sampleDemoEl.style.pointerEvents = "none";
  }

  hideStageButton(): void {
    this.stageButton.style.opacity = "0";
    this.stageButton.style.pointerEvents = "none";
  }

  private createButton(config: { id: string; title: string; html: string; style: string; onClick: () => void }): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = config.id;
    btn.title = config.title;
    btn.style.cssText = [
      "position:absolute",
      "z-index:45",
      config.style,
      "width:72px",
      "height:68px",
      "border-radius:16px",
      "border:2px solid rgba(247,245,238,0.75)",
      "background:rgba(16,59,70,0.88)",
      "color:#F7F5EE",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:3px",
      "opacity:0.92",
      "transition:opacity 200ms, transform 120ms, background 160ms, color 160ms",
      "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
      "touch-action:manipulation",
    ].join(";");
    btn.innerHTML = config.html;
    btn.addEventListener("click", config.onClick);
    this.container.appendChild(btn);
    return btn;
  }

  private controlIcon(kind: "restart" | "undo" | "eraser"): string {
    const paths = {
      restart: '<path d="M20 7a8 8 0 1 0 2 8"/><path d="M20 3v4h-4"/>',
      undo: '<path d="M9 8 4 12l5 4"/><path d="M5 12h9a6 6 0 0 1 6 6"/>',
      eraser: '<path d="m7 18-3-3 9-9a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-7 7Z"/><path d="M10 9l5 5M7 18h13"/>',
    };
    return `<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`;
  }
}
