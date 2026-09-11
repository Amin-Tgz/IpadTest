import Phaser from "phaser";
import type { RigRuntime } from "../character/rig-runtime.js";
import {
  centeredRectToSupport,
  ladderClimbRoute,
  ladderLanding,
  stairStepRects,
  surfaceBounds,
  surfaceClimbRoute,
  surfaceSupportRects,
  type DrawnSurface,
  type RouteWaypoint,
  type SupportRect,
} from "./physics-geometry.js";
import type { RescuePhase } from "./ladder-rescue.js";

export type PhysicsShape = "platform" | "stairs" | "slope" | "obstacle" | "dynamic" | "ladder";

export interface PhysicsEntitySpec {
  id: string;
  shape: PhysicsShape;
  x: number;
  y: number;
  width: number;
  height: number;
  angleDegrees?: number;
  surface?: DrawnSurface;
}

const SURFACE_SHAPES = new Set<PhysicsShape>(["stairs", "slope", "obstacle"]);

export interface PhaserWorldCallbacks {
  render(now: number, context: CanvasRenderingContext2D, resolution: number): void;
  ready?(scene: LivingDrawingScene): void;
  diagnostic?(event: string, detail: Record<string, unknown>): void;
}

export type LocomotionState = "idle" | "walking" | "climbing" | "jumping" | "falling" | "landing" | "failed";

export type NavigationWaypoint = RouteWaypoint;
export interface NavigationResult { started: boolean; actionId: string; reason?: string }
export interface NavigationSnapshot {
  actionId: string | null;
  state: LocomotionState;
  targetX: number | null;
  targetY: number | null;
  targetEntityId: string | null;
  waypointIndex: number;
  waypointCount: number;
  progress: number;
  failureReason: string | null;
  rescuePhase: RescuePhase;
  rescueComplete: boolean;
  climbingSegment: boolean;
}

interface NavigationState {
  actionId: string;
  state: "walking" | "climbing";
  targetX: number;
  targetY?: number;
  targetEntityId: string | null;
  speed: number;
  waypoints: NavigationWaypoint[];
  waypointIndex: number;
  startedAt: number;
  lastProgressAt: number;
  lastX: number;
  recoveryUsed: boolean;
  kinematic: boolean;
  lastTick: number;
  pauseUntil: number | null;
}

export class LivingDrawingScene extends Phaser.Scene {
  constructor(
    private readonly callbacks: PhaserWorldCallbacks,
    private readonly renderResolution: number,
  ) {
    super({ key: "living-drawing" });
  }

  create(): void {
    this.matter.world.setBounds(0, 0, Math.max(4096, this.scale.width * 4), Math.max(2048, this.scale.height * 2), 64, true, true, false, true);
    this.events.on(Phaser.Scenes.Events.RENDER, () => {
      const context = this.game.canvas.getContext("2d");
      if (!context) return;
      this.callbacks.render(performance.now(), context, this.renderResolution);
    });
    this.callbacks.ready?.(this);
  }
}

export class PhaserWorldController {
  private scene: LivingDrawingScene | null = null;
  private floors: MatterJS.BodyType[] = [];
  private characterBody: MatterJS.BodyType | null = null;
  private characterRootOffset = { x: 0, y: 0 };
  private characterHalfHeight = 20;
  private characterHalfWidth = 14;
  private kinematicHold = false;
  private readonly entityBodies = new Map<string, MatterJS.BodyType[]>();
  private readonly pendingEntities = new Map<string, PhysicsEntitySpec>();
  private navigation: NavigationState | null = null;
  private lastNavigation: NavigationSnapshot = {
    actionId: null, state: "idle", targetX: null, targetY: null, targetEntityId: null,
    waypointIndex: 0, waypointCount: 0, progress: 0, failureReason: null,
    rescuePhase: "NONE", rescueComplete: false, climbingSegment: false,
  };
  private actionSequence = 0;
  private wasAirborne = false;
  private landedAt = 0;
  private rescuePhase: RescuePhase = "NONE";

  constructor(
    canvas: HTMLCanvasElement,
    private readonly callbacks: PhaserWorldCallbacks,
    width: number,
    height: number,
  ) {
    const resolution = 1;
    const scene = new LivingDrawingScene({
      ...callbacks,
      ready: (readyScene) => {
        this.scene = readyScene;
        readyScene.events.on(Phaser.Scenes.Events.UPDATE, (time: number) => this.updateNavigation(time));
        for (const spec of this.pendingEntities.values()) this.addEntity(spec);
        callbacks.ready?.(readyScene);
      },
    }, resolution);
    new Phaser.Game({
      type: Phaser.CANVAS,
      canvas,
      width,
      height,
      backgroundColor: "#103B46",
      transparent: false,
      clearBeforeRender: true,
      physics: {
        default: "matter",
        matter: {
          gravity: { x: 0, y: 1.05 },
          enableSleeping: true,
          debug: false,
        },
      },
      scene,
    });
  }

  resize(width: number, height: number): void {
    this.scene?.scale.resize(width, height);
  }

  setCameraX(x: number): void {
    this.scene?.cameras.main.setScroll(x, 0);
  }

  configureGround(
    width: number,
    baselineY: number,
    solidRanges?: Array<{ minX: number; maxX: number }>,
  ): void {
    const scene = this.scene;
    if (!scene) return;
    const worldWidth = Math.max(width * 4, 4096);
    scene.matter.world.setBounds(0, 0, Math.max(worldWidth, ...(solidRanges ?? []).map((range) => range.maxX + width)), Math.max(2048, scene.scale.height * 2), 64, true, true, false, true);
    for (const floor of this.floors) scene.matter.world.remove(floor);
    this.floors = (solidRanges ?? [{ minX: 0, maxX: worldWidth }]).map((range) => {
      const rangeWidth = range.maxX - range.minX;
      return scene.matter.add.rectangle(range.minX + rangeWidth / 2, baselineY + 34, rangeWidth, 68, {
        isStatic: true,
        label: "drawn-ground",
        friction: 0.9,
        restitution: 0,
      });
    });
    if (this.characterBody) {
      this.wakeCharacter("ground_changed");
      scene.matter.body.setVelocity(this.characterBody, { x: this.characterBody.velocity.x, y: Math.max(0.15, this.characterBody.velocity.y) });
    }
  }

  attachCharacter(runtime: RigRuntime): void {
    const scene = this.scene;
    if (!scene || this.characterBody) return;
    const root = runtime.jointWorld("root");
    if (!root) return;
    const points = [
      runtime.jointWorld("head"),
      runtime.jointWorld("left_foot"),
      runtime.jointWorld("right_foot"),
      runtime.jointWorld("left_hand"),
      runtime.jointWorld("right_hand"),
    ].filter((point): point is { x: number; y: number } => point !== null);
    const minY = Math.min(root.y - 30, ...points.map((point) => point.y));
    const maxY = Math.max(root.y + 30, ...points.map((point) => point.y));
    const minX = Math.min(root.x - 20, ...points.map((point) => point.x));
    const maxX = Math.max(root.x + 20, ...points.map((point) => point.x));
    const characterHeight = Math.max(48, maxY - minY);
    // Collide with the lower body, not the whole drawing. A head-to-feet box
    // cannot step onto stairs because its upper corners hit every riser.
    const height = Math.max(42, characterHeight * 0.58);
    const width = Math.max(28, Math.min(70, (maxX - minX) * 0.55));
    const center = { x: root.x, y: maxY - height / 2 };
    this.characterRootOffset = { x: root.x - center.x, y: root.y - center.y };
    this.characterHalfHeight = height / 2;
    this.characterHalfWidth = width / 2;
    this.characterBody = scene.matter.add.rectangle(center.x, center.y, width, height, {
      label: "living-character",
      friction: 0.85,
      frictionAir: 0.035,
      restitution: 0.02,
      chamfer: { radius: Math.min(12, width / 3) },
    });
    scene.matter.body.setInertia(this.characterBody, Infinity);
  }

  detachCharacter(): void {
    if (this.scene && this.characterBody) this.scene.matter.world.remove(this.characterBody);
    this.characterBody = null;
  }

  syncCharacter(runtime: RigRuntime): void {
    if (!this.characterBody) {
      this.attachCharacter(runtime);
      return;
    }
    runtime.moveEntityTo(
      this.characterBody.position.x + this.characterRootOffset.x,
      this.characterBody.position.y + this.characterRootOffset.y,
    );
  }

  placeCharacter(runtime: RigRuntime): void {
    if (!this.scene) return;
    if (!this.characterBody) this.attachCharacter(runtime);
    const root = runtime.jointWorld("root");
    if (!root || !this.characterBody) return;
    this.scene.matter.body.setPosition(this.characterBody, {
      x: root.x - this.characterRootOffset.x,
      y: root.y - this.characterRootOffset.y,
    });
    this.scene.matter.body.setVelocity(this.characterBody, { x: 0, y: 0 });
  }

  moveCharacter(direction: -1 | 0 | 1, speed = 3.2): void {
    if (!this.scene || !this.characterBody) return;
    if (direction !== 0) this.wakeCharacter("direct_move");
    this.scene.matter.body.setVelocity(this.characterBody, {
      x: direction * speed,
      y: this.characterBody.velocity.y,
    });
  }

  walkTo(targetX: number, speed?: number, targetEntityId: string | null = null): NavigationResult {
    return this.startNavigation(targetX, undefined, false, speed, targetEntityId);
  }

  climbTo(targetX: number, speed?: number, targetEntityId: string | null = null): NavigationResult {
    const spec = targetEntityId ? this.pendingEntities.get(targetEntityId) : undefined;
    const direction = this.characterBody && targetX < this.characterBody.position.x ? -1 : 1;
    const body = { halfWidth: this.characterHalfWidth, halfHeight: this.characterHalfHeight };
    let route: NavigationWaypoint[] = [];
    if (spec?.shape === "ladder") {
      const ladder = spec.surface
        ? surfaceBounds(spec.surface)
        : { left: spec.x, right: spec.x + spec.width, top: spec.y, bottom: spec.y + spec.height };
      const standY = this.characterBody?.position.y ?? ladder.bottom - this.characterHalfHeight;
      route = ladderClimbRoute(ladder, body, standY, ladderLanding(ladder, this.staticSupports(spec.id), direction), direction);
    } else {
      const supports = spec ? this.climbableSupports(spec) : null;
      if (supports && supports.length > 0) route = surfaceClimbRoute(supports, body, direction);
    }
    if (route.length === 0) return this.startNavigation(targetX, undefined, true, speed, targetEntityId);
    const end = route.at(-1)!;
    return this.startNavigation(end.x, end.y, true, speed, targetEntityId, route, true);
  }

  stopNavigation(): void {
    this.navigation = null;
    this.setKinematicHold(false);
    this.moveCharacter(0);
  }

  get isNavigating(): boolean {
    return this.navigation !== null;
  }

  navigationSnapshot(): NavigationSnapshot {
    return { ...this.lastNavigation, rescuePhase: this.rescuePhase, rescueComplete: this.rescuePhase === "RECOVERED" };
  }

  holdForRescue(boundaryRootY: number): boolean {
    if (!this.scene || !this.characterBody) return false;
    this.stopNavigation();
    this.scene.matter.body.setPosition(this.characterBody, {
      x: this.characterBody.position.x,
      y: boundaryRootY - this.characterRootOffset.y,
    });
    this.scene.matter.body.setVelocity(this.characterBody, { x: 0, y: 0 });
    this.scene.matter.body.setStatic(this.characterBody, true);
    if (this.rescuePhase !== "FALLEN_WAITING_RESCUE") {
      this.rescuePhase = "FALLEN_WAITING_RESCUE";
      this.emit("rescue_waiting", { x: this.characterBody.position.x, rootY: boundaryRootY });
    }
    return true;
  }

  beginRescue(): boolean {
    if (!this.characterBody || this.rescuePhase !== "FALLEN_WAITING_RESCUE") return false;
    this.rescuePhase = "RESCUING";
    this.emit("rescue_started", {});
    return true;
  }

  setRescueRootPosition(point: { x: number; y: number }): boolean {
    if (!this.scene || !this.characterBody || this.rescuePhase !== "RESCUING") return false;
    this.scene.matter.body.setPosition(this.characterBody, {
      x: point.x - this.characterRootOffset.x,
      y: point.y - this.characterRootOffset.y,
    });
    this.scene.matter.body.setVelocity(this.characterBody, { x: 0, y: 0 });
    return true;
  }

  completeRescue(point: { x: number; y: number }): boolean {
    if (!this.scene || !this.characterBody || this.rescuePhase !== "RESCUING") return false;
    this.scene.matter.body.setPosition(this.characterBody, {
      x: point.x - this.characterRootOffset.x,
      y: point.y - this.characterRootOffset.y,
    });
    this.scene.matter.body.setStatic(this.characterBody, false);
    this.scene.matter.body.setVelocity(this.characterBody, { x: 0, y: 0 });
    this.rescuePhase = "RECOVERED";
    this.wasAirborne = false;
    this.emit("rescue_completed", { x: point.x, y: point.y });
    return true;
  }

  motionState(): "grounded" | "rising" | "falling" | "landing" {
    if (!this.characterBody) return "grounded";
    if (this.characterBody.velocity.y > 1.4) {
      this.wasAirborne = true;
      return "falling";
    }
    if (this.characterBody.velocity.y < -1.4) {
      this.wasAirborne = true;
      return "rising";
    }
    if (this.wasAirborne && this.isGrounded()) {
      this.wasAirborne = false;
      this.landedAt = performance.now();
      this.emit("character_landed", { x: this.characterBody.position.x, y: this.characterBody.position.y });
    }
    if (performance.now() - this.landedAt < 180) return "landing";
    return "grounded";
  }

  jump(strength = 9): boolean {
    if (!this.scene || !this.characterBody || !this.isGrounded()) return false;
    this.wakeCharacter("jump");
    const scaledStrength = Math.max(strength, Math.min(18, this.characterHalfHeight * 0.075));
    this.scene.matter.body.setVelocity(this.characterBody, {
      x: this.characterBody.velocity.x,
      y: -Math.abs(scaledStrength),
    });
    return true;
  }

  /** Leaps toward `targetX` and keeps walking there after landing. */
  jumpToward(targetX: number, targetEntityId: string | null = null): NavigationResult {
    if (!this.scene || !this.characterBody || !this.isGrounded()) {
      return { started: false, actionId: `move_${this.actionSequence + 1}`, reason: "character_not_grounded" };
    }
    const direction = targetX < this.characterBody.position.x ? -1 : 1;
    const result = this.startNavigation(targetX, undefined, false, undefined, targetEntityId);
    if (!result.started || !this.navigation) return result;
    const strength = Math.max(8, Math.min(16, this.characterHalfHeight * 0.075));
    this.scene.matter.body.setVelocity(this.characterBody, { x: direction * this.navigation.speed, y: -strength });
    this.emit("jump_started", { actionId: result.actionId, targetX, direction });
    return result;
  }

  /**
   * Landing x for jumping off whatever the hero stands on: just past the
   * nearest point where the ground drops back to the floor. Null on the floor.
   */
  dropLandingX(preferred: -1 | 1 | null): number | null {
    const body = this.characterBody;
    if (!body || this.floors.length === 0) return null;
    const footY = body.bounds.max.y;
    const floorTop = Math.min(...this.floors.map((floor) => floor.bounds.min.y));
    if (footY > floorTop - 30) return null;
    const found: Array<{ x: number; distance: number; side: -1 | 1 }> = [];
    for (const side of [1, -1] as const) {
      for (let distance = 8; distance <= 900; distance += 8) {
        const x = body.position.x + side * distance;
        const top = this.getGroundHeightAt(x, footY);
        if (top !== null && top >= floorTop - 4) {
          found.push({ x: x + side * (this.characterHalfWidth + 16), distance, side });
          break;
        }
      }
    }
    const pick = found.find((edge) => edge.side === preferred) ?? found.sort((a, b) => a.distance - b.distance)[0];
    return pick?.x ?? null;
  }

  isGrounded(): boolean {
    if (!this.characterBody) return false;
    const supports = [
      ...this.floors,
      ...[...this.entityBodies.values()].flat().filter((body) => body.isStatic),
    ];
    const footY = this.characterBody.bounds.max.y;
    return supports.some((support) => {
      const overlapsX = this.characterBody!.bounds.max.x >= support.bounds.min.x - 2 &&
        this.characterBody!.bounds.min.x <= support.bounds.max.x + 2;
      return overlapsX && Math.abs(footY - support.bounds.min.y) < 10 && Math.abs(this.characterBody!.velocity.y) < 1.2;
    });
  }

  /**
   * Carries the body tread by tread along a drawn surface. The body is held
   * static for the climb: a dynamic box pushed up a staircase wedges on riser
   * corners and fights gravity, so it would never reach the top.
   */
  private updateKinematicClimb(time: number, navigation: NavigationState, waypoint: NavigationWaypoint & { y: number }): void {
    if (!this.scene || !this.characterBody) return;
    const body = this.characterBody;
    this.setKinematicHold(true);
    const dt = Math.min(64, Math.max(0, time - navigation.lastTick));
    navigation.lastTick = time;
    const dx = waypoint.x - body.position.x;
    const dy = waypoint.y - body.position.y;
    const distance = Math.hypot(dx, dy);
    // Matter velocity is px per 60fps step; walk at roughly walking pace and
    // climb hand over hand more slowly.
    const step = navigation.speed * (dt / 16.667) * (waypoint.climb ? 0.55 : 0.82);
    if (distance > step) {
      this.scene.matter.body.setPosition(body, {
        x: body.position.x + (dx * step) / distance,
        y: body.position.y + (dy * step) / distance,
      });
      this.recordProgress(navigation);
      return;
    }
    this.scene.matter.body.setPosition(body, { x: waypoint.x, y: waypoint.y });
    if (waypoint.pauseMs) {
      navigation.pauseUntil ??= time + waypoint.pauseMs;
      if (time < navigation.pauseUntil) return;
      navigation.pauseUntil = null;
    }
    if (navigation.waypointIndex < navigation.waypoints.length - 1) {
      navigation.waypointIndex++;
      navigation.lastProgressAt = time;
      this.emit("navigation_waypoint", { actionId: navigation.actionId, waypointIndex: navigation.waypointIndex });
      return;
    }
    const completed = navigation.actionId;
    this.stopNavigation();
    this.lastNavigation = { ...this.lastNavigation, actionId: completed, state: "idle", progress: 1, failureReason: null, climbingSegment: false };
    this.emit("navigation_arrived", { actionId: completed, x: body.position.x, y: body.position.y });
  }

  private recordProgress(navigation: NavigationState): void {
    const total = Math.max(1, navigation.waypoints.length);
    this.lastNavigation = {
      actionId: navigation.actionId,
      state: navigation.state,
      targetX: navigation.targetX,
      targetY: navigation.targetY ?? null,
      targetEntityId: navigation.targetEntityId,
      waypointIndex: navigation.waypointIndex,
      waypointCount: total,
      progress: Math.min(0.99, navigation.waypointIndex / total),
      failureReason: null,
      rescuePhase: this.rescuePhase,
      rescueComplete: this.rescuePhase === "RECOVERED",
      climbingSegment: Boolean(navigation.waypoints[navigation.waypointIndex]?.climb),
    };
  }

  private setKinematicHold(hold: boolean): void {
    if (!this.scene || !this.characterBody || this.kinematicHold === hold) return;
    this.kinematicHold = hold;
    this.scene.matter.body.setStatic(this.characterBody, hold);
    this.scene.matter.body.setVelocity(this.characterBody, { x: 0, y: 0 });
  }

  private updateNavigation(time: number): void {
    if (!this.scene || !this.characterBody || !this.navigation) return;
    this.wakeCharacter("navigation_tick");
    const navigation = this.navigation;
    const waypoint = navigation.waypoints[navigation.waypointIndex] ?? { x: navigation.targetX, y: navigation.targetY };
    if (navigation.kinematic && waypoint.y !== undefined) {
      this.updateKinematicClimb(time, navigation, { ...waypoint, y: waypoint.y });
      return;
    }
    navigation.lastTick = time;
    const dx = waypoint.x - this.characterBody.position.x;
    const dy = waypoint.y === undefined ? 0 : waypoint.y - this.characterBody.position.y;
    const arrival = Math.max(10, Math.min(24, this.characterHalfHeight * 0.08));
    if (Math.abs(dx) <= arrival && (waypoint.y === undefined || Math.abs(dy) <= Math.max(arrival, 26))) {
      if (navigation.waypointIndex < navigation.waypoints.length - 1) {
        navigation.waypointIndex++;
        navigation.lastProgressAt = time;
        this.emit("navigation_waypoint", { actionId: navigation.actionId, waypointIndex: navigation.waypointIndex });
        return;
      }
      const completed = navigation.actionId;
      this.stopNavigation();
      this.lastNavigation = { ...this.lastNavigation, actionId: completed, state: "idle", progress: 1, failureReason: null, climbingSegment: false };
      this.emit("navigation_arrived", { actionId: completed, x: this.characterBody.position.x, y: this.characterBody.position.y });
      return;
    }
    const moved = Math.abs(this.characterBody.position.x - navigation.lastX);
    if (moved >= 3) {
      navigation.lastX = this.characterBody.position.x;
      navigation.lastProgressAt = time;
    } else if (time - navigation.lastProgressAt > 900) {
      if (!navigation.recoveryUsed && this.isGrounded()) {
        navigation.recoveryUsed = true;
        navigation.lastProgressAt = time;
        this.scene.matter.body.setVelocity(this.characterBody, {
          x: Math.sign(dx) * navigation.speed,
          y: -Math.max(6, Math.min(13, this.characterHalfHeight * 0.06)),
        });
        this.emit("navigation_recovery", { actionId: navigation.actionId, kind: "step_up" });
        return;
      }
      this.failNavigation("stalled");
      return;
    }
    const direction = dx < 0 ? -1 : 1;
    let nextY = this.characterBody.velocity.y;
    if (navigation.state === "climbing" && waypoint.y !== undefined && dy < -arrival && this.isGrounded()) {
      nextY = -Math.max(5.5, Math.min(13, Math.sqrt(Math.abs(dy)) * 1.25));
    }
    this.scene.matter.body.setVelocity(this.characterBody, { x: direction * navigation.speed, y: nextY });
    this.recordProgress(navigation);
  }

  private startNavigation(
    targetX: number,
    targetY: number | undefined,
    climb: boolean,
    speed: number | undefined,
    targetEntityId: string | null,
    waypoints?: NavigationWaypoint[],
    kinematic = false,
  ): NavigationResult {
    const actionId = `move_${++this.actionSequence}`;
    if (!this.scene || !this.characterBody) return { started: false, actionId, reason: "character_body_unavailable" };
    if (!Number.isFinite(targetX) || (targetY !== undefined && !Number.isFinite(targetY))) {
      return { started: false, actionId, reason: "invalid_destination" };
    }
    const scaledSpeed = Math.abs(speed ?? Math.max(2.8, Math.min(6.5, this.characterHalfHeight * 0.035)));
    const route = waypoints?.length ? waypoints : [{ x: targetX, y: targetY }];
    const now = performance.now();
    this.navigation = {
      actionId, state: climb ? "climbing" : "walking", targetX, targetY, targetEntityId,
      speed: scaledSpeed, waypoints: route, waypointIndex: 0, startedAt: now,
      lastProgressAt: now, lastX: this.characterBody.position.x, recoveryUsed: false,
      kinematic, lastTick: now, pauseUntil: null,
    };
    this.wakeCharacter("navigation_start");
    this.lastNavigation = {
      actionId, state: this.navigation.state, targetX, targetY: targetY ?? null, targetEntityId,
      waypointIndex: 0, waypointCount: route.length, progress: 0, failureReason: null,
      rescuePhase: this.rescuePhase, rescueComplete: this.rescuePhase === "RECOVERED", climbingSegment: false,
    };
    this.emit("navigation_started", { actionId, state: this.navigation.state, targetX, targetY, targetEntityId, route });
    return { started: true, actionId };
  }

  private staticSupports(excludeId: string): SupportRect[] {
    return [...this.entityBodies.entries()]
      .filter(([id]) => id !== excludeId)
      .flatMap(([, bodies]) => bodies)
      .filter((support) => support.isStatic)
      .map((support) => ({
        left: support.bounds.min.x,
        right: support.bounds.max.x,
        top: support.bounds.min.y,
        bottom: support.bounds.max.y,
      }));
  }

  private climbableSupports(spec: PhysicsEntitySpec): SupportRect[] | null {
    if (spec.surface && SURFACE_SHAPES.has(spec.shape)) return surfaceSupportRects(spec.surface);
    if (spec.shape === "stairs") return stairStepRects(spec).map(centeredRectToSupport);
    return null;
  }

  private wakeCharacter(reason: string): void {
    if (!this.scene || !this.characterBody) return;
    const wasSleeping = this.characterBody.isSleeping;
    this.scene.matter.body.set(this.characterBody, "isSleeping", false);
    if (wasSleeping) this.emit("character_woke", { reason });
  }

  private failNavigation(reason: string): void {
    const actionId = this.navigation?.actionId ?? null;
    this.navigation = null;
    this.setKinematicHold(false);
    this.moveCharacter(0);
    this.lastNavigation = { ...this.lastNavigation, actionId, state: "failed", failureReason: reason, climbingSegment: false };
    this.emit("navigation_failed", { actionId, reason });
  }

  private emit(event: string, detail: Record<string, unknown>): void {
    this.callbacks.diagnostic?.(event, detail);
  }

  addEntity(spec: PhysicsEntitySpec): void {
    this.pendingEntities.set(spec.id, spec);
    const scene = this.scene;
    if (!scene || this.entityBodies.has(spec.id)) return;
    // A ladder is climbed, never walked into: it has no collider.
    if (spec.shape === "ladder") {
      this.entityBodies.set(spec.id, []);
      return;
    }
    const bodies: MatterJS.BodyType[] = [];
    const common = {
      isStatic: spec.shape !== "dynamic",
      label: `drawing:${spec.id}`,
      friction: 0.8,
      restitution: spec.shape === "dynamic" ? 0.35 : 0,
    };
    const supports = this.climbableSupports(spec);
    if (supports) {
      for (const rect of supports) {
        bodies.push(scene.matter.add.rectangle(
          (rect.left + rect.right) / 2,
          (rect.top + rect.bottom) / 2,
          rect.right - rect.left + 1,
          Math.max(4, rect.bottom - rect.top),
          common,
        ));
      }
    } else if (spec.shape === "platform") {
      // Treat a bridge/platform as a thin walkable surface at the lower edge of
      // its visual bounds. A full bounding-box collider becomes a wall at the
      // approach edge and prevents the requested crossing.
      const thickness = Math.max(8, Math.min(14, spec.height * 0.2));
      bodies.push(scene.matter.add.rectangle(
        spec.x + spec.width / 2,
        spec.y + spec.height - thickness / 2,
        Math.max(8, spec.width),
        thickness,
        common,
      ));
    } else if (spec.shape === "slope") {
      const thickness = Math.max(10, Math.min(16, spec.height * 0.18));
      bodies.push(scene.matter.add.rectangle(
        spec.x + spec.width / 2,
        spec.y + spec.height / 2,
        Math.max(12, spec.width),
        thickness,
        { ...common, angle: Phaser.Math.DegToRad(spec.angleDegrees ?? 0) },
      ));
    } else if (spec.shape === "dynamic") {
      const nearSquare = Math.abs(spec.width - spec.height) < Math.min(spec.width, spec.height) * 0.35
        && Math.max(spec.width, spec.height) < 96;
      if (nearSquare) {
        const radius = Math.max(10, Math.min(spec.width, spec.height) / 2);
        bodies.push(scene.matter.add.circle(
          spec.x + spec.width / 2,
          spec.y + spec.height / 2,
          radius,
          { ...common, restitution: 0.45, friction: 0.32 },
        ));
      } else {
        bodies.push(scene.matter.add.rectangle(
          spec.x + spec.width / 2,
          spec.y + spec.height / 2,
          Math.max(8, spec.width),
          Math.max(8, spec.height),
          { ...common, angle: Phaser.Math.DegToRad(spec.angleDegrees ?? 0) },
        ));
      }
    } else {
      bodies.push(scene.matter.add.rectangle(
        spec.x + spec.width / 2,
        spec.y + spec.height / 2,
        Math.max(8, spec.width),
        Math.max(8, spec.height),
        { ...common, angle: Phaser.Math.DegToRad(spec.angleDegrees ?? 0) },
      ));
    }
    this.entityBodies.set(spec.id, bodies);
  }

  getBodyState(id: string): { x: number; y: number; angle: number } | null {
    const bodies = this.entityBodies.get(id);
    if (!bodies || bodies.length === 0) return null;
    const body = bodies[0];
    return { x: body.position.x, y: body.position.y, angle: body.angle };
  }

  /** Top of the highest support under `x` that is not above `footY` (a riser beside the foot is not ground). */
  getGroundHeightAt(x: number, footY = -Infinity): number | null {
    const supports = [
      ...this.floors,
      ...[...this.entityBodies.values()].flat().filter((body) => body.isStatic),
    ];
    let best: number | null = null;
    for (const support of supports) {
      if (x < support.bounds.min.x - 6 || x > support.bounds.max.x + 6) continue;
      const top = support.bounds.min.y;
      if (top < footY - 2) continue;
      if (best === null || top < best) best = top;
    }
    return best;
  }

  removeEntity(id: string): void {
    this.pendingEntities.delete(id);
    const bodies = this.entityBodies.get(id) ?? [];
    if (this.scene) for (const body of bodies) this.scene.matter.world.remove(body);
    this.entityBodies.delete(id);
    this.wakeCharacter("support_removed");
    if (this.navigation?.targetEntityId === id) this.failNavigation("target_removed");
    this.emit("physics_entity_removed", { id, bodyCount: bodies.length });
  }
}
