import { AppStateController } from "./app-state.js";
import { StrokeStore } from "../drawing/stroke-store.js";
import { StrokeRenderer } from "../drawing/stroke-renderer.js";
import { PointerInput, type PencilEvent } from "../drawing/pointer-input.js";
import { IdMap } from "../drawing/id-map.js";
import { Camera } from "../world/camera.js";
import { GroundPath } from "../world/ground-path.js";
import { SpeechBubble } from "../story/speech-bubble.js";
import { buildSampleCharacter, buildSampleManifest } from "./sample-character.js";
import { AnalysisSpike } from "../character/analysis-spike.js";
import { JointEditor } from "../character/joint-editor.js";
import { buildManifest, type CharacterManifest } from "../character/character-manifest.js";
import { buildRig, type Rig } from "../character/rig-builder.js";
import { RigRuntime } from "../character/rig-runtime.js";
import { AnimationController } from "../animation/animation-controller.js";
import { MOTION_CLIPS } from "../animation/motion-clips.js";
import { QuestEngine, type StoryCommand } from "../story/quest-engine.js";
import { PondScene } from "../world/pond-scene.js";
import { Walker, easeToward } from "../world/walker.js";
import {
  buildShoeAttachment,
  buildRodAttachment,
  buildFishLineAttachment,
} from "../world/hardcoded-objects.js";
import type { Attachment } from "../character/attachments.js";
import { createSessionStorage } from "../storage/indexed-db.js";
import { PALETTE, BASE_LINE_WIDTH, BASE_LINE_Y_RATIO, INACTIVITY_MS } from "./constants.js";

const appEl = (() => {
  const el = document.getElementById("app");
  if (!el) throw new Error("missing #app element");
  return el;
})();

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
const animController = new AnimationController();
const quest = new QuestEngine();

let rigRuntime: RigRuntime | null = null;
let riggedStrokeIds = new Set<string>();
let greeted = false;
let storyStarted = false;
let attachments: Attachment[] = [];
let pond: PondScene | null = null;
let walker: Walker | null = null;
let walking = false;
let awaitingGoalId: string | null = null;
let lastPencil: PencilEvent | null = null;
let pencilDown = false;
let idleTimer: number | null = null;
let bubbleTimer: number | null = null;
let lastFrame = performance.now();

function activateRig(rig: Rig): void {
  rigRuntime = new RigRuntime(rig);
  riggedStrokeIds = new Set(rig.strokes.map((s) => s.id));
  animController.play(MOTION_CLIPS.spawn);
  animController.onClipEnd = (clipId) => {
    if (clipId === "spawn") {
      animController.playById("idle");
      if (!storyStarted) {
        storyStarted = true;
        startStory();
      } else if (!greeted) {
        greeted = true;
        bubble.show("سلام! پس این تو همونی هستی…", headAnchorScreen());
      }
    }
  };
}

function startStory(): void {
  appState.setMode("live");
  quest.trigger({ type: "character_alive" });
}

function replaceCharacter(manifest: CharacterManifest, deactivateSample: boolean): void {
  activateRig(buildRig(manifest, store));
  attachments = [];
  if (deactivateSample) {
    for (const stroke of store.all()) {
      if (stroke.entityId === "sample_character") {
        store.deactivate(stroke.id);
        riggedStrokeIds.delete(stroke.id);
      }
    }
  }
}

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
  if (!worldBuilt) {
    worldBuilt = true;
    buildSampleCharacter(store, w * 0.34, baselineY);
    replaceCharacter(buildSampleManifest(store, w * 0.34, baselineY), false);
    const pondX = Math.round(w * 1.45);
    pond = new PondScene(pondX, baselineY - 26, 190, 72);
    walker = new Walker(groundPath, pondX - 70);
  }
}

let groundPath = new GroundPath([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
let worldBuilt = false;

function headAnchorScreen(): { x: number; y: number } {
  const { viewportWidth: w, viewportHeight: h } = appState.get();
  const root = rigRuntime?.restJoint("head") ?? { x: w * 0.34, y: h * 0.4 };
  return camera.worldToScreen({ x: root.x, y: root.y - 60 });
}

function showStoryBubble(text: string): void {
  if (bubbleTimer !== null) window.clearTimeout(bubbleTimer);
  bubble.show(text, headAnchorScreen());
  bubbleTimer = window.setTimeout(() => {
    bubbleTimer = null;
    bubble.hide();
    quest.trigger({ type: "bubble_shown" });
  }, 2600);
}

function beginAwaitingDrawing(goalId: string): void {
  awaitingGoalId = goalId;
  appState.setMode("awaiting");
}

function resolveDrawingAttempt(): void {
  if (awaitingGoalId === "draw_shoes") {
    awaitingGoalId = null;
    quest.trigger({
      type: "drawing_validated",
      action: "equip_shoes",
      reactionBubble: "وای! یکم بزرگن، ولی عاشقشونم!",
      emotion: "excited",
    });
  } else if (awaitingGoalId === "draw_fishing_tool") {
    awaitingGoalId = null;
    quest.trigger({
      type: "drawing_validated",
      action: "equip_tool",
      reactionBubble: "عالیه! حالا ببین چطور ماهی می‌گیرم!",
      emotion: "excited",
    });
  }
}

function attachHardcodedShoes(): void {
  if (!rigRuntime) return;
  const leftFoot = rigRuntime.restJoint("left_foot");
  const rightFoot = rigRuntime.restJoint("right_foot");
  if (leftFoot) attachments.push(buildShoeAttachment(leftFoot, "left_foot", "left"));
  if (rightFoot) attachments.push(buildShoeAttachment(rightFoot, "right_foot", "right"));
}

function attachHardcodedRod(): void {
  if (!rigRuntime) return;
  const hand = rigRuntime.restJoint("right_hand");
  if (hand) {
    attachments = attachments.filter((a) => a.id !== "rod");
    attachments.push(buildRodAttachment(hand));
  }
}

function startWalk(): void {
  if (!walker || !rigRuntime) return;
  const root = rigRuntime.restJoint("root");
  if (root) {
    walker.distance = groundPath.nearestDistance({ x: root.x, y: root.y });
  }
  walking = true;
  appState.setMode("walking");
  animController.playById("walk");
}

function castSequence(): void {
  animController.playById("cast_rod");
  window.setTimeout(() => {
    if (!pond || !rigRuntime) return;
    const hand = rigRuntime.restJoint("right_hand");
    if (hand) {
      const tip = rigRuntime.boneToWorld("right_hand", { x: 164, y: -12 });
      attachments = attachments.filter((a) => a.id !== "fish_line");
      attachments.push(buildFishLineAttachment(hand, { x: pond.x, y: pond.y - 20 }));
      void tip;
    }
    pond.triggerFishJump(performance.now());
  }, 700);
  animController.onClipEnd = (clipId) => {
    if (clipId === "cast_rod") {
      animController.playById("pull_fish");
      animController.onClipEnd = (innerId) => {
        if (innerId === "pull_fish") {
          quest.trigger({ type: "fish_sequence_done" });
        }
      };
    }
  };
}

quest.onCommand = (command: StoryCommand) => {
  switch (command.type) {
    case "bubble":
      showStoryBubble(command.text);
      break;
    case "anim":
      animController.playById(command.clip);
      break;
    case "await_drawing":
      beginAwaitingDrawing(command.goalId);
      break;
    case "attach_shoes":
      attachHardcodedShoes();
      break;
    case "start_walk":
      startWalk();
      break;
    case "reach_pond":
      walking = false;
      animController.playById("stop_at_pond");
      if (rigRuntime && pond) {
        rigRuntime.look = { targetX: pond.x, targetY: pond.y + 30 };
      }
      break;
    case "attach_rod":
      attachHardcodedRod();
      break;
    case "cast_sequence":
      castSequence();
      break;
    case "fish_jump":
      pond?.triggerFishJump(performance.now());
      break;
    case "fish_talk":
      showStoryBubble(command.text);
      break;
    case "ending":
      showEnding();
      break;
  }
};

function showEnding(): void {
  appState.setMode("ending");
  const el = document.createElement("div");
  el.style.cssText = [
    "position:absolute",
    "z-index:50",
    "inset:0",
    "display:grid",
    "place-items:center",
    "background:rgba(16,59,70,0.55)",
    "color:#F7F5EE",
    "font-family:system-ui,'Segoe UI',Tahoma,sans-serif",
    "font-size:24px",
    "direction:rtl",
    "text-align:center",
    "line-height:1.8",
    "animation:fadeIn 700ms ease",
  ].join(";");
  el.textContent = "ادامهٔ این خط را تو می‌کشی.";
  appEl.appendChild(el);
}

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
  replaceCharacter(manifest, true);
  if (storage) void storage.saveManifest(manifest);
  console.log("[pencil-ai] character manifest:", JSON.stringify(manifest, null, 2));
  bubble.show("آها! پس تو این شکلی…", headAnchorScreen());
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
    const mode = appState.get().mode;
    if (mode === "awaiting") {
      resolveDrawingAttempt();
      return;
    }
    if (mode !== "intro") return;
    if (spike.status === "analyzing") return;
    if (spike.userHasDrawn() && spike.status !== "done") {
      reviveEl.style.opacity = "1";
      reviveEl.style.pointerEvents = "auto";
      return;
    }
  }, INACTIVITY_MS);
}

const pointer = new PointerInput(canvas, store, camera, {
  onStrokeStart: () => {
    pencilDown = true;
    hintEl.style.opacity = "0";
    hintVisible = false;
    hideRevive();
    hideSampleDemo();
    if (bubble.isVisible()) {
      bubble.hide();
      if (bubbleTimer !== null) {
        window.clearTimeout(bubbleTimer);
        bubbleTimer = null;
        quest.trigger({ type: "bubble_shown" });
      }
    }
    if (idleTimer !== null) window.clearTimeout(idleTimer);
  },
  onStrokeEnd: () => {
    pencilDown = false;
    scheduleIdleAction();
  },
  onPencilMove: (e) => {
    lastPencil = e;
    if (rigRuntime && (appState.get().mode === "live" || appState.get().mode === "awaiting")) {
      rigRuntime.look = { targetX: e.x, targetY: e.y };
    }
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
  const dt = Math.min(64, now - lastFrame);
  lastFrame = now;

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, w, h);

  const poly = groundPath.screenPolyline(camera.state.x);
  ctx.strokeStyle = PALETTE.primaryInk;
  ctx.lineWidth = BASE_LINE_WIDTH + 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  pond?.draw(ctx, camera, now);

  for (const stroke of store.all()) {
    if (stroke.active && !riggedStrokeIds.has(stroke.id)) {
      renderer.drawStroke(ctx, stroke, camera);
    }
  }

  if (rigRuntime) {
    let rootDeltaX = 0;
    if (walking && walker) {
      walker.step(dt);
      const pos = walker.position();
      const root = rigRuntime.restJoint("root");
      if (root) rootDeltaX = pos.x - root.x;
      if (walker.finished) {
        walking = false;
        quest.trigger({ type: "walk_complete" });
        animController.playById("stop_at_pond");
      }
      const targetCameraX = pos.x - w * 0.33;
      camera.setX(easeToward(camera.state.x, targetCameraX, dt));
    }

    const pose = animController.update(now);
    rigRuntime.applyPose({
      jointRotations: pose.jointRotations,
      rootDeltaX,
      rootDeltaY: pose.rootDeltaY,
      rootRotation: pose.rootRotation,
    });

    const strokes = rigRuntime.transformedStrokePoints();
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    rigRuntime.strokes.forEach((rigStroke, i) => {
      const points = strokes[i];
      if (!points || points.length < 2) return;
      ctx.strokeStyle = rigStroke.color;
      ctx.lineWidth = rigStroke.baseWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    });

    for (const attachment of attachments) {
      const points = attachmentWorldPoints(attachment, rigRuntime);
      if (points.length < 2) continue;
      ctx.strokeStyle = attachment.color;
      ctx.lineWidth = attachment.baseWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();
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

function attachmentWorldPoints(attachment: Attachment, runtime: RigRuntime): Array<{ x: number; y: number }> {
  return attachment.localPoints.map((p) => runtime.boneToWorld(attachment.boneId, p));
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

console.log("[pencil-ai] phase 4 bootstrap ready");
