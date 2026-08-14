import { StrokeStore, nextId, type Stroke, type StrokePoint } from "./stroke-store.js";
import { PALETTE, STROKE_GROUPING_MS } from "../app/constants.js";
import type { Camera } from "../world/camera.js";

export interface PointerInputOptions {
  minPointDistance: number;
  maxPointsPerStroke: number;
}

export interface PencilEvent {
  x: number;
  y: number;
  pressure: number;
}

export interface PointerInputCallbacks {
  onStrokeStart?: (stroke: Stroke) => void;
  onStrokeEnd?: (stroke: Stroke) => void;
  onPencilMove?: (event: PencilEvent) => void;
  onPencilDown?: (event: PencilEvent) => void;
}

export interface PointerInterceptor {
  down: (world: { x: number; y: number }, e: PointerEvent) => boolean;
  move: (world: { x: number; y: number }, e: PointerEvent) => boolean;
  up: (world: { x: number; y: number }, e: PointerEvent) => void;
}

export class PointerInput {
  private current: Stroke | null = null;
  private lastPoint: StrokePoint | null = null;
  private sessionStart = performance.now();
  private groupOpenAt: number | null = null;
  private groupId: string | null = null;
  interceptor: PointerInterceptor | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: StrokeStore,
    private readonly camera: Camera,
    private readonly callbacks: PointerInputCallbacks = {},
    private readonly options: PointerInputOptions = {
      minPointDistance: 1.5,
      maxPointsPerStroke: 8000,
    },
  ) {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return this.camera.screenToWorld({ x: sx, y: sy });
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = this.toWorld(e.clientX, e.clientY);
    if (this.interceptor && this.interceptor.down(p, e)) {
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    const pressure = this.normalizePressure(e);
    const now = performance.now() - this.sessionStart;

    if (this.groupOpenAt === null || now - this.groupOpenAt > STROKE_GROUPING_MS) {
      this.groupId = nextId("group");
    }
    this.groupOpenAt = now;

    this.current = {
      id: nextId("stroke"),
      points: [{ x: p.x, y: p.y, pressure, time: now }],
      color: PALETTE.primaryInk,
      baseWidth: 4,
      tool: "pen",
      createdAt: Date.now(),
      worldSpace: true,
      entityId: null,
      active: true,
      groupId: this.groupId,
    };
    this.lastPoint = this.current.points[0];
    this.callbacks.onStrokeStart?.(this.current);
    this.callbacks.onPencilDown?.({ x: p.x, y: p.y, pressure });
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.toWorld(e.clientX, e.clientY);
    const pressure = this.normalizePressure(e);
    this.callbacks.onPencilMove?.({ x: p.x, y: p.y, pressure });

    if (this.interceptor && this.interceptor.move(p, e)) return;

    if (!this.current || !this.lastPoint) return;
    const dist = Math.hypot(p.x - this.lastPoint.x, p.y - this.lastPoint.y);
    if (dist < this.options.minPointDistance) return;
    if (this.current.points.length >= this.options.maxPointsPerStroke) return;

    this.current.points.push({
      x: p.x,
      y: p.y,
      pressure,
      time: performance.now() - this.sessionStart,
    });
    this.lastPoint = this.current.points[this.current.points.length - 1];
  };

  private onPointerUp = (e: PointerEvent): void => {
    const p = this.toWorld(e.clientX, e.clientY);
    if (this.interceptor && this.current === null) {
      this.interceptor.up(p, e);
      return;
    }
    if (!this.current) return;
    if (this.current.points.length > 1) {
      this.store.add(this.current);
      this.callbacks.onStrokeEnd?.(this.current);
    }
    this.current = null;
    this.lastPoint = null;
  };

  private normalizePressure(e: PointerEvent): number {
    if (e.pointerType === "mouse") return 0.5;
    if (e.pointerType === "touch") return 0.55;
    if (e.pressure > 0) return Math.min(1, Math.max(0, e.pressure));
    return 0.5;
  }
}
