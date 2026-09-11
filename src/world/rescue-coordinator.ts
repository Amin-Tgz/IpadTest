import { PALETTE, BASE_LINE_WIDTH, BASE_LINE_Y_RATIO } from "../app/constants.js";
import type { Camera } from "./camera.js";
import type { GroundPath } from "./ground-path.js";
import type { PhaserWorldController } from "./phaser-world.js";
import type { RigRuntime } from "../character/rig-runtime.js";
import type { AnimationController } from "../animation/animation-controller.js";
import type { Stroke, StrokeStore } from "../drawing/stroke-store.js";
import type { WorldEntityRegistry } from "./world-entity.js";
import type { ConversationHistory } from "../story/conversation-history.js";
import type { DrawingAnalysis } from "../ai/schemas.js";
import {
  createLadderRescuePlan,
  MovableWorldObject,
  RescueStateController,
  rescueWaypointAt,
  type LadderRescuePlan,
} from "./ladder-rescue.js";

export interface RescueCoordinatorDeps {
  store: StrokeStore;
  groundPath: () => GroundPath;
  phaserWorld: () => PhaserWorldController | null;
  worldEntities: WorldEntityRegistry;
  conversation: ConversationHistory;
  animController: AnimationController;
  getViewport: () => { width: number; height: number };
  diagnostics: {
    info(event: string, detail?: Record<string, unknown>): void;
    error(event: string, detail?: unknown): void;
  };
  speakStoryText(bubble: string, spoken?: string, emotion?: string, audioUrl?: string, motion?: string): void;
  onRescueComplete(): void;
}

export class RescueCoordinator {
  readonly rescueState = new RescueStateController();
  readonly movableObjects = new Map<string, MovableWorldObject>();
  readonly movableStrokeIds = new Set<string>();

  private rescuePlan: LadderRescuePlan | null = null;
  private rescueStartedAt: number | null = null;
  private _rescueLadderId: string | null = null;

  constructor(private readonly deps: RescueCoordinatorDeps) {}

  get rescueLadderId(): string | null {
    return this._rescueLadderId;
  }

  get isRescuing(): boolean {
    return this.rescueState.phase === "RESCUING";
  }

  get phase() {
    return this.rescueState.phase;
  }

  isLadderObject(object: DrawingAnalysis["objects"][number]): boolean {
    const semantic = `${object.type} ${object.affordances.join(" ")}`.toLowerCase();
    return object.physicsShape === "ladder" || /ladder|نردبان/.test(semantic);
  }

  enterFallenRescue(rigRuntime: RigRuntime | null): boolean {
    const phaserWorld = this.deps.phaserWorld();
    if (!rigRuntime || this.rescueState.phase === "FALLEN_WAITING_RESCUE" || this.rescueState.phase === "RESCUING") return false;
    const boundaryY = this.deps.getViewport().height - 92;
    if (!phaserWorld?.holdForRescue(boundaryY)) return false;
    if (!this.rescueState.markFallen()) return false;

    this.deps.animController.playById("sad");
    this.deps.conversation.append("system", "action", "Hero fell through the erased ground and is waiting below for a drawn ladder.");
    const hint = "اوه! افتادم... یک نردبان پله‌پله برام بکش تا بیام بالا.";
    this.deps.speakStoryText(hint, hint, "sad", "/audio/hero/ladder-fall.pwa", "sad");
    this.deps.diagnostics.info("hero_waiting_for_ladder", {
      boundaryY,
      edges: this.deps.groundPath().nearestIntactEdges(rigRuntime.jointWorld("root")?.x ?? 0),
    });
    return true;
  }

  startLadderRescue(
    analysis: DrawingAnalysis,
    entityIds: string[],
    reviewSourceStrokeIds: ReadonlySet<string>,
    rigRuntime: RigRuntime | null,
  ): boolean {
    const phaserWorld = this.deps.phaserWorld();
    if (!rigRuntime || this.rescueState.phase !== "FALLEN_WAITING_RESCUE") return false;
    let ladderIndex = analysis.objects.findIndex((obj) => this.isLadderObject(obj));
    if (ladderIndex < 0 && analysis.objects.length > 0) {
      const fallback = analysis.objects.findIndex((object) => {
        const semantic = `${object.type} ${object.affordances.join(" ")}`.toLowerCase();
        return /ladder|stairs|platform|bridge|نردبان|پله|پل/.test(semantic) || object.physicsShape === "stairs" || object.physicsShape === "platform" || object.physicsShape === "slope";
      });
      if (fallback >= 0) ladderIndex = fallback;
      else ladderIndex = 0;
      this.deps.diagnostics.info("ladder_rescue_fallback", { chosenIndex: ladderIndex, objects: analysis.objects.map((o) => o.type) });
    }
    if (ladderIndex < 0) return false;
    const entityId = entityIds[ladderIndex];
    const entity = entityId ? this.deps.worldEntities.get(entityId) : null;
    if (!entity) return false;
    const sourceIds = entity.sourceStrokeIds.length > 0 ? entity.sourceStrokeIds : [...reviewSourceStrokeIds];
    const source = sourceIds.map((id) => this.deps.store.byId(id)).filter((stroke): stroke is Stroke => Boolean(stroke?.active));
    if (source.length === 0) return false;
    this.deps.worldEntities.setSourceStrokeIds(entityId, sourceIds);
    const ladder = new MovableWorldObject(entityId, source);
    const root = rigRuntime.jointWorld("root");
    if (!root) return false;
    const edges = this.deps.groundPath().nearestIntactEdges(root.x);
    const baselineY = Math.round(this.deps.getViewport().height * BASE_LINE_Y_RATIO);
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
      this.deps.diagnostics.error("ladder_rescue_plan_failed", error);
      return false;
    }
    phaserWorld?.removeEntity(entityId);
    if (!phaserWorld?.beginRescue()) return false;
    sourceIds.forEach((id) => this.movableStrokeIds.add(id));
    this.movableObjects.set(entityId, ladder);
    this._rescueLadderId = entityId;
    this.rescuePlan = plan;
    this.rescueStartedAt = performance.now();
    if (!this.rescueState.begin()) return false;
    this.deps.animController.playById("ladder_pickup");
    const line = "خب مشتی، نردبان رو می‌گیرم؛ محکم نگهش دار!";
    this.deps.speakStoryText(line, line, "effort", undefined, "ladder_pickup");
    this.deps.diagnostics.info("ladder_rescue_started", { entityId, edge: plan.edge, waypoints: plan.waypoints.length });
    return true;
  }

  updateLadderRescue(now: number): void {
    const phaserWorld = this.deps.phaserWorld();
    if (this.rescueState.phase !== "RESCUING" || this.rescueStartedAt === null || !this.rescuePlan || !this._rescueLadderId) return;
    const ladder = this.movableObjects.get(this._rescueLadderId);
    if (!ladder) return;
    const elapsed = now - this.rescueStartedAt;
    const placementMs = 1_300;
    const climbDelayMs = 220;
    const climbMs = 3_200;
    ladder.setPlacementProgress(this.rescuePlan.targetTransform, elapsed / placementMs);
    if (elapsed < placementMs + climbDelayMs) return;
    if (this.deps.animController.currentId !== "ladder_climb") {
      this.deps.animController.playById("ladder_climb");
      this.deps.diagnostics.info("ladder_climb_started", { waypoints: this.rescuePlan.waypoints.length });
    }
    const progress = Math.max(0, Math.min(1, (elapsed - placementMs - climbDelayMs) / climbMs));
    const waypoint = rescueWaypointAt(this.rescuePlan, progress);
    phaserWorld?.setRescueRootPosition(waypoint);
    if (progress < 1) return;

    ladder.setTransform(this.rescuePlan.targetTransform);
    const bounds = this.transformedBounds(ladder);
    this.deps.worldEntities.setTransform(this._rescueLadderId, ladder.transform, bounds);
    phaserWorld?.addEntity({ id: this._rescueLadderId, shape: "ladder", ...bounds, angleDegrees: ladder.transform.rotation });
    phaserWorld?.completeRescue(this.rescuePlan.landing);
    this.rescueState.complete();
    this.rescueStartedAt = null;
    this.rescuePlan = null;
    this._rescueLadderId = null;
    this.deps.animController.playById("happy");
    this.deps.conversation.append("system", "action", "Hero picked up the child's ladder, placed it at the intact edge, climbed it, and returned safely to the ground.");
    const success = "هوف! رسیدم بالا؛ نردبانت هم همین‌جا می‌مونه.";
    this.deps.speakStoryText(success, success, "delighted", undefined, "happy");
    this.deps.onRescueComplete();
    this.deps.diagnostics.info("ladder_rescue_completed", { bounds, navigation: phaserWorld?.navigationSnapshot() });
  }

  transformedBounds(movable: MovableWorldObject): { x: number; y: number; width: number; height: number } {
    const points = movable.transformedStrokes().flat();
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: Math.max(8, maxX - minX), height: Math.max(8, maxY - minY) };
  }

  drawMovableObjects(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    ctx.strokeStyle = PALETTE.primaryInk;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const movable of this.movableObjects.values()) {
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
}
