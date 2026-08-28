import { AppStateController } from "./app-state.js";
import { StrokeStore, type Stroke } from "../drawing/stroke-store.js";
import { StrokeRenderer } from "../drawing/stroke-renderer.js";
import { PointerInput, type PencilEvent } from "../drawing/pointer-input.js";
import { IdMap } from "../drawing/id-map.js";
import { Camera } from "../world/camera.js";
import { GroundPath } from "../world/ground-path.js";
import { SpeechBubble } from "../story/speech-bubble.js";
import { GeneratedSpeech } from "../story/generated-speech.js";
import { INTERJECTIONS } from "../story/interjections.js";
import { StoryBeatCoordinator, type StoryBeat } from "../story/story-beat.js";
import { SfxEngine } from "../audio/sfx-engine.js";
import { buildSampleCharacter, buildSampleManifest } from "./sample-character.js";
import { AnalysisSpike } from "../character/analysis-spike.js";
import { JointEditor } from "../character/joint-editor.js";
import { buildManifest, migrateManifest, type CharacterManifest } from "../character/character-manifest.js";
import { buildRig, type Rig } from "../character/rig-builder.js";
import { RigRuntime } from "../character/rig-runtime.js";
import { AnimationController } from "../animation/animation-controller.js";
import { MOTION_CLIPS, type MotionId } from "../animation/motion-clips.js";
import { QuestEngine, type StoryCommand } from "../story/quest-engine.js";
import { PondScene } from "../world/pond-scene.js";
import { Walker, easeToward } from "../world/walker.js";
import type { Attachment } from "../character/attachments.js";
import { attachmentWorldPoints, buildAttachmentFromObject } from "../character/attachments.js";
import { captureViewport, captureDelta } from "../ai/capture.js";
import { analyzeDrawing } from "../ai/ai-client.js";
import { imageToWorldX, imageToWorldY, worldToImage, type CaptureMapping } from "../ai/normalization.js";
import { looksPersian } from "../ai/text.js";
import type { DrawingAnalysis } from "../ai/schemas.js";
import type { AIActionRequest } from "../ai/schemas.js";
import { createSessionStorage } from "../storage/indexed-db.js";
import { ConversationHistory, type ConversationEntry } from "../story/conversation-history.js";
import { PALETTE, BASE_LINE_WIDTH, BASE_LINE_Y_RATIO } from "./constants.js";
import { createDiagnostics } from "./diagnostics.js";
import { PhaserWorldController } from "../world/phaser-world.js";
import { farthestToolPoint, fishingHookPosition, movementDestination } from "../world/interaction-geometry.js";
import { REPAIR_PARTS, SegmentRepairEditor, partColor, type RepairPart } from "../character/segment-repair.js";
import { WorldEntityRegistry, type WorldEntity } from "../world/world-entity.js";
import type { PhysicsShape } from "../world/phaser-world.js";
import { hasReviewableChanges, nextReviewCheckpoint, temporaryReviewStrokeIds } from "./manual-review.js";
import { validateActionRequest } from "../ai/action-protocol.js";
import { installLivingLineHero, LIVING_LINE_HERO_ID, type HeroVoicePreset } from "../character/living-line-hero.js";
import { QUESTS, type QuestState } from "../story/quest-engine.js";
import { normalizeShoeCandidates, ShoeTutorialProgress } from "../story/shoe-tutorial.js";
import { resolveObjectStrokes } from "../world/object-strokes.js";
import {
  createLadderRescuePlan,
  MovableWorldObject,
  RescueStateController,
  rescueWaypointAt,
  type LadderRescuePlan,
} from "../world/ladder-rescue.js";

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
const speechDebugEnabled = new URLSearchParams(window.location.search).get("debug") === "speech";
const characterDebugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "character";
const speech = new GeneratedSpeech((event, detail) => {
  diagnostics.info(`speech_${event}`, detail);
  if (speechDebugEnabled) {
    void fetch("/api/debug/speech-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, detail, userAgent: navigator.userAgent }),
      keepalive: true,
    }).catch(() => void 0);
  }
});
const idMap = new IdMap();
const storage = createSessionStorage();
const worldEntities = new WorldEntityRegistry();
const conversation = new ConversationHistory();
const sfx = new SfxEngine(() => speech.getContext(), (event, detail) => diagnostics.info(event, detail));

const getViewport = () => {
  const { viewportWidth: width, viewportHeight: height } = appState.get();
  return { width, height };
};

const editor = new JointEditor(store, getViewport);
const spike = new AnalysisSpike(store, camera, getViewport, () => groundPath, bubble, diagnostics, () => characterGuideBox());
const animController = new AnimationController();
const quest = new QuestEngine();
const shoeProgress = new ShoeTutorialProgress();

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
let lastFrame = performance.now();
let segmentRepair: SegmentRepairEditor | null = null;
let physicsNavigationWasActive = false;
let navigationTravel = 0;
let navigationLastX: number | null = null;
let lastFootstepAt = 0;
let lastDrawSfxAt = 0;
let pendingDrawingReaction: {
  action: AIActionRequest | null;
  entityIds: string[];
  emotion: HeroVoicePreset;
  bubble: string;
  spoken: string;
  actionId: string;
} | null = null;
const navigationMemories = new Map<string, string>();
let introBumpStartedAt: number | null = null;
let introTimer: number | null = null;
const rescueState = new RescueStateController();
let rescuePlan: LadderRescuePlan | null = null;
let rescueStartedAt: number | null = null;
let rescueLadderId: string | null = null;
const movableObjects = new Map<string, MovableWorldObject>();
const movableStrokeIds = new Set<string>();
let fishingLine: { waterPoint: { x: number; y: number }; pullStartedAt: number | null } | null = null;

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
    }
  };
}

function startFreePlay(resetCheckpoint = true): void {
  beginAwaitingDrawing("free_draw", resetCheckpoint);
}

function installFixedHero(playSpawn: boolean): void {
  const { viewportWidth: width, viewportHeight: height } = appState.get();
  const manifest = installLivingLineHero(
    store,
    camera.state.x + width * 0.31,
    Math.round(height * BASE_LINE_Y_RATIO),
  );
  activateRig(buildRig(manifest, store), playSpawn);
  activeManifest = null;
}

function startLivingLineIntro(): void {
  appState.setMode("intro");
  introBumpStartedAt = performance.now();
  if (introTimer !== null) window.clearTimeout(introTimer);
  introTimer = window.setTimeout(() => {
    introTimer = null;
    introBumpStartedAt = null;
    installFixedHero(false);
    appState.setMode("live");
    storyStarted = true;
    quest.trigger({ type: "hero_ready" });
  }, 1250);
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
  if (!worldBuilt) {
    groundPath = new GroundPath([
      { x: 0, y: baselineY },
      { x: w * 3, y: baselineY },
    ]);
    worldBuilt = true;
    const pondX = Math.round(w * 1.45);
    pond = new PondScene(pondX, baselineY - 26, 190, 72);
    // Stop on dry ground before the open waterline rather than at its center.
    walker = new Walker(groundPath, pond.approachStopX());
  } else {
    groundPath.setHorizontalY(baselineY);
    groundPath.extendHorizontalTo(camera.state.x + w * 3);
  }
  configurePhysicsGround();
}

function ensureGroundAhead(): void {
  const { viewportWidth: width } = appState.get();
  if (groundPath.maxX >= camera.state.x + width * 2.5) return;
  if (groundPath.extendHorizontalTo(camera.state.x + width * 6)) configurePhysicsGround();
}

function configurePhysicsGround(): void {
  const { viewportWidth: width, viewportHeight: height } = appState.get();
  const worldEnd = Math.max(groundPath.maxX, width * 3, 1);
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
        .filter((s) => s.active && s.entityId !== LIVING_LINE_HERO_ID)
        .map((s) => s),
    );
    void storage.saveQuest({
      version: 3,
      state: quest.state,
      walking,
      checkpoint,
      attachments,
      worldEntities: worldEntities.all(),
      entityTransform: rigRuntime?.entityTransform ?? null,
      camera: camera.state,
      conversation: conversation.snapshot(),
    });
  }, 1500);
}

async function restoreSession(): Promise<boolean> {
  if (!storage) return false;
  try {
    const savedQuest = await storage.loadQuest<{
      version?: number;
      state: string;
      walking: boolean;
      checkpoint?: number;
      attachments?: Attachment[];
      worldEntities?: WorldEntity[];
      entityTransform?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number } | null;
      camera?: { x: number; y: number };
      conversation?: ConversationEntry[];
    }>();
    if (savedQuest?.version !== 3) {
      await storage.clearSession();
      return false;
    }
    conversation.restore(savedQuest.conversation ?? []);
    if (savedQuest.state === "AWAIT_SHOES" || savedQuest.state === "EQUIP_SHOES") {
      await storage.clearSession();
      shoeProgress.reset();
      return false;
    }
    const savedStrokes = await storage.loadStrokes<Array<Record<string, unknown>>>();
    if (savedQuest.camera) {
      camera.setX(savedQuest.camera.x);
      camera.state.y = savedQuest.camera.y;
    }
    installFixedHero(false);
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
    if (savedQuest.entityTransform && rigRuntime) rigRuntime.setEntityTransform(savedQuest.entityTransform);
    attachments = savedQuest.attachments ?? [];
    for (const entity of savedQuest.worldEntities ?? []) {
      worldEntities.upsert(entity);
      if (entity.physicsShape) phaserWorld?.addEntity({ id: entity.id, shape: entity.physicsShape, ...entity.bounds });
      if (entity.transform && entity.sourceStrokeIds.length > 0) {
        const source = entity.sourceStrokeIds.map((id) => store.byId(id)).filter((stroke): stroke is Stroke => Boolean(stroke));
        if (source.length > 0) {
          const movable = new MovableWorldObject(entity.id, source, { x: entity.transform.originX, y: entity.transform.originY });
          movable.setTransform(entity.transform);
          movableObjects.set(entity.id, movable);
          entity.sourceStrokeIds.forEach((id) => movableStrokeIds.add(id));
        }
      }
    }
    checkpoint = savedQuest.checkpoint ?? store.count();
    storyStarted = true;
    const restoredState = isQuestState(savedQuest.state) ? savedQuest.state : "DORMANT";
    if (restoredState === "AWAIT_SHOES") {
      quest.restore(restoredState);
      beginAwaitingDrawing("draw_shoes", false);
    } else if (restoredState === "WALK_TO_POND") {
      quest.restore(restoredState);
      startWalk();
    } else if (restoredState === "AWAIT_TOOL") {
      quest.restore(restoredState);
      beginAwaitingDrawing("draw_fishing_tool", false);
    } else if (["REQUEST_TOOL", "EQUIP_TOOL", "FISHING"].includes(restoredState)) {
      quest.restore("AWAIT_TOOL");
      beginAwaitingDrawing("draw_fishing_tool", false);
    } else if (restoredState === "ENDING") {
      quest.restore(restoredState);
      startFreePlay(false);
    } else if (restoredState === "EQUIP_SHOES") {
      quest.restore("AWAIT_SHOES");
      beginAwaitingDrawing("draw_shoes", false);
    } else {
      quest.restore("DORMANT");
      appState.setMode("live");
      quest.trigger({ type: "hero_ready" });
    }
    return true;
  } catch (error) {
    console.warn("[line-pal] session restore failed", error);
    return false;
  }
}

function isQuestState(value: string): value is QuestState {
  return ["DORMANT", "SPAWN", "AWAIT_SHOES", "EQUIP_SHOES", "WALK_TO_POND", "REQUEST_TOOL", "AWAIT_TOOL", "EQUIP_TOOL", "FISHING", "ENDING"].includes(value);
}

function headAnchorScreen(): { x: number; y: number } {
  const { viewportWidth: w, viewportHeight: h } = appState.get();
  const head = rigRuntime?.jointScreen("head", camera);
  return head ? { x: head.x, y: head.y - 60 } : { x: w * 0.5, y: h * 0.4 };
}

const storyBeats = new StoryBeatCoordinator({
  showBubble: (beat) => {
    bubble.show(beat.bubble, headAnchorScreen());
    diagnostics.info("story_beat_shown", { id: beat.id, emotion: beat.emotion, motion: beat.motion ?? null });
  },
  playSpeech: (request) => speech.play({
    ...request,
    onPlaybackStart: () => {
      if (rigRuntime) rigRuntime.talkActive = true;
      request.onPlaybackStart?.();
    },
  }),
  isSpeechInstant: (beat) => speech.isInstant({
    text: beat.spoken,
    preset: beat.emotion,
    audioUrl: beat.audioUrl,
    fallbackAudioUrl: beat.fallbackAudioUrl,
  }),
  startMotion: (beat) => startBeatMotion(beat),
  onSettled: (beat, result) => {
    if (rigRuntime) rigRuntime.talkActive = false;
    if (beat.motion === "point") rigRuntime?.clearPointing();
    if (animController.currentId === beat.motion || animController.currentId === "talk") animController.playById("idle");
    diagnostics.info("story_beat_settled", { id: beat.id, speechStatus: result.status, durationMs: result.durationMs });
  },
  cancelSpeech: (reason) => {
    speech.cancel(reason);
    if (rigRuntime) rigRuntime.talkActive = false;
    rigRuntime?.clearPointing();
  },
});

let storyBeatSequence = 0;

function startBeatMotion(beat: StoryBeat): Promise<void> {
  const motion = beat.motion ?? motionForEmotion(beat.emotion);
  if (!rigRuntime || !motion) return Promise.resolve();
  setExpressionForEmotion(beat.emotion);
  animController.playById(motion);
  const clip = MOTION_CLIPS[motion];
  const durationMs = clip ? clip.durationMs : 0;
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

function speakStoryText(
  bubbleText: string,
  spokenText = bubbleText,
  preset: HeroVoicePreset = "curious",
  audioUrl?: string,
  motion?: MotionId,
  fallbackAudioUrl?: string,
): void {
  conversation.append("hero", "message", `Bubble: ${bubbleText} Spoken: ${spokenText}`);
  scheduleSave();
  const id = `beat_${++storyBeatSequence}`;
  void storyBeats.enqueue({ id, bubble: bubbleText, spoken: spokenText, emotion: preset, audioUrl, fallbackAudioUrl, motion }).then((result) => {
    diagnostics.info("generated_speech", { status: result.status, textLength: spokenText.length, preset, source: result.source });
    if (result.status !== "cancelled") quest.trigger({ type: "bubble_shown" });
  });
}

function beginAwaitingDrawing(goalId: string, resetCheckpoint = true): void {
  awaitingGoalId = goalId;
  checkpoint = nextReviewCheckpoint(checkpoint, store.count(), resetCheckpoint);
  analysisInFlight = false;
  appState.setMode("awaiting");
  diagnostics.info("drawing_review_ready", { goalId, checkpoint, strokeCount: store.count(), resetCheckpoint });
  refreshReviewControls();
}

function beginAwaitingRescue(resetCheckpoint = true): void {
  awaitingGoalId = "rescue_ladder";
  checkpoint = nextReviewCheckpoint(checkpoint, store.count(), resetCheckpoint);
  analysisInFlight = false;
  appState.setMode("fallen_waiting_rescue");
  diagnostics.info("drawing_review_ready", { goalId: "rescue_ladder", checkpoint, strokeCount: store.count(), resetCheckpoint });
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
  // Keep broad hand-part aliases for provider compatibility; the authored
  // index and thumb tip anchors above are the canonical finger coordinates.
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

    const questDefinition = QUESTS[goalId];
    const goal = goalId === "rescue_ladder"
      ? "The fixed hero has fallen below a gap. Recognize whether the child drew a ladder for rescue; return physicsShape=ladder and action=rescue targeting it."
      : questDefinition?.prompt ?? "Open-ended free play: understand whatever the child just drew, erased, or wrote and make the fixed hero react appropriately.";
    const acceptedCategories = goalId === "rescue_ladder"
      ? ["ladder"]
      : questDefinition?.acceptedCategories ?? ["clothing", "shoe", "hat", "tool", "food", "animal", "person", "symbol", "handwriting", "scene_object"];

    const root = rigRuntime.restJoint("root");
    const edges = root ? groundPath.nearestIntactEdges(root.x) : { left: null, right: null };
    const worldSummary = `The character root is at (${Math.round(root?.x ?? 0)}, ${Math.round(root?.y ?? 0)}). Rescue phase: ${rescueState.phase}. The white ground line is normally continuous. Ground erased: ${groundPath.erased}. Nearest intact edges: left=${edges.left === null ? "none" : Math.round(edges.left)}, right=${edges.right === null ? "none" : Math.round(edges.right)}. Nearby entities: ${worldEntities.summary() || "none"}.`.slice(0, 400);

    const result = await analyzeDrawing(
      full.dataUrl,
      delta,
      { width: full.mapping.width, height: full.mapping.height },
      goal,
      jointsInImageCoords(),
      worldSummary,
      acceptedCategories,
      conversation.forAI(),
    );
    const analysis = result.analysis;
    conversation.append("child", "drawing", `New input understood as: ${analysis.interpretation || "unrecognized"}`);
    scheduleSave();
    const tutorialAction = goalId === "draw_shoes"
      ? "equip_shoes"
      : goalId === "draw_fishing_tool" ? "equip_tool" : null;
    if (analysis.recognized || analysis.mappedAction === "ground_erased") {
      succeeded = true;
      pendingDetected = analysis;
      const reviewSourceStrokeIds = new Set(newStrokes.map((stroke) => stroke.id));
      pendingSourceStrokeIds = new Set(reviewSourceStrokeIds);
      lastFullMapping = full.mapping;
      const registered = registerWorldObjects(analysis, full.mapping, reviewSourceStrokeIds);
      const bubbleText = looksPersian(analysis.reaction.bubble)
        ? analysis.reaction.bubble
        : "دیدمش! بذار ببینم باهاش چی کار می‌شه کرد…";
      const spokenText = looksPersian(analysis.reaction.spoken) ? analysis.reaction.spoken : bubbleText;
      if (goalId === "rescue_ladder") {
        if (!startLadderRescue(analysis, registered.entityIds, reviewSourceStrokeIds)) {
          const hint = "هوم... این یکی نردبان نیست؛ یک نردبان پله‌پله برام بکش.";
          speakStoryText(hint, hint, "confused", undefined, "confused");
          beginAwaitingRescue(false);
        }
      } else if (goalId === "draw_shoes") {
        const addedShoes = equipTutorialShoes(analysis, full.mapping, registered.strokeIdsByObject);
        if (shoeProgress.complete) {
          const successBubble = "چه خفن! حالا هر دو پام کفش دارن؛ بریم!";
          quest.trigger({
            type: "drawing_validated",
            action: "equip_shoes",
            reactionBubble: successBubble,
            reactionSpoken: successBubble,
            emotion: "delighted",
          });
        } else if (addedShoes > 0) {
          const missingText = "رفیق، پای دیگه‌ام هنوز یک کفش می‌خواد.";
          speakStoryText(missingText, missingText, "curious", undefined, "confused");
          beginAwaitingDrawing(goalId, false);
        } else {
          quest.trigger({ type: "drawing_invalid", message: bubbleText });
          beginAwaitingDrawing(goalId, false);
        }
      } else if (tutorialAction !== null && analysis.matchesGoal && analysis.mappedAction === tutorialAction) {
        quest.trigger({
          type: "drawing_validated",
          action: tutorialAction,
          reactionBubble: bubbleText,
          reactionSpoken: spokenText,
          emotion: analysis.reaction.emotion,
        });
      } else if (tutorialAction) {
        quest.trigger({ type: "drawing_invalid", message: bubbleText });
        beginAwaitingDrawing(goalId, false);
      } else {
        equipDetectedObjects(analysis, full.mapping, registered.strokeIdsByObject);
        walkToDrawingReaction(analysis, registered.entityIds, bubbleText, spokenText);
        beginAwaitingDrawing("free_draw", true);
      }
      // Ownership must be settled before unrecognized ink is swept away:
      // strokes an attachment claimed carry an entityId only after equipping.
      clearTemporaryReviewInk(reviewSourceStrokeIds, registered.retainedStrokeIds);
      groundChangePending = false;
      diagnostics.info("drawing_analysis_succeeded", { goalId, objects: analysis.objects.length, action: analysis.mappedAction });
    } else {
      const fallback = looksPersian(analysis.reaction.bubble) ? analysis.reaction.bubble : "هوم... این یکی رو نفهمیدم؛ یک نشونهٔ دیگه اضافه کن.";
      if (tutorialAction) quest.trigger({ type: "drawing_invalid", message: fallback });
      else speakStoryText(fallback, looksPersian(analysis.reaction.spoken) ? analysis.reaction.spoken : fallback, "confused");
      if (goalId === "rescue_ladder") beginAwaitingRescue(false);
      else beginAwaitingDrawing(goalId, false);
      diagnostics.info("drawing_analysis_rejected", { goalId, interpretation: analysis.interpretation });
    }
  } catch (error) {
    diagnostics.error("drawing_analysis_failed", error);
    speakStoryText("هوم... این یکی رو نفهمیدم. یه بار دیگه؟", "هوم... این یکی رو نفهمیدم. یه بار دیگه؟", "confused");
    if (goalId === "rescue_ladder") beginAwaitingRescue(false);
    else beginAwaitingDrawing(goalId, false);
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

function setExpressionForEmotion(emotion: HeroVoicePreset): void {
  if (!rigRuntime) return;
  if (emotion === "sad") {
    rigRuntime.expression = "sad";
  } else if (emotion === "delighted") {
    rigRuntime.expression = "happy";
  } else if (emotion === "protesting") {
    rigRuntime.expression = "surprised";
  } else {
    rigRuntime.expression = "neutral";
  }
}

function motionForEmotion(emotion: HeroVoicePreset): MotionId {
  if (emotion === "sad") return "sad";
  if (emotion === "delighted") return "happy";
  if (emotion === "protesting") return "protest";
  if (emotion === "effort") return "effort";
  if (emotion === "confused" || emotion === "curious") return "confused";
  return "talk";
}

function finishDrawingReaction(
  action: AIActionRequest | null,
  entityIds: string[],
  emotion: HeroVoicePreset,
  bubbleText: string,
  spokenText: string,
): void {
  const actionExecuted = executeAIAction(action, entityIds);
  const actionMotion = actionExecuted && action?.type === "point" ? "point" : undefined;
  speakStoryText(bubbleText, spokenText, emotion, undefined, actionMotion ?? (actionExecuted ? undefined : motionForEmotion(emotion)));
  refreshReviewControls();
}

function walkToDrawingReaction(analysis: DrawingAnalysis, entityIds: string[], bubbleText: string, spokenText: string): void {
  if (!rigRuntime || analysis.objects.length === 0 || analysis.mappedAction === "ground_erased") {
    finishDrawingReaction(analysis.action ?? null, entityIds, analysis.reaction.emotion, bubbleText, spokenText);
    return;
  }
  if (analysis.action?.type === "move" || analysis.action?.type === "climb") {
    if (!executeAIAction(analysis.action, entityIds)) {
      finishDrawingReaction(null, entityIds, analysis.reaction.emotion, bubbleText, spokenText);
      return;
    }
    const actionId = phaserWorld?.navigationSnapshot().actionId;
    if (!actionId) {
      finishDrawingReaction(null, entityIds, analysis.reaction.emotion, bubbleText, spokenText);
      return;
    }
    pendingDrawingReaction = {
      action: null,
      entityIds,
      emotion: analysis.reaction.emotion,
      bubble: bubbleText,
      spoken: spokenText,
      actionId,
    };
    return;
  }
  const root = rigRuntime.jointWorld("root");
  const mapping = lastFullMapping;
  const leftEdge = mapping ? Math.min(...analysis.objects.map((object) => imageToWorldX(object.boundingBox.x, mapping))) : Number.NaN;
  const rightEdge = mapping ? Math.max(...analysis.objects.map((object) => imageToWorldX(object.boundingBox.x + object.boundingBox.width, mapping))) : Number.NaN;
  const clearance = Math.max(42, 46 * rigRuntime.proportionScale);
  const targetX = root && root.x <= leftEdge ? leftEdge - clearance : rightEdge + clearance;
  if (!root || !Number.isFinite(targetX) || Math.abs(root.x - targetX) < 12) {
    finishDrawingReaction(analysis.action ?? null, entityIds, analysis.reaction.emotion, bubbleText, spokenText);
    return;
  }
  ensureGroundAhead();
  const navigation = phaserWorld?.walkTo(targetX);
  if (!navigation?.started) {
    diagnostics.info("drawing_reaction_walk_not_started", { reason: navigation?.reason ?? "physics_world_unavailable", targetX });
    finishDrawingReaction(analysis.action ?? null, entityIds, analysis.reaction.emotion, bubbleText, spokenText);
    return;
  }
  pendingDrawingReaction = {
    action: analysis.action ?? null,
    entityIds,
    emotion: analysis.reaction.emotion,
    bubble: bubbleText,
    spoken: spokenText,
    actionId: navigation.actionId,
  };
  animController.playById("walk");
  navigationMemories.set(navigation.actionId, `approach the newly drawn object and stop before it at x=${Math.round(targetX)}`);
  conversation.append("system", "action", `Hero started walking toward the new drawing; destination x=${Math.round(targetX)}.`);
  diagnostics.info("drawing_reaction_walk_started", { actionId: navigation.actionId, targetX, leftEdge, rightEdge });
}

function inferredPhysicsShape(object: DrawingAnalysis["objects"][number]): PhysicsShape | null {
  if (object.physicsShape && object.physicsShape !== "none") return object.physicsShape;
  const semantic = `${object.type} ${object.affordances.join(" ")}`.toLowerCase();
  if (/ladder|نردبان/.test(semantic)) return "ladder";
  if (/stair|step|پله/.test(semantic)) return "stairs";
  if (/slope|ramp|شیب/.test(semantic)) return "slope";
  if (/platform|bridge|surface|پل|سکو/.test(semantic)) return "platform";
  if (/box|ball|rock|crate|توپ|سنگ|جعبه/.test(semantic)) return "dynamic";
  if (/wall|obstacle|barrier|دیوار|مانع/.test(semantic)) return "obstacle";
  return null;
}

function isLadderObject(object: DrawingAnalysis["objects"][number]): boolean {
  const semantic = `${object.type} ${object.affordances.join(" ")}`.toLowerCase();
  return object.physicsShape === "ladder" || /ladder|نردبان/.test(semantic);
}

function startLadderRescue(
  analysis: DrawingAnalysis,
  entityIds: string[],
  reviewSourceStrokeIds: ReadonlySet<string>,
): boolean {
  if (!rigRuntime || rescueState.phase !== "FALLEN_WAITING_RESCUE") return false;
  const ladderIndex = analysis.objects.findIndex(isLadderObject);
  if (ladderIndex < 0) return false;
  const entityId = entityIds[ladderIndex];
  const entity = entityId ? worldEntities.get(entityId) : null;
  if (!entity) return false;
  const sourceIds = entity.sourceStrokeIds.length > 0 ? entity.sourceStrokeIds : [...reviewSourceStrokeIds];
  const source = sourceIds.map((id) => store.byId(id)).filter((stroke): stroke is Stroke => Boolean(stroke?.active));
  if (source.length === 0) return false;
  worldEntities.setSourceStrokeIds(entityId, sourceIds);
  const ladder = new MovableWorldObject(entityId, source);
  const root = rigRuntime.jointWorld("root");
  if (!root) return false;
  const edges = groundPath.nearestIntactEdges(root.x);
  const baselineY = Math.round(getViewport().height * BASE_LINE_Y_RATIO);
  let plan: LadderRescuePlan;
  try {
    plan = createLadderRescuePlan({
      hero: root,
      baselineY,
      leftEdge: edges.left,
      rightEdge: edges.right,
      ladder,
    });
  } catch (error) {
    diagnostics.error("ladder_rescue_plan_failed", error);
    return false;
  }
  phaserWorld?.removeEntity(entityId);
  if (!phaserWorld?.beginRescue()) return false;
  sourceIds.forEach((id) => movableStrokeIds.add(id));
  movableObjects.set(entityId, ladder);
  rescueLadderId = entityId;
  rescuePlan = plan;
  rescueStartedAt = performance.now();
  if (!rescueState.begin()) return false;
  appState.setMode("rescuing");
  groundChangePending = false;
  animController.playById("ladder_pickup");
  const line = "خب مشتی، نردبان رو می‌گیرم؛ محکم نگهش دار!";
  speakStoryText(line, line, "effort", undefined, "ladder_pickup");
  diagnostics.info("ladder_rescue_started", { entityId, edge: plan.edge, waypoints: plan.waypoints.length });
  refreshReviewControls();
  return true;
}

function registerWorldObjects(
  analysis: DrawingAnalysis,
  mapping: CaptureMapping,
  sourceStrokeIds: ReadonlySet<string>,
): { entityIds: string[]; retainedStrokeIds: Set<string>; strokeIdsByObject: string[][] } {
  const boundsByObject = analysis.objects.map((object) => ({
    x: imageToWorldX(object.boundingBox.x, mapping),
    y: imageToWorldY(object.boundingBox.y, mapping),
    width: object.boundingBox.width / mapping.scale,
    height: object.boundingBox.height / mapping.scale,
  }));
  const reviewedStrokes = store.all()
    .filter((stroke) => sourceStrokeIds.has(stroke.id) && stroke.active)
    .map((stroke) => ({ id: stroke.id, points: stroke.points }));
  const { perObject, unmatched } = resolveObjectStrokes(reviewedStrokes, boundsByObject);

  const retainedStrokeIds = new Set<string>(perObject.flat());
  const entityIds = analysis.objects.map((object, index) => {
    const id = `world_${Date.now().toString(36)}_${index}`;
    const bounds = boundsByObject[index];
    const physicsShape = inferredPhysicsShape(object);
    worldEntities.upsert({
      id,
      type: object.type,
      sourceStrokeIds: perObject[index],
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
  diagnostics.info("world_objects_registered", {
    objects: analysis.objects.length,
    matchedStrokes: retainedStrokeIds.size,
    instructionStrokes: unmatched.length,
  });
  return { entityIds, retainedStrokeIds, strokeIdsByObject: perObject };
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
    case "point": {
      if (!target) return false;
      const targetPoint = {
        x: target.bounds.x + target.bounds.width / 2,
        y: target.bounds.y + target.bounds.height / 2,
      };
      const hand = rigRuntime.pointAt(targetPoint);
      if (!hand) return false;
      animController.playById("point");
      diagnostics.info("ai_point_started", { targetId: target.id, hand, target: targetPoint });
      conversation.append("system", "action", `Hero pointed at ${target.type} (${target.id}) with the ${hand} hand.`);
      return true;
    }
    case "move": {
      const root = rigRuntime.jointWorld("root");
      const destination = movementDestination(root?.x ?? 0, action.direction, action.durationMs, target);
      const targetX = destination.x;
      const result = destination.needsClimb
        ? phaserWorld?.climbTo(targetX, undefined, target?.id ?? null)
        : phaserWorld?.walkTo(targetX, undefined, target?.id ?? null);
      if (!result?.started) {
        diagnostics.info("movement_not_started", { action: action.type, reason: result?.reason ?? "physics_world_unavailable", targetId: target?.id });
        return false;
      }
      animController.playById("walk");
      navigationMemories.set(result.actionId, `move${target ? ` across/toward ${target.type} (${target.id})` : ""} to x=${Math.round(targetX)}`);
      conversation.append("system", "action", `Hero started the requested move${target ? ` toward ${target.type} (${target.id})` : ""}.`);
      return true;
    }
    case "jump":
      if (!phaserWorld?.jump()) {
        diagnostics.info("movement_not_started", { action: action.type, reason: "character_not_grounded" });
        return false;
      }
      animController.playById("happy");
      conversation.append("system", "action", "Hero jumped after the child's request.");
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
      navigationMemories.set(result.actionId, `climb past ${target?.type ?? "the requested obstacle"}`);
      conversation.append("system", "action", `Hero started climbing ${target?.type ?? "the requested obstacle"}.`);
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
    case "rescue":
      // The dedicated fallen-state coordinator owns rescue transforms and
      // climbing; normal free-play must never improvise them here.
      diagnostics.info("ai_action_rejected", { action: action.type, reason: "hero_not_fallen" });
      return false;
  }
}

function equipDetectedObjects(
  analysis: DrawingAnalysis,
  mapping: CaptureMapping,
  strokeIdsByObject: string[][] = [],
): void {
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
    const attachment = buildAttachmentFromObject(
      objectWithWorld, store, idMap, rigRuntime!, index, pendingSourceStrokeIds, 30,
      new Set(strokeIdsByObject[index] ?? []),
    );
    if (attachment) added.push(attachment);
  });
  if (added.length > 0) {
    attachments.push(...added);
    pendingDetected = null;
    pendingSourceStrokeIds.clear();
  }
}

function equipTutorialShoes(
  analysis: DrawingAnalysis,
  mapping: CaptureMapping,
  strokeIdsByObject: string[][] = [],
): number {
  if (!rigRuntime) return 0;
  const leftWorld = rigRuntime.jointWorld("left_foot");
  const rightWorld = rigRuntime.jointWorld("right_foot");
  if (!leftWorld || !rightWorld) return 0;
  const feet = {
    left_foot: worldToImage(leftWorld, mapping),
    right_foot: worldToImage(rightWorld, mapping),
  };
  const candidates = normalizeShoeCandidates(analysis.objects, feet, shoeProgress.snapshot());
  const claimedStrokeIds = new Set<string>();
  let addedCount = 0;
  candidates.forEach((candidate, index) => {
    if (shoeProgress.has(candidate.slot)) return;
    const allowed = new Set([...pendingSourceStrokeIds].filter((id) => !claimedStrokeIds.has(id)));
    const object = candidate.object;
    const objectWithWorld = {
      ...object,
      anchor: object.anchor === null
        ? null
        : { x: imageToWorldX(object.anchor.x, mapping), y: imageToWorldY(object.anchor.y, mapping) },
      boundingBox: {
        x: imageToWorldX(object.boundingBox.x, mapping),
        y: imageToWorldY(object.boundingBox.y, mapping),
        width: object.boundingBox.width / mapping.scale,
        height: object.boundingBox.height / mapping.scale,
      },
    };
    // A split pair shares one source object, so its halves must still be
    // separated by the region sampler rather than by the shared stroke set.
    const resolved = candidate.split
      ? undefined
      : new Set((strokeIdsByObject[candidate.sourceIndex] ?? []).filter((id) => allowed.has(id)));
    const attachment = buildAttachmentFromObject(
      objectWithWorld, store, idMap, rigRuntime!, index, allowed, 10, resolved,
    );
    diagnostics.info("shoe_candidate_resolved", {
      slot: candidate.slot,
      sourceIndex: candidate.sourceIndex,
      split: candidate.split,
      allowed: [...allowed],
      resolved: resolved ? [...resolved] : null,
      claimed: attachment?.sourceStrokeIds ?? null,
    });
    if (!attachment || !shoeProgress.fill(candidate.slot, attachment.id)) return;
    attachment.sourceStrokeIds.forEach((id) => claimedStrokeIds.add(id));
    attachments.push(attachment);
    addedCount++;
  });
  if (addedCount > 0) {
    pendingDetected = null;
    pendingSourceStrokeIds.clear();
    diagnostics.info("shoe_progress_updated", { slots: shoeProgress.snapshot(), complete: shoeProgress.complete });
  }
  return addedCount;
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
    fishingLine = { waterPoint: { x: pond.x - pond.radiusX * 0.12, y: pond.y - 2 }, pullStartedAt: null };
    pond.triggerFishJump(performance.now());
    conversation.append("system", "action", "Hero cast the child's fishing tool; its line runs from the rod tip to a hook over the pond.");
  }, 700);
  animController.onClipEnd = (clipId) => {
    if (clipId === "cast_rod") {
      animController.playById("pull_fish");
      if (pond) {
        pond.fish.caught = true;
        if (fishingLine) fishingLine.pullStartedAt = performance.now();
      }
      animController.onClipEnd = (innerId) => {
        if (innerId === "pull_fish") {
          conversation.append("system", "action", "Hero pulled the fish from the pond with the hook at the rod line's end.");
          quest.trigger({ type: "fish_sequence_done" });
        }
      };
    }
  };
}

quest.onCommand = (command: StoryCommand) => {
  switch (command.type) {
    case "bubble":
      speakStoryText(command.bubble, command.spoken, command.emotion, command.audioUrl, command.motion, command.fallbackAudioUrl);
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
  el.textContent = "حالا نوبت دنیای توست.";
  appEl.appendChild(el);
  window.setTimeout(() => {
    el.remove();
    startFreePlay(true);
  }, 2200);
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
  storyBeats.cancel("restart");
  if (storage) void storage.clearSession();
  window.location.reload();
});
appEl.appendChild(resetEl);

if (speechDebugEnabled) {
  const speechDebugEl = document.createElement("button");
  speechDebugEl.textContent = "🔊 تست صدا";
  speechDebugEl.title = "تست مستقیم صدای مرورگر";
  speechDebugEl.style.cssText = [
    "position:absolute", "z-index:60", "top:max(14px, env(safe-area-inset-top))", "right:14px",
    "min-height:52px", "padding:10px 18px", "border-radius:14px", "border:2px solid #D8F6FF",
    "background:#103B46", "color:#F7F5EE", "font:700 16px system-ui", "direction:rtl",
  ].join(";");
  speechDebugEl.addEventListener("click", () => {
    diagnostics.info("speech_debug_button_clicked", speech.snapshot());
    void speech.play({ text: "سلام! این صدای تازهٔ من است. آماده‌ام نقاشی‌ات را ببینم!", preset: "delighted" }).then((result) => {
      diagnostics.info("speech_debug_completed", speech.snapshot());
      diagnostics.info("speech_debug_result", result);
    });
  });
  appEl.appendChild(speechDebugEl);
}

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
    "justify-content:center", "gap:3px", "touch-action:manipulation", "transition:opacity 180ms",
  ].join(";");
  appEl.appendChild(button);
  return button;
}

const undoEl = makeInkControl("undo", "برگشت", "پاک کردن آخرین خط", "90px");
const eraserEl = makeInkControl("eraser", "پاک‌کن", "پاک‌کن: بخش لمس‌شدهٔ خط را پاک کن", "166px");
let activeInkTool: "pen" | "eraser" = "pen";

function canEditInk(): boolean {
  const mode = appState.get().mode;
  return mode === "awaiting" || mode === "fallen_waiting_rescue";
}

function hideRevive(): void {
  reviveEl.style.opacity = "0";
  reviveEl.style.pointerEvents = "none";
}

function hideReview(): void {
  reviewEl.hidden = true;
  reviewEl.style.opacity = "0";
  reviewEl.style.pointerEvents = "none";
  reviewEl.tabIndex = -1;
  reviewEl.setAttribute("aria-hidden", "true");
}

function hideSampleDemo(): void {
  sampleDemoEl.style.opacity = "0";
  sampleDemoEl.style.pointerEvents = "none";
}

function hideStageButton(): void {
  stageButton.style.opacity = "0";
  stageButton.style.pointerEvents = "none";
}

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
hideReview();

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
    segmentRepair?.previewPart(part);
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
if (characterDebugEnabled) {
  sampleDemoEl.style.opacity = "1";
  sampleDemoEl.style.pointerEvents = "auto";
} else {
  stageButton.hidden = true;
  reviveEl.hidden = true;
  repairEl.hidden = true;
  repairPaletteEl.hidden = true;
  sampleDemoEl.hidden = true;
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
  console.log("[line-pal] character manifest:", JSON.stringify(manifest, null, 2));
  speakStoryText("اوه! پس تو این شکلی…");
}

reviveEl.addEventListener("click", () => startAnalysis(false));
sampleDemoEl.addEventListener("click", () => {
  if (introTimer !== null) window.clearTimeout(introTimer);
  introTimer = null;
  introBumpStartedAt = null;
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
  } else if ((mode === "awaiting" || mode === "fallen_waiting_rescue") && !analysisInFlight && !pendingDrawingReaction && hasPendingReview()) {
    reviewEl.hidden = false;
    reviewEl.style.opacity = "1";
    reviewEl.style.pointerEvents = "auto";
    reviewEl.tabIndex = 0;
    reviewEl.setAttribute("aria-hidden", "false");
    diagnostics.info("drawing_review_button_shown", { checkpoint, strokeCount: store.count(), groundChangePending });
  }
}

reviewEl.addEventListener("click", () => {
  const mode = appState.get().mode;
  if (analysisInFlight || pendingDrawingReaction || (mode !== "awaiting" && mode !== "fallen_waiting_rescue") || !hasPendingReview()) return;
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
    hideRevive();
    hideReview();
    hideSampleDemo();
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
    const nowMs = performance.now();
    if (pencilDown && nowMs - lastDrawSfxAt > 55) {
      const dx = lastPencil ? e.x - lastPencil.x : 0;
      const dy = lastPencil ? e.y - lastPencil.y : 0;
      const speed = Math.hypot(dx, dy) * 0.6;
      sfx.drawTick(speed, e.pressure ?? 0.5);
      lastDrawSfxAt = nowMs;
      if ("vibrate" in navigator) try { navigator.vibrate(6); } catch { void 0; }
    }
    lastPencil = e;
    if (rigRuntime && (appState.get().mode === "live" || appState.get().mode === "awaiting" || appState.get().mode === "fallen_waiting_rescue")) {
      rigRuntime.look = { targetX: e.x, targetY: e.y };
    }
  },
  onPencilDown: (e) => {
    lastPencil = e;
    if ("vibrate" in navigator) try { navigator.vibrate(8); } catch { void 0; }
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
  const undone = store.undo((stroke) => stroke.entityId === null);
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
    if (appState.get().mode === "setup") {
      editor.pointerDown(world);
      return true;
    }
    return appState.get().mode !== "awaiting" && appState.get().mode !== "fallen_waiting_rescue";
  },
  move: (world) => {
    if (appState.get().mode === "segmenting" && segmentRepair) {
      segmentRepair.pointerMove(world);
      return true;
    }
    if (appState.get().mode === "setup") {
      editor.pointerMove(world);
      return true;
    }
    return appState.get().mode !== "awaiting" && appState.get().mode !== "fallen_waiting_rescue";
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

function enterFallenRescue(): void {
  if (!rigRuntime || rescueState.phase === "FALLEN_WAITING_RESCUE" || rescueState.phase === "RESCUING") return;
  const boundaryY = getViewport().height - 92;
  if (!phaserWorld?.holdForRescue(boundaryY)) return;
  if (!rescueState.markFallen()) return;
  groundChangePending = false;
  pendingDrawingReaction = null;
  walking = false;
  animController.playById("sad");
  beginAwaitingRescue(true);
  conversation.append("system", "action", "Hero fell through the erased ground and is waiting below for a drawn ladder.");
  const hint = "اوه! افتادم... یک نردبان پله‌پله برام بکش تا بیام بالا.";
  speakStoryText(hint, hint, "sad", undefined, "sad");
  diagnostics.info("hero_waiting_for_ladder", {
    boundaryY,
    edges: groundPath.nearestIntactEdges(rigRuntime.jointWorld("root")?.x ?? 0),
  });
}

function transformedBounds(movable: MovableWorldObject): { x: number; y: number; width: number; height: number } {
  const points = movable.transformedStrokes().flat();
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: Math.max(8, maxX - minX), height: Math.max(8, maxY - minY) };
}

function updateLadderRescue(now: number): void {
  if (rescueState.phase !== "RESCUING" || rescueStartedAt === null || !rescuePlan || !rescueLadderId) return;
  const ladder = movableObjects.get(rescueLadderId);
  if (!ladder) return;
  const elapsed = now - rescueStartedAt;
  const placementMs = 1_300;
  const climbDelayMs = 220;
  const climbMs = 3_200;
  ladder.setPlacementProgress(rescuePlan.targetTransform, elapsed / placementMs);
  if (elapsed < placementMs + climbDelayMs) return;
  if (animController.currentId !== "ladder_climb") {
    animController.playById("ladder_climb");
    diagnostics.info("ladder_climb_started", { waypoints: rescuePlan.waypoints.length });
  }
  const progress = Math.max(0, Math.min(1, (elapsed - placementMs - climbDelayMs) / climbMs));
  const waypoint = rescueWaypointAt(rescuePlan, progress);
  phaserWorld?.setRescueRootPosition(waypoint);
  if (progress < 1) return;

  ladder.setTransform(rescuePlan.targetTransform);
  const bounds = transformedBounds(ladder);
  worldEntities.setTransform(rescueLadderId, ladder.transform, bounds);
  phaserWorld?.addEntity({ id: rescueLadderId, shape: "ladder", ...bounds, angleDegrees: ladder.transform.rotation });
  phaserWorld?.completeRescue(rescuePlan.landing);
  rescueState.complete();
  rescueStartedAt = null;
  rescuePlan = null;
  rescueLadderId = null;
  animController.playById("happy");
  conversation.append("system", "action", "Hero picked up the child's ladder, placed it at the intact edge, climbed it, and returned safely to the ground.");
  const success = "هوف! رسیدم بالا؛ نردبانت هم همین‌جا می‌مونه.";
  speakStoryText(success, success, "delighted", undefined, "happy");
  beginAwaitingDrawing("free_draw", true);
  scheduleSave();
  diagnostics.info("ladder_rescue_completed", { bounds, navigation: phaserWorld?.navigationSnapshot() });
}

function drawMovableObjects(): void {
  ctx.save();
  ctx.translate(-camera.state.x, -camera.state.y);
  ctx.strokeStyle = PALETTE.primaryInk;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const movable of movableObjects.values()) {
    for (const points of movable.transformedStrokes()) {
      if (points.length < 2) continue;
      ctx.lineWidth = BASE_LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function activeRodTip(): { x: number; y: number } | null {
  if (!rigRuntime) return null;
  const hand = rigRuntime.jointWorld("right_hand");
  if (!hand) return null;
  const tool = [...attachments].reverse().find((attachment) =>
    attachment.visible && attachment.kind === "held_tool" && attachment.boneId === "right_hand",
  );
  if (!tool) return hand;
  return farthestToolPoint(hand, attachmentWorldPoints(tool, rigRuntime));
}

function drawFishingLine(target: CanvasRenderingContext2D, now: number): void {
  if (!fishingLine || !pond) return;
  const tip = activeRodTip();
  if (!tip) return;
  const pullProgress = fishingLine.pullStartedAt === null
    ? 0
    : Math.min(1, Math.max(0, (now - fishingLine.pullStartedAt) / MOTION_CLIPS.pull_fish.durationMs));
  const hook = fishingHookPosition(tip, fishingLine.waterPoint, pullProgress);
  const sag = (1 - pullProgress) * 38;
  target.save();
  target.strokeStyle = PALETTE.primaryInk;
  target.lineWidth = 2;
  target.lineCap = "round";
  target.beginPath();
  target.moveTo(tip.x, tip.y);
  target.quadraticCurveTo((tip.x + hook.x) / 2, Math.max(tip.y, hook.y) + sag, hook.x, hook.y);
  target.stroke();
  target.beginPath();
  target.moveTo(hook.x, hook.y - 2);
  target.quadraticCurveTo(hook.x + 1, hook.y + 10, hook.x + 8, hook.y + 5);
  target.stroke();
  if (pond.fish.caught) pond.drawCaughtFish(target, { x: hook.x + 9, y: hook.y + 5 });
  target.restore();
}

function renderFrame(now: number, resolution = window.devicePixelRatio || 1): void {
  const { viewportWidth: w, viewportHeight: h } = appState.get();
  const dt = Math.min(64, now - lastFrame);
  lastFrame = now;

  ctx.setTransform(resolution, 0, 0, resolution, 0, 0);

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, w, h);

  ensureGroundAhead();
  ctx.strokeStyle = PALETTE.primaryInk;
  ctx.lineWidth = BASE_LINE_WIDTH + 1;
  ctx.lineCap = "round";
  for (const poly of groundPath.screenPolylines(camera.state.x)) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  updateLadderRescue(now);

  if (appState.get().mode === "intro" && !rigRuntime) {
    const elapsed = introBumpStartedAt === null ? 0 : now - introBumpStartedAt;
    const progress = Math.max(0, Math.min(1, elapsed / 1250));
    const bumpX = w * (0.14 + progress * 0.17);
    const bumpY = h * BASE_LINE_Y_RATIO;
    const lift = 7 + Math.sin(progress * Math.PI) * 13;
    ctx.save();
    ctx.strokeStyle = PALETTE.primaryInk;
    ctx.lineWidth = BASE_LINE_WIDTH + 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bumpX - 28, bumpY);
    ctx.bezierCurveTo(bumpX - 15, bumpY, bumpX - 13, bumpY - lift, bumpX, bumpY - lift);
    ctx.bezierCurveTo(bumpX + 13, bumpY - lift, bumpX + 15, bumpY, bumpX + 28, bumpY);
    ctx.stroke();
    ctx.restore();
  }

  pond?.draw(ctx, camera, now);

  for (const stroke of store.all()) {
    if (stroke.active && stroke.entityId === null && !riggedStrokeIds.has(stroke.id) && !movableStrokeIds.has(stroke.id)) {
      renderer.drawStroke(ctx, stroke, camera);
    }
  }
  drawMovableObjects();

  if (rigRuntime) {
    if (walking && walker) {
      walker.step(dt);
      const pos = walker.position();
      rigRuntime.moveEntityTo(pos.x, rigRuntime.entityTransform.y);
      animController.setWalkDistance(walker.distance, 90 * rigRuntime.proportionScale);
      phaserWorld?.placeCharacter(rigRuntime);
      if (walker.finished) {
        walking = false;
        pond?.triggerFishJump(now);
        conversation.append("system", "action", "Hero reached the pond, stopped on dry ground before the water, and saw a fish jump out and fall back in.");
        scheduleSave();
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
        const pending = pendingDrawingReaction;
        const snapshot = phaserWorld?.navigationSnapshot();
        if (snapshot?.actionId) {
          const memory = navigationMemories.get(snapshot.actionId);
          if (memory) {
            conversation.append(
              "system",
              "action",
              snapshot.state === "failed"
                ? `Hero could not complete the requested action (${memory}); reason: ${snapshot.failureReason ?? "unknown"}.`
                : `Hero completed the requested action: ${memory}.`,
            );
            navigationMemories.delete(snapshot.actionId);
            scheduleSave();
          }
        }
        if (pending && snapshot?.actionId === pending.actionId) {
          pendingDrawingReaction = null;
          diagnostics.info("drawing_reaction_walk_finished", {
            actionId: pending.actionId,
            state: snapshot.state,
            failureReason: snapshot.failureReason,
          });
          finishDrawingReaction(pending.action, pending.entityIds, pending.emotion, pending.bubble, pending.spoken);
        }
      }
    }

    const walkingNow = walking || phaserWorld?.isNavigating || animController.currentId === "walk";
    if (walkingNow && now - lastFootstepAt > 340) {
      sfx.footstep(0.85);
      lastFootstepAt = now;
    }
    const physicsMotion = phaserWorld?.motionState();
    const rootForRescue = rigRuntime.jointWorld("root");
    const baselineForRescue = h * BASE_LINE_Y_RATIO;
    if ((rescueState.phase === "NONE" || rescueState.phase === "RECOVERED") && physicsMotion === "falling" && rootForRescue && rootForRescue.y > baselineForRescue + 72) {
      enterFallenRescue();
    }
    if (physicsMotion === "falling" && animController.currentId !== "fall") {
      rigRuntime.expression = "surprised";
      animController.playById("fall");
    } else if ((physicsMotion === "grounded" || physicsMotion === "landing") && animController.currentId === "fall") {
      rigRuntime.expression = "neutral";
      animController.playById("idle");
      sfx.land(0.9);
      if ("vibrate" in navigator) try { navigator.vibrate(12); } catch { void 0; }
    }

    const pose = animController.update(now);
    if (animController.currentId !== "scratch_head" && rigRuntime.pointingHand === null) rigRuntime.clearIK();
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

    drawFishingLine(ctx, now);
    ctx.restore();
  }

  if (appState.get().mode === "setup") {
    editor.draw(ctx, camera);
    stageTitleEl.style.opacity = "1";
  }
  if (appState.get().mode === "segmenting" && segmentRepair) segmentRepair.draw(ctx, camera);

  if (rigRuntime) rigRuntime.voiceLevel = speech.getVoiceLevel();
  else speech.getVoiceLevel();
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
  if (state.mode !== "intro" && state.mode !== "awaiting" && state.mode !== "fallen_waiting_rescue") setInkTool("pen");
  const inkControlsVisible = state.mode === "awaiting" || state.mode === "fallen_waiting_rescue";
  for (const control of [undoEl, eraserEl]) {
    control.style.opacity = inkControlsVisible ? "0.92" : "0";
    control.style.pointerEvents = inkControlsVisible ? "auto" : "none";
    control.tabIndex = inkControlsVisible ? 0 : -1;
    control.disabled = !inkControlsVisible;
    control.setAttribute("aria-hidden", inkControlsVisible ? "false" : "true");
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
    diagnostic: (event, detail) => {
      diagnostics.info(event, detail);
      if (event === "character_landed") sfx.land(0.85);
      if (event === "navigation_recovery") sfx.jump();
    },
  },
  window.innerWidth,
  window.innerHeight,
);

speech.preload(Object.values(QUESTS).flatMap((questDefinition) =>
  questDefinition.requests.map((line) => ({
    text: line.spoken,
    preset: line.emotion,
    audioUrl: line.audioUrl,
    fallbackAudioUrl: line.fallbackAudioUrl,
  })),
));
for (const interjection of Object.values(INTERJECTIONS)) {
  void speech.prime({ text: interjection.text, preset: interjection.preset, audioUrl: interjection.path });
}

const startExperienceEl = document.createElement("button");
startExperienceEl.textContent = "شروع";
startExperienceEl.title = "شروع داستان";
startExperienceEl.setAttribute("aria-label", "شروع داستان");
startExperienceEl.style.cssText = [
  "position:absolute",
  "z-index:100",
  "left:50%",
  "top:50%",
  "transform:translate(-50%,-50%)",
  "min-width:132px",
  "min-height:58px",
  "padding:12px 26px",
  "border-radius:999px",
  "border:3px solid #F7F5EE",
  "background:#103B46",
  "color:#F7F5EE",
  "font:700 22px system-ui,'Segoe UI',Tahoma,sans-serif",
  "cursor:pointer",
  "box-shadow:0 10px 30px rgba(0,0,0,.3)",
].join(";");
appEl.appendChild(startExperienceEl);

let experienceStarting = false;
startExperienceEl.addEventListener("click", () => {
  if (experienceStarting) return;
  experienceStarting = true;
  startExperienceEl.disabled = true;
  void speech.unlock().finally(() => {
    startExperienceEl.remove();
    void restoreSession().then((restored) => {
      if (!restored) startLivingLineIntro();
    });
  });
});

if (typeof navigator !== "undefined" && "serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js").catch(() => void 0);
}

// The experience deliberately waits for the start gesture above. Safari only
// permits reliable Web Audio playback after a direct user interaction.

console.log("[line-pal] bootstrap ready");
