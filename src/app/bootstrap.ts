import { AppStateController } from "./app-state.js";
import { StrokeStore } from "../drawing/stroke-store.js";
import { StrokeRenderer } from "../drawing/stroke-renderer.js";
import { PointerInput, type PencilEvent } from "../drawing/pointer-input.js";
import { Camera } from "../world/camera.js";
import { GroundPath } from "../world/ground-path.js";
import { SpeechBubble } from "../story/speech-bubble.js";
import { buildSampleCharacter } from "./sample-character.js";
import { AnalysisSpike } from "../character/analysis-spike.js";
import { PALETTE, BASE_LINE_WIDTH, BASE_LINE_Y_RATIO, INACTIVITY_MS } from "./constants.js";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("missing #app element");

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  return ctx;
}

const canvas = document.createElement("canvas");
appEl.appendChild(canvas);
const ctx = getContext(canvas);

const appState = new AppStateController();
const store = new StrokeStore();
const camera = new Camera();
const renderer = new StrokeRenderer();
const bubble = new SpeechBubble(appEl);
const spike = new AnalysisSpike(
  store,
  camera,
  () => {
    const { viewportWidth, viewportHeight } = appState.get();
    return { width: viewportWidth, height: viewportHeight };
  },
  () => groundPath,
  bubble,
);

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  appState.setViewport(w, h);
  rebuildWorld();
}

function rebuildWorld(): void {
  const { viewportWidth: w, viewportHeight: h } = appState.get();
  const baselineY = Math.round(h * BASE_LINE_Y_RATIO);
  groundPath = new GroundPath([
    { x: 0, y: baselineY },
    { x: w * 3, y: baselineY },
  ]);
  if (!sampleBuilt) {
    sampleBuilt = true;
    buildSampleCharacter(store, w * 0.34, baselineY);
  }
}

let groundPath = new GroundPath([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
let sampleBuilt = false;

let lastPencil: PencilEvent | null = null;
let pencilDown = false;
let idleTimer: number | null = null;

function showIdleHint(): void {
  if (hintVisible || store.count() > 1) return;
  hintVisible = true;
  hintEl.style.opacity = "1";
}

const hintEl = document.createElement("div");
hintEl.style.cssText = [
  "position:absolute",
  "z-index:30",
  "top:max(18px, env(safe-area-inset-top))",
  "left:50%",
  "transform:translateX(-50%)",
  "color:#F7F5EE",
  "font-family:system-ui,'Segoe UI',Tahoma,sans-serif",
  "font-size:15px",
  "letter-spacing:0.3px",
  "background:rgba(16,59,70,0.75)",
  "padding:8px 18px",
  "border-radius:999px",
  "border:1px solid rgba(247,245,238,0.25)",
  "direction:rtl",
  "opacity:0",
  "transition:opacity 400ms",
  "pointer-events:none",
].join(";");
hintEl.textContent = "یک شخصیت روی خط بکش؛ یک سر، دو دست و دو پا…";
appEl.appendChild(hintEl);
let hintVisible = false;

function scheduleIdleAction(): void {
  if (idleTimer !== null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    if (spike.status === "analyzing") return;
    if (spike.userHasDrawn() && spike.status !== "done") {
      reviveEl.style.opacity = "1";
      reviveEl.style.pointerEvents = "auto";
      return;
    }
    const { viewportWidth: w, viewportHeight: h } = appState.get();
    const anchor = camera.worldToScreen({
      x: w * 0.34,
      y: h * BASE_LINE_Y_RATIO - 200,
    });
    bubble.show("این خط برای پای برهنه‌ام خیلی زبره…", anchor);
    window.setTimeout(() => {
      if (bubble.isVisible()) {
        bubble.show("می‌تونی برام کفش بکشی؟", anchor);
      }
    }, 3400);
  }, INACTIVITY_MS);
}

function hideRevive(): void {
  reviveEl.style.opacity = "0";
  reviveEl.style.pointerEvents = "none";
}

const reviveEl = document.createElement("button");
reviveEl.style.cssText = [
  "position:absolute",
  "z-index:35",
  "bottom:max(28px, env(safe-area-inset-bottom))",
  "left:50%",
  "transform:translateX(-50%)",
  "color:#F7F5EE",
  "background:rgba(16,59,70,0.9)",
  "font-family:system-ui,'Segoe UI',Tahoma,sans-serif",
  "font-size:16px",
  "padding:10px 26px",
  "border-radius:999px",
  "border:1px solid rgba(247,245,238,0.4)",
  "direction:rtl",
  "opacity:0",
  "transition:opacity 300ms",
  "pointer-events:none",
].join(";");
reviveEl.textContent = "زنده‌اش کن";
reviveEl.addEventListener("click", () => {
  hideRevive();
  void spike.requestAnalyze(false);
});
appEl.appendChild(reviveEl);

const sampleDemoEl = document.createElement("button");
sampleDemoEl.style.cssText = [
  "position:absolute",
  "z-index:35",
  "bottom:max(28px, env(safe-area-inset-bottom))",
  "left:50%",
  "transform:translateX(-50%)",
  "color:rgba(247,245,238,0.75)",
  "background:transparent",
  "font-family:system-ui,'Segoe UI',Tahoma,sans-serif",
  "font-size:13px",
  "padding:6px 16px",
  "border-radius:999px",
  "border:1px solid rgba(247,245,238,0.2)",
  "direction:rtl",
  "transition:opacity 300ms",
].join(";");
sampleDemoEl.textContent = "تحلیل شخصیت نمونه";
sampleDemoEl.addEventListener("click", () => void spike.requestAnalyze(true));
appEl.appendChild(sampleDemoEl);

const pointer = new PointerInput(canvas, store, camera, {
  onStrokeStart: () => {
    pencilDown = true;
    hintEl.style.opacity = "0";
    hintVisible = false;
    hideRevive();
    sampleDemoEl.style.opacity = "0";
    sampleDemoEl.style.pointerEvents = "none";
    if (bubble.isVisible()) bubble.hide();
    if (idleTimer !== null) window.clearTimeout(idleTimer);
  },
  onStrokeEnd: () => {
    pencilDown = false;
    scheduleIdleAction();
  },
  onPencilMove: (e) => {
    lastPencil = e;
  },
  onPencilDown: (e) => {
    lastPencil = e;
  },
});

function renderFrame(now: number): void {
  const { viewportWidth: w, viewportHeight: h } = appState.get();

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, w, h);

  const poly = groundPath.screenPolyline(camera.state.x);
  ctx.strokeStyle = PALETTE.primaryInk;
  ctx.lineWidth = BASE_LINE_WIDTH + 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  for (const stroke of store.all()) {
    if (stroke.active) renderer.drawStroke(ctx, stroke, camera);
  }

  spike.drawOverlay(ctx, camera);

  if (pencilDown && lastPencil) {
    const sp = camera.worldToScreen(lastPencil);
    const pulse = 0.10 + 0.04 * Math.sin(now / 120);
    const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 16);
    grad.addColorStop(0, `rgba(216,246,255,${pulse})`);
    grad.addColorStop(1, "rgba(216,246,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(renderFrame);
}

appState.subscribe((state) => {
  if (state.mode === "intro" && state.viewportWidth > 0) {
    window.setTimeout(() => {
      if (!hintVisible && store.count() === 0) {
        hintVisible = true;
        hintEl.style.opacity = "1";
      }
    }, 1600);
  }
  if (state.mode === "drawing" && hintVisible) {
    hintEl.style.opacity = "0";
    hintVisible = false;
  }
});

window.addEventListener("resize", resize);
resize();
appState.setMode("intro");
requestAnimationFrame(renderFrame);

window.setTimeout(() => {
  if (!spike.userHasDrawn()) scheduleIdleAction();
}, 4000);

console.log("[pencil-ai] phase 1 bootstrap ready");
