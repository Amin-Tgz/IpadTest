import { AppStateController } from "./app-state.js";
import { StrokeStore } from "../drawing/stroke-store.js";
import { StrokeRenderer } from "../drawing/stroke-renderer.js";
import { PointerInput, type PencilEvent } from "../drawing/pointer-input.js";
import { IdMap } from "../drawing/id-map.js";
import { Camera } from "../world/camera.js";
import { GroundPath } from "../world/ground-path.js";
import { SpeechBubble } from "../story/speech-bubble.js";
import { PersianSpeech } from "../story/persian-speech.js";
import { buildSampleCharacter, buildSampleManifest } from "./sample-character.js";
import { AnalysisSpike } from "../character/analysis-spike.js";
import { JointEditor } from "../character/joint-editor.js";
import { buildManifest, migrateManifest, type CharacterManifest } from "../character/character-manifest.js";
import { buildRig, type Rig } from "../character/rig-builder.js";
import { RigRuntime } from "../character/rig-runtime.js";
import { AnimationController } from "../animation/animation-controller.js";
import { MOTION_CLIPS } from "../animation/motion-clips.js";
import { QuestEngine, type StoryCommand } from "../story/quest-engine.js";
import { PondScene } from "../world/pond-scene.js";
import { Walker, easeToward } from "../world/walker.js";
import { buildFishLineAttachment } from "../world/hardcoded-objects.js";
import type { Attachment } from "../character/attachments.js";
import { attachmentWorldPoints, buildAttachmentFromObject } from "../character/attachments.js";
import { captureViewport, captureDelta } from "../ai/capture.js";
import { analyzeDrawing } from "../ai/ai-client.js";
import { imageToWorldX, imageToWorldY, worldToImage, type CaptureMapping } from "../ai/normalization.js";
import { looksPersian } from "../ai/text.js";
import type { DrawingAnalysis } from "../ai/schemas.js";
import type { AIActionRequest } from "../ai/schemas.js";
import { createSessionStorage } from "../storage/indexed-db.js";
import { PALETTE, BASE_LINE_WIDTH, BASE_LINE_Y_RATIO } from "./constants.js";
import { createDiagnostics } from "./diagnostics.js";
import { PhaserWorldController } from "../world/phaser-world.js";
import { REPAIR_PARTS, SegmentRepairEditor, partColor, type RepairPart } from "../character/segment-repair.js";
import { WorldEntityRegistry, type WorldEntity } from "../world/world-entity.js";
import type { PhysicsShape } from "../world/phaser-world.js";
import { hasReviewableChanges, nextReviewCheckpoint, temporaryReviewStrokeIds } from "./manual-review.js";
import { validateActionRequest } from "../ai/action-protocol.js";

const appEl = (() => {
  const el = document.getElementById("app");
  if (!el) throw new Error("missing #app element");
  return el;
})();

// Keep palm contact inside the drawing surface from becoming browser text
// selection, image dragging, a context menu, or an iOS touch callout. Buttons
// remain tappable; Apple Pencil drawing arrives through Pointer Events.
const blockBrowserGesture = (event: Event): void => {
  if (event.target instanceof HTMLButtonElement || (event.target instanceof Element && event.target.closest("button"))) return;
  event.preventDefault();
};
document.addEventListener("selectstart", blockBrowserGesture, { passive: false });
document.addEventListener("dragstart", blockBrowserGesture, { passive: false });
document.addEventListener("contextmenu", blockBrowserGesture, { passive: false });
appEl.addEventListener("touchstart", blockBrowserGesture, { passive: false });
appEl.addEventListener("touchmove", blockBrowserGesture, { passive: false });
appEl.addEventListener("gesturestart", blockBrowserGesture, { passive: false });

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  return ctx;
}

const canvas = document.createElement("canvas");
appEl.appendChild(canvas);
const ctx = getContext(canvas);
let phaserWorld: PhaserWorldController | null = null;

const appState = new AppStateController();
const diagnostics = createDiagnostics(appEl);
const store = new StrokeStore();
const camera = new Camera();
const renderer = new StrokeRenderer();
const bubble = new SpeechBubble(appEl);
const speech = new PersianSpeech();
const idMap = new IdMap();
const storage = createSessionStorage();
const worldEntities = new WorldEntityRegistry();

const getViewport = () => {
  const { viewportWidth: width, viewportHeight: height } = appState.get();
  return { width, height };
};

const editor = new JointEditor(store, getViewport);
const spike = new AnalysisSpike(store, camera, getViewport, () => groundPath, bubble, diagnostics, () => characterGuideBox());
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
let checkpoint = 0;
let analysisInFlight = false;
let groundChangePending = false;
let pendingDetected: DrawingAnalysis | null = null;
let pendingSourceStrokeIds = new Set<string>();
let lastPencil: PencilEvent | null = null;
let pencilDown = false;
let bubbleTimer: number | null = null;
let lastFrame = performance.now();
let segmentRepair: SegmentRepairEditor | null = null;
let physicsNavigationWasActive = false;
let navigationTravel = 0;
let navigationLastX: number | null = null;

function activateRig(rig: Rig, playSpawn = true): void {
  rigRuntime = new RigRuntime(rig);
  phaserWorld?.detachCharacter();
  phaserWorld?.attachCharacter(rigRuntime);
  riggedStrokeIds = new Set(rig.strokes.map((s) => s.id));
  if (!playSpawn) return;
  animController.play(MOTION_CLIPS.spawn);
  animController.onClipEnd = (clipId) => {
    if (clipId === "spawn") {
      animController.playById("idle");
      if (!storyStarted) {
        storyStarted = true;
        startFreePlay(false);
      } else if (!greeted) {
        greeted = true;
        speakStoryText("سلام! پس این تو همونی هستی…");
      }
    }
  };
}

function startFreePlay(resetCheckpoint = true): void {
  speakStoryText("هر چیزی دوست داری بکش یا بنویس؛ من واکنش نشان می‌دهم.");
  beginAwaitingDrawing("free_draw", resetCheckpoint);
}

function replaceCharacter(manifest: CharacterManifest, deactivateSample: boolean, playSpawn = true): void {
  manifest = migrateManifest(manifest);
  activeManifest = manifest;
  activateRig(buildRig(manifest, store), playSpawn);
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
  phaserWorld?.resize(w, h);
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
    const pondX = Math.round(w * 1.45);
    pond = new PondScene(pondX, baselineY - 26, 190, 72);
    walker = new Walker(groundPath, pondX - 70);
  }
  configurePhysicsGround();
}

function configurePhysicsGround(): void {
  const { viewportWidth: width, viewportHeight: height } = appState.get();
  const worldEnd = Math.max(width * 3, 1);
  phaserWorld?.configureGround(
    width,
    Math.round(height * BASE_LINE_Y_RATIO),
    groundPath.solidRanges(0, worldEnd),
  );
}

let groundPath = new GroundPath([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
let worldBuilt = false;
let demoLoaded = false;

function characterGuideBox(): { x: number; y: number; width: number; height: number } {
  const { viewportWidth: width, viewportHeight: height } = appState.get();
  const top = height * 0.16;
  const baseline = height * BASE_LINE_Y_RATIO;
  return {
    x: camera.state.x + width * 0.08,
    y: top,
    width: width * 0.3,
    height: baseline - top,
  };
}

function loadSampleDemo(): void {
  if (demoLoaded) return;
  const { viewportWidth: width, viewportHeight: height } = appState.get();
  const baselineY = Math.round(height * BASE_LINE_Y_RATIO);
  const originX = width * 0.34;
  buildSampleCharacter(store, originX, baselineY);
  demoLoaded = true;
}

let saveTimer: number | null = null;

function scheduleSave(): void {
  if (!storage) return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void storage.saveStrokes(
      store
        .all()
        .filter((s) => s.active)
        .map((s) => s),
    );
    void storage.saveQuest({
      version: 2,
      state: quest.state,
      walking,
      checkpoint,
      attachments,
      worldEntities: worldEntities.all(),
      entityTransform: rigRuntime?.entityTransform ?? null,
      camera: camera.state,
    });
  }, 1500);
}

async function restoreSession(): Promise<void> {
  if (!storage) return;
  try {
    const savedStrokes = await storage.loadStrokes<Array<Record<string, unknown>>>();
    const savedManifest = await storage.loadManifest<CharacterManifest>();
    const savedQuest = await storage.loadQuest<{
      version?: number;
      state: string;
      walking: boolean;
      checkpoint?: number;
      attachments?: Attachment[];
      worldEntities?: WorldEntity[];
      entityTransform?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number } | null;
      camera?: { x: number; y: number };
    }>();
    if (savedStrokes && savedStrokes.length > 0) {
      for (const raw of savedStrokes) {
        const points = (raw.points as Array<{ x: number; y: number; pressure: number; time: number }>) ?? [];
        store.add({
          id: String(raw.id),
          points,
          color: String(raw.color ?? PALETTE.primaryInk),
          baseWidth: Number(raw.baseWidth ?? 4),
          tool: raw.tool === "eraser" ? "eraser" : "pen",
          createdAt: Number(raw.createdAt ?? Date.now()),
          worldSpace: true,
          entityId: raw.entityId === null ? null : String(raw.entityId),
          active: true,
          groupId: raw.groupId === null ? null : String(raw.groupId),
        });
      }
    }
    if (savedManifest && savedManifest.joints && savedManifest.joints.length > 0) {
      const ids = new Set(store.all().map((s) => s.id));
      if (savedManifest.includedStrokeIds.every((id) => ids.has(id))) {
        replaceCharacter(savedManifest, true, false);
        if (savedQuest?.entityTransform && rigRuntime) rigRuntime.setEntityTransform(savedQuest.entityTransform);
        if (savedQuest?.attachments) attachments = savedQuest.attachments;
        for (const entity of savedQuest?.worldEntities ?? []) {
          worldEntities.upsert(entity);
          if (entity.physicsShape) phaserWorld?.addEntity({ id: entity.id, shape: entity.physicsShape, ...entity.bounds });
        }
        if (savedQuest?.camera) {
          camera.setX(savedQuest.camera.x);
          camera.state.y = savedQuest.camera.y;
        }
        checkpoint = savedQuest?.checkpoint ?? store.count();
        storyStarted = true;
        beginAwaitingDrawing("free_draw", false);
      }
    }
  } catch (error) {
    console.warn("[pencil-ai] session restore failed", error);
  }
}

function isQuestState(value: string): value is import("../story/quest-engine.js").QuestState {
  return ["DRAW_CHARACTER", "SPAWN", "AWAIT_SHOES", "EQUIP_SHOES", "WALK_TO_POND", "REQUEST_TOOL", "AWAIT_TOOL", "EQUIP_TOOL", "FISHING", "ENDING"].includes(value);
}

function headAnchorScreen(): { x: number; y: number } {
  const { viewportWidth: w, viewportHeight: h } = appState.get();
  const head = rigRuntime?.jointScreen("head", camera);
  return head ? { x: head.x, y: head.y - 60 } : { x: w * 0.5, y: h * 0.4 };
}

function speakStoryText(text: string): void {
  if (bubbleTimer !== null) window.clearTimeout(bubbleTimer);
  bubble.hide();
  speech.stop();
  if (rigRuntime) rigRuntime.talkActive = true;
  const finish = (): void => {
    if (bubbleTimer !== null) window.clearTimeout(bubbleTimer);
    bubbleTimer = null;
    if (rigRuntime) rigRuntime.talkActive = false;
    quest.trigger({ type: "bubble_shown" });
  };
  const spoken = speech.speak(text, finish);
  diagnostics.info("persian_speech", { spoken, textLength: text.length });
  if (!spoken) {
    const duration = Math.max(1600, Math.min(6500, text.length * 95));
    bubbleTimer = window.setTimeout(finish, duration);
  }
}

function beginAwaitingDrawing(goalId: string, resetCheckpoint = true): void {
  awaitingGoalId = goalId;
  checkpoint = nextReviewCheckpoint(checkpoint, store.count(), resetCheckpoint);
  analysisInFlight = false;
  appState.setMode("awaiting");
  diagnostics.info("drawing_review_ready", { goalId, checkpoint, strokeCount: store.count(), resetCheckpoint });
  refreshReviewControls();
}

function jointsInImageCoords(): Array<{ id: string; x: number; y: number }> {
  const viewport = getViewport();
  const mapping = {
    scale: 1024 / Math.max(viewport.width, viewport.height),
    cameraX: camera.state.x,
    width: 0,
    height: 0,
  };
  const result: Array<{ id: string; x: number; y: number }> = [];
  if (!rigRuntime) return result;
  const add = (id: string, world: { x: number; y: number } | null): void => {
    if (world) {
      const img = worldToImage(world, mapping);
      result.push({ id, x: img.x, y: img.y });
    }
  };
  for (const joint of rigRuntime.joints) add(joint.id, rigRuntime.jointWorld(joint.id));
  // Fingers inherit the hand bone today, while eyebrows are expressive face
  // groups. Exposing these semantic anchors lets the AI reason about them now
  // without allowing it to invent unsupported low-level animation commands.
  add("left_fingers", rigRuntime.jointWorld("left_hand"));
  add("right_fingers", rigRuntime.jointWorld("right_hand"));
  for (const feature of ["leftEyebrow", "rightEyebrow"] as const) {
    add(feature, rigRuntime.faceAnchorWorld(feature));
  }
  return result;
}

async function resolveDrawingAttempt(): Promise<void> {
  const goalId = awaitingGoalId;
  if (!goalId || analysisInFlight || !rigRuntime) return;
  const newStrokes = store
    .all()
    .slice(checkpoint)
    .filter((s) => s.active && s.entityId === null);
  if (newStrokes.length === 0 && !groundChangePending) return;

  analysisInFlight = true;
  diagnostics.info("drawing_analysis_started", { goalId, newStrokeCount: newStrokes.length });
  awaitingGoalId = null;
  appState.setMode("analyzing");
  bubble.showThinking(headAnchorScreen());
  animController.playById("confused");
  let succeeded = false;

  try {
    const viewport = getViewport();
    const full = captureViewport(store, camera, viewport, groundPath, {
      targetMaxDim: 1024,
      includeSampleCharacter: false,
    });
    const delta = captureDelta(newStrokes, 512, full.mapping);

    const goal = "Open-ended free play: understand whatever the user just drew, erased, or wrote and make the character react appropriately.";
    const acceptedCategories = ["clothing", "shoe", "hat", "tool", "food", "animal", "person", "symbol", "handwriting", "scene_object"];

    const root = rigRuntime.restJoint("root");
    const worldSummary = `The character root is at (${Math.round(root?.x ?? 0)}, ${Math.round(root?.y ?? 0)}). The white ground line is normally continuous. Ground erased: ${groundPath.erased}. Nearby entities: ${worldEntities.summary() || "none"}.`;

    const result = await analyzeDrawing(
      full.dataUrl,
      delta,
      { width: full.mapping.width, height: full.mapping.height },
      goal,
      jointsInImageCoords(),
      worldSummary,
      acceptedCategories,
    );
    const analysis = result.analysis;
    if (analysis.recognized || analysis.mappedAction === "ground_erased") {
      succeeded = true;
      pendingDetected = analysis;
      const reviewSourceStrokeIds = new Set(newStrokes.map((stroke) => stroke.id));
      pendingSourceStrokeIds = new Set(reviewSourceStrokeIds);
      lastFullMapping = full.mapping;
      const registered = registerWorldObjects(analysis, full.mapping, reviewSourceStrokeIds);
      equipDetectedObjects(analysis, full.mapping);
      if (!executeAIAction(analysis.action ?? null, registered.entityIds)) playReactionMotion(analysis.reaction.emotion);
      clearTemporaryReviewInk(reviewSourceStrokeIds, registered.retainedStrokeIds);
      speakStoryText(
        looksPersian(analysis.reaction.bubble)
          ? analysis.reaction.bubble
          : "دیدمش! بگذار ببینم با آن چه کار می‌شود کرد…",
      );
      groundChangePending = false;
      beginAwaitingDrawing("free_draw", true);
      diagnostics.info("drawing_analysis_succeeded", { goalId, objects: analysis.objects.length, action: analysis.mappedAction });
    } else {
      speakStoryText(looksPersian(analysis.reaction.bubble) ? analysis.reaction.bubble : "این یکی را نفهمیدم؛ یک نشانهٔ دیگر به آن اضافه کن.");
      beginAwaitingDrawing("free_draw", false);
      diagnostics.info("drawing_analysis_rejected", { goalId, interpretation: analysis.interpretation });
    }
  } catch (error) {
    diagnostics.error("drawing_analysis_failed", error);
    speakStoryText("هوم… این یکی رو نفهمیدم. یه بار دیگه؟");
    beginAwaitingDrawing("free_draw", false);
    window.setTimeout(() => {
      if (bubble.isVisible()) bubble.hide();
    }, 2400);
  } finally {
    analysisInFlight = false;
    refreshReviewControls();
    if (!succeeded && appState.get().mode === "awaiting") {
      animController.playById("idle");
    }
  }
}

function playReactionMotion(emotion: string): void {
  const normalized = emotion.toLowerCase();
  if (/sad|worried|uncomfortable|غم|ناراحت/.test(normalized)) {
    rigRuntime!.expression = "sad";
    animController.playById("sad");
  } else if (/happy|excited|joy|خوشحال|هیجان/.test(normalized)) {
    rigRuntime!.expression = "happy";
    animController.playById("happy");
  } else if (/surpris|شگفت|تعجب/.test(normalized)) {
    rigRuntime!.expression = "surprised";
    animController.playById("spawn");
  } else {
    rigRuntime!.expression = "neutral";
    if (/confus|think|curious|فکر|گیج/.test(normalized)) animController.playById("confused");
    else animController.playById("talk");
  }
}

function inferredPhysicsShape(object: DrawingAnalysis["objects"][number]): PhysicsShape | null {
  if (object.physicsShape && object.physicsShape !== "none") return object.physicsShape;
  const semantic = `${object.type} ${object.affordances.join(" ")}`.toLowerCase();
  if (/stair|step|پله/.test(semantic)) return "stairs";
  if (/slope|ramp|شیب/.test(semantic)) return "slope";
  if (/platform|bridge|surface|پل|سکو/.test(semantic)) return "platform";
  if (/box|ball|rock|crate|توپ|سنگ|جعبه/.test(semantic)) return "dynamic";
  if (/wall|obstacle|barrier|دیوار|مانع/.test(semantic)) return "obstacle";
  return null;
}

function registerWorldObjects(
  analysis: DrawingAnalysis,
  mapping: CaptureMapping,
  sourceStrokeIds: ReadonlySet<string>,
): { entityIds: string[]; retainedStrokeIds: Set<string> } {
  const retainedStrokeIds = new Set<string>();
  const entityIds = analysis.objects.map((object, index) => {
    const id = `world_${Date.now().toString(36)}_${index}`;
    const bounds = {
      x: imageToWorldX(object.boundingBox.x, mapping),
      y: imageToWorldY(object.boundingBox.y, mapping),
      width: object.boundingBox.width / mapping.scale,
      height: object.boundingBox.height / mapping.scale,
    };
    const physicsShape = inferredPhysicsShape(object);
    const objectStrokeIds = store.all()
      .filter((stroke) => sourceStrokeIds.has(stroke.id) && stroke.active && stroke.points.some((point) =>
        point.x >= bounds.x - 12 && point.x <= bounds.x + bounds.width + 12 &&
        point.y >= bounds.y - 12 && point.y <= bounds.y + bounds.height + 12,
      ))
      .map((stroke) => stroke.id);
    const remainsInWorld = physicsShape !== null || object.category === "wearable" || object.category === "held_tool";
    if (remainsInWorld) objectStrokeIds.forEach((id) => retainedStrokeIds.add(id));
    worldEntities.upsert({
      id,
      type: object.type,
      sourceStrokeIds: objectStrokeIds,
      bounds,
      affordances: object.affordances,
      physicsShape,
    });
    if (physicsShape) {
      phaserWorld?.addEntity({
        id,
        shape: physicsShape,
        ...bounds,
        angleDegrees: object.orientationDegrees,
      });
    }
    return id;
  });
  return { entityIds, retainedStrokeIds };
}

function clearTemporaryReviewInk(sourceStrokeIds: ReadonlySet<string>, retainedStrokeIds: ReadonlySet<string>): void {
  const removed = temporaryReviewStrokeIds(store.all(), sourceStrokeIds, retainedStrokeIds);
  removed.forEach((id) => store.deactivate(id));
  diagnostics.info("temporary_review_ink_cleared", { removedCount: removed.length, retainedCount: retainedStrokeIds.size });
  if (removed.length > 0) scheduleSave();
}

function executeAIAction(action: AIActionRequest | null, entityIds: string[]): boolean {
  if (!action || !rigRuntime) return false;
  const validation = validateActionRequest(action, entityIds);
  if (!validation.valid) {
    diagnostics.info("ai_action_rejected", { action: action.type, reason: validation.reason });
    return false;
  }
  const target = validation.targetId ? worldEntities.get(validation.targetId) : null;
  switch (action.type) {
    case "scratch_head":
      animController.playById("scratch_head");
      {
        const head = rigRuntime.jointWorld("head");
        if (head) rigRuntime.aimLimb("right_shoulder", "right_elbow", "right_hand", head, -1);
      }
      return true;
    case "move": {
      const root = rigRuntime.jointWorld("root");
      const direction = action.direction === "left" ? -1 : action.direction === "right" ? 1 : target && root && target.bounds.x < root.x ? -1 : 1;
      const needsClimb = target?.physicsShape === "stairs" || target?.physicsShape === "slope";
      const targetX = target
        ? target.bounds.x + (needsClimb ? (direction > 0 ? target.bounds.width + 16 : -16) : target.bounds.width / 2)
        : (root?.x ?? 0) + direction * Math.max(140, Math.min(320, action.durationMs * 0.18));
      const result = needsClimb
        ? phaserWorld?.climbTo(targetX, undefined, target?.id ?? null)
        : phaserWorld?.walkTo(targetX, undefined, target?.id ?? null);
      if (!result?.started) {
        diagnostics.info("movement_not_started", { action: action.type, reason: result?.reason ?? "physics_world_unavailable", targetId: target?.id });
        return false;
      }
      animController.playById("walk");
      return true;
    }
    case "jump":
      if (!phaserWorld?.jump()) {
        diagnostics.info("movement_not_started", { action: action.type, reason: "character_not_grounded" });
        return false;
      }
      animController.playById("happy");
      return true;
    case "climb": {
      const root = rigRuntime.jointWorld("root");
      const direction = target && root && target.bounds.x < root.x ? -1 : 1;
      const targetX = target
        ? target.bounds.x + (direction > 0 ? target.bounds.width + 16 : -16)
        : (root?.x ?? 0) + direction * 180;
      const result = phaserWorld?.climbTo(targetX, undefined, target?.id ?? null);
      if (!result?.started) {
        diagnostics.info("movement_not_started", { action: action.type, reason: result?.reason ?? "physics_world_unavailable", targetId: target?.id });
        return false;
      }
      animController.playById("walk");
      return true;
    }
    case "equip":
    case "use":
    case "interact":
      animController.playById("happy");
      return true;
    case "speak":
      animController.playById("talk");
      return true;
    case "react":
      return false;
  }
}

function equipDetectedObjects(analysis: DrawingAnalysis, mapping: CaptureMapping): void {
  if (!rigRuntime) return;
  const added: Attachment[] = [];
  analysis.objects.forEach((object, index) => {
    const objectWithWorld = {
      ...object,
      anchor:
        object.anchor === null
          ? null
          : { x: imageToWorldX(object.anchor.x, mapping), y: imageToWorldY(object.anchor.y, mapping) },
      boundingBox: {
        x: imageToWorldX(object.boundingBox.x, mapping),
        y: imageToWorldY(object.boundingBox.y, mapping),
        width: object.boundingBox.width / mapping.scale,
        height: object.boundingBox.height / mapping.scale,
      },
    };
    const attachment = buildAttachmentFromObject(objectWithWorld, store, idMap, rigRuntime!, index, pendingSourceStrokeIds);
    if (attachment) added.push(attachment);
  });
  if (added.length > 0) {
    attachments.push(...added);
    pendingDetected = null;
    pendingSourceStrokeIds.clear();
  }
}

let lastFullMapping: CaptureMapping | null = null;
let activeManifest: CharacterManifest | null = null;

function startWalk(): void {
  if (!walker || !rigRuntime) return;
  const root = rigRuntime.jointWorld("root");
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
      attachments = attachments.filter((a) => a.id !== "fish_line");
      attachments.push(buildFishLineAttachment(hand, { x: pond.x, y: pond.y - 20 }, 60));
    }
    pond.triggerFishJump(performance.now());
  }, 700);
  animController.onClipEnd = (clipId) => {
    if (clipId === "cast_rod") {
      animController.playById("pull_fish");
      if (pond) pond.fish.caught = true;
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
      speakStoryText(command.text);
      break;
    case "anim":
      animController.playById(command.clip);
      break;
    case "await_drawing":
      beginAwaitingDrawing(command.goalId);
      break;
    case "attach_shoes":
      if (pendingDetected && lastFullMapping) {
        equipDetectedObjects(pendingDetected, lastFullMapping);
      }
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
      if (pendingDetected && lastFullMapping) {
        equipDetectedObjects(pendingDetected, lastFullMapping);
      }
      break;
    case "cast_sequence":
      castSequence();
      break;
    case "fish_jump":
      pond?.triggerFishJump(performance.now());
      break;
    case "fish_talk":
      speakStoryText(command.text);
      break;
    case "ending":
      showEnding();
      break;
  }
  scheduleSave();
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

const resetEl = document.createElement("button");
resetEl.style.cssText = [
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
].join(";");
resetEl.innerHTML = `${controlIcon("restart")}<span style="font:11px system-ui">شروع دوباره</span>`;
resetEl.title = "شروع دوباره";
resetEl.addEventListener("click", () => {
  if (storage) void storage.clearSession();
  window.location.reload();
});
appEl.appendChild(resetEl);

function controlIcon(kind: "restart" | "undo" | "eraser"): string {
  const paths = {
    restart: '<path d="M20 7a8 8 0 1 0 2 8"/><path d="M20 3v4h-4"/>',
    undo: '<path d="M9 8 4 12l5 4"/><path d="M5 12h9a6 6 0 0 1 6 6"/>',
    eraser: '<path d="m7 18-3-3 9-9a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-7 7Z"/><path d="M10 9l5 5M7 18h13"/>',
  };
  return `<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`;
}

function makeInkControl(kind: "undo" | "eraser", label: string, title: string, top: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.innerHTML = `${controlIcon(kind)}<span style="font:11px system-ui">${label}</span>`;
  button.title = title;
  button.style.cssText = [
    "position:absolute", "z-index:45", `top:${top}`, "left:max(14px, env(safe-area-inset-left))",
    "width:72px", "height:68px", "padding:5px", "border-radius:16px",
    "border:2px solid rgba(247,245,238,0.75)", "background:#103B46",
    "color:#F7F5EE", "display:flex", "flex-direction:column", "align-items:center",
    "justify-content:center", "gap:3px", "touch-action:manipulation",
  ].join(";");
  appEl.appendChild(button);
  return button;
}

const undoEl = makeInkControl("undo", "برگشت", "پاک کردن آخرین خط", "90px");
const eraserEl = makeInkControl("eraser", "پاک‌کن", "پاک‌کن: بخش لمس‌شدهٔ خط را پاک کن", "166px");
let activeInkTool: "pen" | "eraser" = "pen";

function canEditInk(): boolean {
  const mode = appState.get().mode;
  return mode === "intro" || mode === "awaiting";
}

function hideRevive(): void {
  reviveEl.style.opacity = "0";
  reviveEl.style.pointerEvents = "none";
}

function hideReview(): void {
  reviewEl.style.opacity = "0";
  reviewEl.style.pointerEvents = "none";
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
hintEl.textContent = "شخصیتت را داخل کادر و روی خط بکش؛ سر، دو دست و دو پا…";
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
  "font-size:18.4px",
  "font-weight:600",
  "padding:12px 35px",
  "min-height:56px",
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
  "font-size:18.4px",
  "padding:12px 30px",
  "min-height:56px",
  "border-radius:999px",
  "border:1px solid rgba(247,245,238,0.4)",
  "direction:rtl",
  "opacity:0",
  "transition:opacity 300ms",
  "pointer-events:none",
].join(";");
reviveEl.textContent = "زنده‌اش کن";
appEl.appendChild(reviveEl);

const reviewEl = document.createElement("button");
reviewEl.style.cssText = [
  "position:absolute",
  "z-index:35",
  "bottom:max(28px, env(safe-area-inset-bottom))",
  "left:50%",
  "transform:translateX(-50%)",
  "color:#103B46",
  "background:#D8F6FF",
  "font-family:system-ui,'Segoe UI',Tahoma,sans-serif",
  "font-size:18.4px",
  "font-weight:700",
  "padding:12px 35px",
  "min-height:56px",
  "border-radius:999px",
  "border:2px solid rgba(247,245,238,0.72)",
  "direction:rtl",
  "opacity:0",
  "transition:opacity 220ms, transform 160ms",
  "pointer-events:none",
  "touch-action:manipulation",
  "box-shadow:0 6px 20px rgba(0,0,0,0.3)",
].join(";");
reviewEl.textContent = "▶ ببین نقاشی‌مو";
reviewEl.title = "حالا نقاشی من را ببین";
appEl.appendChild(reviewEl);

const repairEl = document.createElement("button");
repairEl.style.cssText = [
  "position:absolute", "z-index:35", "top:max(18px, env(safe-area-inset-top))",
  "right:max(18px, env(safe-area-inset-right))", "padding:10px 16px", "min-height:48px",
  "border-radius:999px", "border:1px solid rgba(216,246,255,.45)", "background:#103B46",
  "color:#D8F6FF", "font:15px system-ui", "direction:rtl", "opacity:0", "pointer-events:none",
  "touch-action:manipulation", "transition:opacity 220ms",
].join(";");
repairEl.textContent = "اصلاح بخش‌های بدن";
appEl.appendChild(repairEl);

const repairPaletteEl = document.createElement("div");
repairPaletteEl.style.cssText = [
  "position:absolute", "z-index:50", "top:max(14px, env(safe-area-inset-top))", "left:50%",
  "transform:translateX(-50%)", "display:none", "gap:6px", "align-items:center", "flex-wrap:wrap",
  "justify-content:center", "max-width:calc(100vw - 180px)", "padding:8px", "border-radius:18px",
  "background:rgba(5,24,30,.9)", "direction:rtl",
].join(";");
const repairLabels: Record<RepairPart, string> = {
  head: "سر", torso: "بدن", left_arm: "بازوی چپ", right_arm: "بازوی راست",
  left_hand: "دست چپ", right_hand: "دست راست", left_fingers: "انگشت‌های چپ", right_fingers: "انگشت‌های راست",
  left_leg: "پای چپ", right_leg: "پای راست", left_foot: "کف پای چپ", right_foot: "کف پای راست",
  left_eyebrow: "ابروی چپ", right_eyebrow: "ابروی راست",
};
const repairPartButtons = new Map<RepairPart, HTMLButtonElement>();
for (const part of REPAIR_PARTS) {
  const button = document.createElement("button");
  button.textContent = repairLabels[part];
  button.style.cssText = `min-height:44px;padding:8px 12px;border-radius:12px;border:3px solid ${partColor(part)};background:#103B46;color:#F7F5EE;font:14px system-ui;touch-action:manipulation`;
  button.addEventListener("click", () => {
    segmentRepair?.setPart(part);
    repairPartButtons.forEach((item, key) => {
      item.style.background = key === part ? "#D8F6FF" : "#103B46";
      item.style.color = key === part ? "#103B46" : "#F7F5EE";
    });
  });
  repairPartButtons.set(part, button);
  repairPaletteEl.appendChild(button);
}
const repairDoneEl = document.createElement("button");
repairDoneEl.textContent = "تمام شد";
repairDoneEl.style.cssText = "min-height:44px;padding:8px 16px;border-radius:12px;border:0;background:#F7F5EE;color:#103B46;font:700 14px system-ui;touch-action:manipulation";
repairPaletteEl.appendChild(repairDoneEl);
appEl.appendChild(repairPaletteEl);

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
  "opacity:0",
  "pointer-events:none",
  "transition:opacity 300ms",
].join(";");
sampleDemoEl.textContent = "تحلیل شخصیت نمونه";
appEl.appendChild(sampleDemoEl);
if (import.meta.env.DEV) {
  sampleDemoEl.style.opacity = "1";
  sampleDemoEl.style.pointerEvents = "auto";
}

const STAGE_LABELS: Record<string, string> = {
  box: "محدودهٔ شخصیت را تنظیم کن؛ یا مستقیم ادامه بده",
  strokes: "خط‌های شخصیت را انتخاب کن",
  joints: "فقط مفصل‌های اشتباه را با قلم جابه‌جا کن",
  done: "آماده‌ای؟",
};

function enterEditorMode(box: { x: number; y: number; width: number; height: number }, includeSample: boolean): void {
  appState.setMode("setup");
  const mapping = spike.getMapping();
  if (!mapping || !spike.analysis) return;
  const filter = includeSample ? (s: { entityId: string | null }) => s.entityId === "sample_character" : undefined;
  const manifest = buildManifest(spike.analysis, mapping, store, idMap, filter);
  diagnostics.info("character_segmentation_built", {
    aiRegionCount: spike.analysis.character.partRegions.length,
    aiPartNames: spike.analysis.character.partRegions.map((region) => region.part),
    manifestPartCount: manifest.parts.length,
    manifestParts: manifest.parts.map((part) => ({
      part: part.part,
      strokes: part.strokeIds.length,
      hasPolygon: Boolean(part.polygon),
      confidence: part.confidence,
      source: part.source,
    })),
    uncertainParts: manifest.parts.filter((part) => (part.confidence ?? 0) < 0.5).map((part) => part.part),
    includedStrokes: manifest.includedStrokeIds.length,
  });
  editor.begin(includeSample ? box : characterGuideBox(), manifest, filter);
  editor.nextStage();
  hideRevive();
  hideSampleDemo();
  stageButton.textContent = "ادامه";
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
    speakStoryText("مفصل‌ها هنوز یک پیکر درست نیستن…");
    return;
  }
  appState.setMode("live");
  hideStageButton();
  stageTitleEl.style.opacity = "0";
  replaceCharacter(manifest, true);
  // Free drawing is enabled immediately. If the child starts a balloon while
  // the spawn animation is still playing, that ink remains after this checkpoint.
  beginAwaitingDrawing("free_draw");
  if (storage) void storage.saveManifest(manifest);
  console.log("[pencil-ai] character manifest:", JSON.stringify(manifest, null, 2));
  speakStoryText("آها! پس تو این شکلی…");
}

reviveEl.addEventListener("click", () => startAnalysis(false));
sampleDemoEl.addEventListener("click", () => {
  loadSampleDemo();
  startAnalysis(true);
});
stageButton.addEventListener("click", () => {
  editor.nextStage();
});

editor.onStageChange = (stage) => {
  stageTitleEl.textContent = STAGE_LABELS[stage];
  stageButton.textContent = stage === "joints" ? "زنده‌اش کن" : "ادامه";
  if (stage === "done") {
    hideStageButton();
    finalizeCharacter();
  }
};

function hasPendingReview(): boolean {
  return hasReviewableChanges(store.all(), checkpoint, groundChangePending);
}

function refreshReviewControls(): void {
  hideRevive();
  hideReview();
  const mode = appState.get().mode;
  const canRepair = mode === "awaiting" && activeManifest !== null && !analysisInFlight;
  repairEl.style.opacity = canRepair ? "1" : "0";
  repairEl.style.pointerEvents = canRepair ? "auto" : "none";
  if (mode === "intro" && spike.status !== "analyzing" && spike.status !== "done" && spike.userHasDrawn()) {
    reviveEl.style.opacity = "1";
    reviveEl.style.pointerEvents = "auto";
  } else if (mode === "awaiting" && !analysisInFlight && hasPendingReview()) {
    reviewEl.style.opacity = "1";
    reviewEl.style.pointerEvents = "auto";
    diagnostics.info("drawing_review_button_shown", { checkpoint, strokeCount: store.count(), groundChangePending });
  }
}

reviewEl.addEventListener("click", () => {
  if (analysisInFlight || appState.get().mode !== "awaiting" || !hasPendingReview()) return;
  hideReview();
  void resolveDrawingAttempt();
});

repairEl.addEventListener("click", () => {
  if (!activeManifest || analysisInFlight) return;
  segmentRepair = new SegmentRepairEditor(structuredClone(activeManifest));
  appState.setMode("segmenting");
  hideReview();
  repairEl.style.opacity = "0";
  repairEl.style.pointerEvents = "none";
  repairPaletteEl.style.display = "flex";
  repairPartButtons.get("torso")?.click();
});

repairDoneEl.addEventListener("click", () => {
  if (!segmentRepair) return;
  activeManifest = segmentRepair.manifest;
  activateRig(buildRig(activeManifest, store), false);
  if (storage) void storage.saveManifest(activeManifest);
  segmentRepair = null;
  repairPaletteEl.style.display = "none";
  appState.setMode("awaiting");
  refreshReviewControls();
});

const pointer = new PointerInput(canvas, store, camera, {
  onStrokeStart: () => {
    pencilDown = true;
    hintEl.style.opacity = "0";
    hintVisible = false;
    hideRevive();
    hideReview();
    hideSampleDemo();
    if (bubble.isVisible()) {
      bubble.hide();
      if (bubbleTimer !== null) {
        window.clearTimeout(bubbleTimer);
        bubbleTimer = null;
        quest.trigger({ type: "bubble_shown" });
      }
    }
    speech.stop();
    if (rigRuntime) rigRuntime.talkActive = false;
  },
  onStrokeEnd: (stroke) => {
    pencilDown = false;
    diagnostics.info("drawing_stroke_completed", {
      id: stroke.id,
      mode: appState.get().mode,
      checkpoint,
      strokeCount: store.count(),
      reviewPending: hasPendingReview(),
    });
    if (rigRuntime && appState.get().mode === "live") beginAwaitingDrawing("free_draw", false);
    refreshReviewControls();
    scheduleSave();
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
  onErase: (affectedStrokes) => {
    diagnostics.info("strokes_erased", { affectedStrokes });
    const removedEntityIds = worldEntities.removeByStrokeIds(new Set(affectedStrokes));
    removedEntityIds.forEach((id) => phaserWorld?.removeEntity(id));
    if (removedEntityIds.length > 0) diagnostics.info("world_entities_erased", { removedEntityIds });
    hideRevive();
    scheduleSave();
    refreshReviewControls();
  },
  onEraserMove: (point) => {
    if (!rigRuntime || !groundPath.eraseNear(point, 26)) return;
    groundChangePending = true;
    configurePhysicsGround();
    diagnostics.info("ground_erased", { x: Math.round(point.x) });
    scheduleSave();
    refreshReviewControls();
  },
});

function setInkTool(tool: "pen" | "eraser"): void {
  activeInkTool = tool;
  pointer.setTool(tool);
  eraserEl.style.background = tool === "eraser" ? "#F7F5EE" : "rgba(16,59,70,0.82)";
  eraserEl.style.color = tool === "eraser" ? "#103B46" : "#F7F5EE";
  diagnostics.info("ink_tool_changed", { tool });
}

undoEl.addEventListener("click", () => {
  if (appState.get().mode === "segmenting" && segmentRepair) {
    if (segmentRepair.undo()) diagnostics.info("body_part_correction_undone");
    return;
  }
  if (!canEditInk()) return;
  const undone = store.undo();
  if (!undone) return;
  diagnostics.info("stroke_undone", { id: undone.id });
  hideRevive();
  scheduleSave();
  refreshReviewControls();
});
eraserEl.addEventListener("click", () => {
  if (!canEditInk()) return;
  setInkTool(activeInkTool === "eraser" ? "pen" : "eraser");
});

pointer.interceptor = {
  down: (world) => {
    if (appState.get().mode === "segmenting" && segmentRepair) {
      segmentRepair.pointerDown(world);
      return true;
    }
    if (appState.get().mode !== "setup") return false;
    editor.pointerDown(world);
    return true;
  },
  move: (world) => {
    if (appState.get().mode === "segmenting" && segmentRepair) {
      segmentRepair.pointerMove(world);
      return true;
    }
    if (appState.get().mode !== "setup") return false;
    editor.pointerMove(world);
    return true;
  },
  up: (world) => {
    if (appState.get().mode === "segmenting" && segmentRepair) {
      segmentRepair.pointerMove(world);
      segmentRepair.pointerUp();
      return;
    }
    if (appState.get().mode !== "setup") return;
    editor.pointerUp();
  },
};

function renderFrame(now: number, resolution = window.devicePixelRatio || 1): void {
  const { viewportWidth: w, viewportHeight: h } = appState.get();
  const dt = Math.min(64, now - lastFrame);
  lastFrame = now;

  ctx.setTransform(resolution, 0, 0, resolution, 0, 0);

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = PALETTE.primaryInk;
  ctx.lineWidth = BASE_LINE_WIDTH + 1;
  ctx.lineCap = "round";
  for (const poly of groundPath.screenPolylines(camera.state.x)) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  if (appState.get().mode === "intro" && !rigRuntime) {
    const guide = characterGuideBox();
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    ctx.strokeStyle = "rgba(216,246,255,0.42)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 9]);
    ctx.strokeRect(guide.x, guide.y, guide.width, guide.height);
    ctx.setLineDash([]);
    ctx.restore();
  }

  pond?.draw(ctx, camera, now);

  for (const stroke of store.all()) {
    if (stroke.active && stroke.entityId === null && !riggedStrokeIds.has(stroke.id)) {
      renderer.drawStroke(ctx, stroke, camera);
    }
  }

  if (rigRuntime) {
    if (walking && walker) {
      walker.step(dt);
      const pos = walker.position();
      rigRuntime.moveEntityTo(pos.x, rigRuntime.entityTransform.y);
      phaserWorld?.placeCharacter(rigRuntime);
      if (walker.finished) {
        walking = false;
        quest.trigger({ type: "walk_complete" });
        animController.playById("stop_at_pond");
      }
      const targetCameraX = pos.x - w * 0.33;
      camera.setX(easeToward(camera.state.x, targetCameraX, dt));
      phaserWorld?.setCameraX(camera.state.x);
    } else {
      phaserWorld?.syncCharacter(rigRuntime);
      if (phaserWorld?.isNavigating) {
        const root = rigRuntime.jointWorld("root");
        if (root) {
          if (navigationLastX !== null) navigationTravel += Math.abs(root.x - navigationLastX);
          navigationLastX = root.x;
          animController.setWalkDistance(navigationTravel, 90 * rigRuntime.proportionScale);
        }
        physicsNavigationWasActive = true;
        if (root && root.x - camera.state.x > w * 0.58) {
          camera.setX(easeToward(camera.state.x, root.x - w * 0.38, dt));
          phaserWorld.setCameraX(camera.state.x);
        }
      } else if (physicsNavigationWasActive) {
        physicsNavigationWasActive = false;
        navigationTravel = 0;
        navigationLastX = null;
        if (animController.currentId === "walk") animController.playById("idle");
      }
    }

    const physicsMotion = phaserWorld?.motionState();
    if (physicsMotion === "falling" && animController.currentId !== "fall") {
      rigRuntime.expression = "surprised";
      animController.playById("fall");
    } else if ((physicsMotion === "grounded" || physicsMotion === "landing") && animController.currentId === "fall") {
      rigRuntime.expression = "neutral";
      animController.playById("idle");
    }

    const pose = animController.update(now);
    if (animController.currentId !== "scratch_head") rigRuntime.clearIK();
    rigRuntime.applyPose({
      jointRotations: pose.jointRotations,
      rootDeltaX: 0,
      rootDeltaY: pose.rootDeltaY * rigRuntime.proportionScale,
      rootRotation: pose.rootRotation,
    });

    const strokes = rigRuntime.transformedStrokeSegments();
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    rigRuntime.strokes.forEach((rigStroke, i) => {
      const segments = strokes[i];
      if (!segments) return;
      segments.forEach((points) => renderer.drawRigStroke(ctx, rigStroke, points));
    });

    for (const attachment of attachments) {
      if (!attachment.visible) continue;
      const pointGroups = attachmentWorldPoints(attachment, rigRuntime);
      pointGroups.forEach((points, index) => {
        if (points.length < 2) return;
        const stroke = attachment.strokes[index];
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.baseWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        points.forEach((point, pointIndex) => (pointIndex === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
        ctx.stroke();
      });
    }

    if (pond?.fish.caught) {
      const line = attachments.find((a) => a.id === "fish_line");
      if (line) {
        const points = attachmentWorldPoints(line, rigRuntime).at(0) ?? [];
        const end = points[points.length - 1];
        if (end) pond.drawCaughtFish(ctx, { x: end.x, y: end.y + 8 });
      }
    }
    ctx.restore();
  }

  if (appState.get().mode === "setup") {
    editor.draw(ctx, camera);
    stageTitleEl.style.opacity = "1";
  }
  if (appState.get().mode === "segmenting" && segmentRepair) segmentRepair.draw(ctx, camera);

  if (bubble.isVisible()) bubble.updateAnchor(headAnchorScreen());

  const liveStroke = pointer.liveStroke;
  if (liveStroke) renderer.drawLiveStroke(ctx, liveStroke, camera);

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

}

appState.subscribe((state) => {
  if (state.mode !== "intro" && state.mode !== "awaiting") setInkTool("pen");
  if (state.mode === "intro" && state.viewportWidth > 0) {
    window.setTimeout(() => {
      if (!hintVisible && store.active().filter((stroke) => stroke.entityId === null).length === 0) {
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
phaserWorld = new PhaserWorldController(
  canvas,
  {
    render: (now, _context, resolution) => renderFrame(now, resolution),
    ready: () => {
      configurePhysicsGround();
      if (rigRuntime) phaserWorld?.attachCharacter(rigRuntime);
    },
    diagnostic: (event, detail) => diagnostics.info(event, detail),
  },
  window.innerWidth,
  window.innerHeight,
);

void restoreSession().then(() => {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register("/sw.js").catch(() => void 0);
  }
});

console.log("[pencil-ai] phase 7 bootstrap ready");
