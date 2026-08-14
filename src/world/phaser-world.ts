import Phaser from "phaser";
import type { RigRuntime } from "../character/rig-runtime.js";
import { stairStepRects } from "./physics-geometry.js";

export type PhysicsShape = "platform" | "stairs" | "slope" | "obstacle" | "dynamic";

export interface PhysicsEntitySpec {
  id: string;
  shape: PhysicsShape;
  x: number;
  y: number;
  width: number;
  height: number;
  angleDegrees?: number;
}

export interface PhaserWorldCallbacks {
  render(now: number, context: CanvasRenderingContext2D, resolution: number): void;
  ready?(scene: LivingDrawingScene): void;
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
  private readonly entityBodies = new Map<string, MatterJS.BodyType[]>();
  private readonly pendingEntities = new Map<string, PhysicsEntitySpec>();
  private navigation: { targetX: number; speed: number; climb: boolean; nextLiftAt: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: PhaserWorldCallbacks,
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
    const height = Math.max(48, maxY - minY);
    const width = Math.max(28, Math.min(70, (maxX - minX) * 0.55));
    const center = { x: root.x, y: (minY + maxY) / 2 };
    this.characterRootOffset = { x: root.x - center.x, y: root.y - center.y };
    this.characterHalfHeight = height / 2;
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
    this.scene.matter.body.setVelocity(this.characterBody, {
      x: direction * speed,
      y: this.characterBody.velocity.y,
    });
  }

  walkTo(targetX: number, speed = 3.2): boolean {
    if (!this.characterBody) return false;
    this.navigation = { targetX, speed: Math.abs(speed), climb: false, nextLiftAt: 0 };
    return true;
  }

  climbTo(targetX: number, speed = 2.8): boolean {
    if (!this.characterBody) return false;
    this.navigation = { targetX, speed: Math.abs(speed), climb: true, nextLiftAt: 0 };
    return true;
  }

  stopNavigation(): void {
    this.navigation = null;
    this.moveCharacter(0);
  }

  get isNavigating(): boolean {
    return this.navigation !== null;
  }

  motionState(): "grounded" | "rising" | "falling" {
    if (!this.characterBody) return "grounded";
    if (this.characterBody.velocity.y > 1.4) return "falling";
    if (this.characterBody.velocity.y < -1.4) return "rising";
    return "grounded";
  }

  jump(strength = 9): boolean {
    if (!this.scene || !this.characterBody || !this.isGrounded()) return false;
    this.scene.matter.body.setVelocity(this.characterBody, {
      x: this.characterBody.velocity.x,
      y: -Math.abs(strength),
    });
    return true;
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

  private updateNavigation(time: number): void {
    if (!this.scene || !this.characterBody || !this.navigation) return;
    const dx = this.navigation.targetX - this.characterBody.position.x;
    if (Math.abs(dx) <= 12) {
      this.stopNavigation();
      return;
    }
    const direction = dx < 0 ? -1 : 1;
    const velocityY = this.characterBody.velocity.y;
    let nextY = velocityY;
    if (this.navigation.climb && time >= this.navigation.nextLiftAt && velocityY > -1.2) {
      nextY = -5.4;
      this.navigation.nextLiftAt = time + 430;
    }
    this.scene.matter.body.setVelocity(this.characterBody, { x: direction * this.navigation.speed, y: nextY });
  }

  addEntity(spec: PhysicsEntitySpec): void {
    this.pendingEntities.set(spec.id, spec);
    const scene = this.scene;
    if (!scene || this.entityBodies.has(spec.id)) return;
    const bodies: MatterJS.BodyType[] = [];
    const common = {
      isStatic: spec.shape !== "dynamic",
      label: `drawing:${spec.id}`,
      friction: 0.8,
      restitution: spec.shape === "dynamic" ? 0.15 : 0,
    };
    if (spec.shape === "stairs") {
      for (const step of stairStepRects(spec)) {
        bodies.push(scene.matter.add.rectangle(
          step.x,
          step.y,
          step.width,
          step.height,
          common,
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
}
