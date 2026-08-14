const MAX_BUBBLE_CHARS = 70;

export class SpeechBubble {
  private el: HTMLDivElement | null = null;
  private tail: HTMLDivElement | null = null;
  private resizeListener = (): void => void 0;
  private thinkingTimer: number | null = null;
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(
    text: string,
    anchorScreen: { x: number; y: number },
    options: { maxWidthPx?: number } = {},
  ): void {
    const maxWidth = options.maxWidthPx ?? 280;
    if (this.el) this.hide();

    this.el = document.createElement("div");
    this.el.textContent = text.slice(0, MAX_BUBBLE_CHARS);
    this.el.style.cssText = [
      "position:absolute",
      "z-index:40",
      `max-width:${maxWidth}px`,
      "padding:10px 14px",
      "border-radius:14px",
      "border:2px solid #F7F5EE",
      "background:rgba(16,59,70,0.92)",
      "color:#F7F5EE",
      "font-family:system-ui,'Segoe UI',Tahoma,sans-serif",
      "font-size:17px",
      "line-height:1.45",
      "direction:rtl",
      "text-align:right",
      "pointer-events:none",
      "white-space:pre-wrap",
      "word-break:break-word",
      "box-shadow:0 6px 24px rgba(0,0,0,0.25)",
      "transform-origin:bottom center",
      "transform:scale(0.6)",
      "opacity:0",
      "transition:transform 240ms cubic-bezier(.2,.9,.3,1.4),opacity 200ms",
    ].join(";");
    this.root.appendChild(this.el);

    this.tail = document.createElement("div");
    this.tail.style.cssText = [
      "position:absolute",
      "bottom:-10px",
      "right:50%",
      "margin-right:-8px",
      "width:16px",
      "height:16px",
      "background:rgba(16,59,70,0.92)",
      "border-right:2px solid #F7F5EE",
      "border-bottom:2px solid #F7F5EE",
      "transform:rotate(45deg)",
      "pointer-events:none",
    ].join(";");
    this.el.appendChild(this.tail);

    this.position(anchorScreen);
    this.resizeListener = () => this.position(anchorScreen);
    window.addEventListener("resize", this.resizeListener);

    requestAnimationFrame(() => {
      if (this.el) {
        this.el.style.transform = "scale(1)";
        this.el.style.opacity = "1";
      }
    });
  }

  hide(): void {
    if (this.thinkingTimer !== null) window.clearInterval(this.thinkingTimer);
    this.thinkingTimer = null;
    window.removeEventListener("resize", this.resizeListener);
    this.el?.remove();
    this.el = null;
    this.tail = null;
  }

  isVisible(): boolean {
    return this.el !== null;
  }

  updateAnchor(anchorScreen: { x: number; y: number }): void {
    this.position(anchorScreen);
  }

  showThinking(anchorScreen: { x: number; y: number }): void {
    this.show("•", anchorScreen, { maxWidthPx: 120 });
    let count = 1;
    this.thinkingTimer = window.setInterval(() => {
      if (!this.el) return;
      count = (count % 3) + 1;
      this.el.firstChild!.textContent = "•".repeat(count);
    }, 360);
  }

  private position(anchorScreen: { x: number; y: number }): void {
    if (!this.el || !this.tail) return;
    const el = this.el;
    el.style.transform = "scale(1)";
    el.style.opacity = "1";
    el.style.visibility = "hidden";
    const rect = el.getBoundingClientRect();
    el.style.visibility = "";

    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const above = anchorScreen.y - rect.height - 26;
    const below = anchorScreen.y + 26;
    const useAbove = above >= 8;

    let left = anchorScreen.x - rect.width / 2;
    left = Math.max(10, Math.min(left, viewport.w - rect.width - 10));

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(useAbove ? above : below)}px`;
    el.style.transformOrigin = useAbove ? "bottom center" : "top center";
    const tailDown = useAbove;
    this.tail.style.top = tailDown ? "auto" : "-10px";
    this.tail.style.bottom = tailDown ? "-10px" : "auto";
    this.tail.style.borderRight = `2px solid #F7F5EE`;
    this.tail.style.borderBottom = `2px solid #F7F5EE`;
    this.tail.style.borderLeft = tailDown ? "none" : "2px solid #F7F5EE";
    this.tail.style.borderTop = tailDown ? "2px solid #F7F5EE" : "none";
    this.tail.style.transform = tailDown ? "rotate(45deg)" : "rotate(-135deg)";
  }
}
