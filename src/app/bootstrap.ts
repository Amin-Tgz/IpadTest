import { AppStateController } from "./app-state.js";
import { StrokeStore } from "../drawing/stroke-store.js";
import { StrokeRenderer } from "../drawing/stroke-renderer.js";
import { PointerInput, type PencilEvent } from "../drawing/pointer-input.js";
import { IdMap } from "../drawing/id-map.js";
import { Camera } from "../world/camera.js";
import { GroundPath } from "../world/ground-path.js";
import { SpeechBubble } from "../story/speech-bubble.js";
import { buildSampleCharacter } from "./sample-character.js";
import { AnalysisSpike } from "../character/analysis-spike.js";
import { JointEditor } from "../character/joint-editor.js";
import { buildManifest } from "../character/character-manifest.js";
import { createSessionStorage } from "../storage/indexed-db.js";
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
const idMap = new IdMap();
const storage = createSessionStorage();

const getViewport = () => {
  const { viewportWidth: width, viewportHeight: height } = appState.get();
  return { width, height };
};

const editor = new JointEditor(store, getViewport);

const spike = new AnalysisSpike(store, camera, getViewport, () => groundPath, bubble);

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

function hideRevive(): void {
  reviveEl.style.opacity = "0";
  reviveEl.style.pointerEvents = "none";
}

function hideSampleDemo(): void {
  sampleDemoEl.style.opacity = "0";
  sampleDemoEl.style.pointerEvents = "none";
}

function hideStageButton(): void {
  stageButton.style.opacity = "0";
  stageButton.style.pointerEvents = "none";
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

const stageTitleEl = document.createElement("div");
stageTitleEl.style.cssText = [
  "position:absolute",
  "z-index:32",
  "top:max(18px, env(safe-area-inset-top))",
  "left:50%",
  "transform:translateX(-50%)",
  "color:#D8F6FF",
  "font-family:system-ui,'Segoe UI',Tahoma,sans-serif",
  "font-size:15px",
  "background:rgba(16,59,70,0.85)",
  "padding:8px 18px",
  "border-radius:999px",
  "border:1px solid rgba(216,246,255,0.3)",
  "direction:rtl",
  "opacity:0",
  "transition:opacity 300ms",
  "pointer-events:none",
].join(";");
appEl.appendChild(stageTitleEl);

const stageButton = document.createElement("button");
stageButton.style.cssText = [
  "position:absolute",
  "z-index:35",
  "bottom:max(28px, env(safe-area-inset-bottom))",
  "left:50%",
  "transform:translateX(-50%)",
  "color:#103B46",
  "background:#F7F5EE",
  "font-family:system-ui,'Segoe UI',Tahoma,sans-serif",
  "font-size:16px",
  "font-weight:600",
  "padding:10px 30px",
  "border-radius:999px",
  "border:none",
  "direction:rtl",
  "opacity:0",
  "transition:opacity 300ms",
  "pointer-events:none",
  "box-shadow:0 6px 20px rgba(0,0,0,0.3)",
].join(";");
appEl.appendChild(stageButton);

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
appEl.appendChild(sampleDemoEl);

const STAGE_LABELS: Record<string, string> = {
  box: "۱) محدودهٔ شخصیت را تنظیم کن",
  strokes: "۲) خط‌های شخصیت را انتخاب کن (ضربه روی خط)",
  joints: "۳) مفصل‌ها را جابه‌جا کن",
  done: "آماده‌ای؟",
};

function enterEditorMode(box: { x: number; y: number; width: number; height: number }, includeSample: boolean): void {
  appState.setMode("setup");
  const mapping = spike.getMapping();
  if (!mapping || !spike.analysis) return;
  const filter = includeSample ? (s: { entityId: string | null }) => s.entityId === "sample_character" : undefined;
  const manifest = buildManifest(spike.analysis, mapping, store, idMap, filter);
  editor.begin(box, manifest, filter);
  hideRevive();
  hideSampleDemo();
  stageButton.textContent = "بعدی";
  stageButton.style.opacity = "1";
  stageButton.style.pointerEvents = "auto";
}

function startAnalysis(includeSample: boolean): void {
  void spike.requestAnalyze(includeSample).then((result) => {
    if (!result || !spike.analysis || !spike.boxWorld) return;
    enterEditorMode(spike.boxWorld, includeSample);
  });
}

function finalizeCharacter(): void {
  const manifest = editor.manifestReady();
  if (!manifest) {
    bubble.show("مفصل‌ها هنوز یک پیکر درست نیستن…", headAnchorScreen());
    return;
  }
  appState.setMode("live");
  hideStageButton();
  stageTitleEl.style.opacity = "0";
  if (storage) void storage.saveManifest(manifest);
  console.log("[pencil-ai] character manifest:", JSON.stringify(manifest, null, 2));
  bubble.show("آها! پس تو این شکلی…", headAnchorScreen());
}

function headAnchorScreen(): { x: number; y: number } {
  const { viewportWidth: w, viewportHeight: h } = appState.get();
  return camera.worldToScreen({ x: w * 0.34, y: h * BASE_LINE_Y_RATIO - 200 });
}

reviveEl.addEventListener("click", () => startAnalysis(false));
sampleDemoEl.addEventListener("click", () => startAnalysis(true));
stageButton.addEventListener("click", () => {
  editor.nextStage();
});

editor.onStageChange = (stage) => {
  stageTitleEl.textContent = STAGE_LABELS[stage];
  stageButton.textContent = stage === "joints" ? "زنده‌اش کن" : "بعدی";
  if (stage === "done") {
    hideStageButton();
    finalizeCharacter();
  }
};

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
    if (appState.get().mode !== "intro") return;
    bubble.show("این خط برای پای برهنه‌ام خیلی زبره…", headAnchorScreen());
    window.setTimeout(() => {
      if (bubble.isVisible()) {
        bubble.show("می‌تونی برام کفش بکشی؟", headAnchorScreen());
      }
    }, 3400);
  }, INACTIVITY_MS);
}

const pointer = new PointerInput(canvas, store, camera, {
  onStrokeStart: () => {
    pencilDown = true;
    hintEl.style.opacity = "0";
    hintVisible = false;
    hideRevive();
    hideSampleDemo();
    if (bubble.isVisible()) bubble.hide();
    if (idleTimer !== null) window.clearTimeout(idleTimer);
  },
  onStrokeEnd: () => {
    pencilDown = false;
    if (appState.get().mode === "intro") scheduleIdleAction();
  },
  onPencilMove: (e) => {
    lastPencil = e;
  },
  onPencilDown: (e) => {
    lastPencil = e;
  },
});

pointer.interceptor = {
  down: (world) => {
    if (appState.get().mode !== "setup") return false;
    editor.pointerDown(world);
    return editor.isDragging() || editor.stage === "strokes";
  },
  move: (world) => {
    if (appState.get().mode !== "setup") return false;
    editor.pointerMove(world);
    return editor.isDragging();
  },
  up: (world) => {
    editor.pointerUp();
  },
};

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

  if (appState.get().mode === "setup") {
    editor.draw(ctx, camera);
    stageTitleEl.style.opacity = "1";
  }

  if (pencilDown && lastPencil) {
    const sp = camera.worldToScreen(lastPencil);
    const pulse = 0.1 + 0.04 * Math.sin(now / 120);
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
  if (state.mode === "live" && hintVisible) {
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

console.log("[pencil-ai] phase 2 bootstrap ready");
