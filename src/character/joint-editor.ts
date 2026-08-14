import type { CharacterManifest, JointManifest, CharacterStrokeFilter } from "./character-manifest.js";
import { ensureValidParents, verifyManifest, isUserStroke } from "./character-manifest.js";
import type { StrokeStore } from "../drawing/stroke-store.js";
import type { Camera } from "../world/camera.js";
import { PALETTE } from "../app/constants.js";

export type EditorStage = "box" | "strokes" | "joints" | "done";

export interface BoxState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DragMode = "move" | "resize_n" | "resize_s" | "resize_e" | "resize_w" | "joint" | "toggle";

export interface EditorHit {
  mode: DragMode;
  jointIndex: number;
}

const HIT_RADIUS = 22;
const EDGE_RADIUS = 20;

export function hitTestBox(
  p: { x: number; y: number },
  box: BoxState,
  radius = EDGE_RADIUS,
): EditorHit {
  const onEdgeX = p.x >= box.x - radius && p.x <= box.x + box.width + radius;
  const onEdgeY = p.y >= box.y - radius && p.y <= box.y + box.height + radius;

  if (onEdgeY && Math.abs(p.x - box.x) <= radius) return { mode: "resize_w", jointIndex: -1 };
  if (onEdgeY && Math.abs(p.x - (box.x + box.width)) <= radius) return { mode: "resize_e", jointIndex: -1 };
  if (onEdgeX && Math.abs(p.y - box.y) <= radius) return { mode: "resize_n", jointIndex: -1 };
  if (onEdgeX && Math.abs(p.y - (box.y + box.height)) <= radius) return { mode: "resize_s", jointIndex: -1 };

  const inside =
    p.x >= box.x - radius &&
    p.x <= box.x + box.width + radius &&
    p.y >= box.y - radius &&
    p.y <= box.y + box.height + radius;
  if (inside) return { mode: "move", jointIndex: -1 };
  return { mode: "toggle", jointIndex: -1 };
}

export function hitTestJoint(
  p: { x: number; y: number },
  joints: JointManifest[],
  radius = HIT_RADIUS,
): EditorHit {
  let best = -1;
  let bestDist = radius;
  joints.forEach((joint, i) => {
    const dist = Math.hypot(p.x - joint.x, p.y - joint.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  if (best >= 0) return { mode: "joint", jointIndex: best };
  return { mode: "toggle", jointIndex: -1 };
}

export class JointEditor {
  stage: EditorStage = "box";
  box: BoxState | null = null;
  manifest: CharacterManifest | null = null;
  private filter: CharacterStrokeFilter = isUserStroke;
  private excluded = new Set<string>();
  private drag: { mode: DragMode; jointIndex: number; startX: number; startY: number; origin: BoxState } | null = null;

  onStageChange: (stage: EditorStage) => void = () => void 0;

  constructor(
    private readonly store: StrokeStore,
    private readonly getViewport: () => { width: number; height: number },
  ) {}

  begin(box: BoxState, manifest: CharacterManifest, filter: CharacterStrokeFilter = isUserStroke): void {
    this.box = { ...box };
    this.manifest = structuredClone(manifest);
    this.filter = filter;
    this.excluded = new Set(
      this.store
        .all()
        .filter((s) => s.active && filter(s))
        .map((s) => s.id)
        .filter((id) => !manifest.includedStrokeIds.includes(id)),
    );
    this.stage = "box";
    this.onStageChange(this.stage);
  }

  nextStage(): void {
    if (this.stage === "box") {
      this.applyInclusionFromBox();
      this.stage = "joints";
    } else if (this.stage === "joints") {
      this.stage = "done";
      this.finalize();
    }
    this.onStageChange(this.stage);
  }

  private applyInclusionFromBox(): void {
    if (!this.manifest || !this.box) return;
    const strokes = this.store.all().filter((s) => s.active && this.filter(s));
    const included = new Set<string>();
    for (const stroke of strokes) {
      const inside = stroke.points.filter(
        (p) => p.x >= this.box!.x && p.x <= this.box!.x + this.box!.width && p.y >= this.box!.y && p.y <= this.box!.y + this.box!.height,
      ).length;
      if (inside > 0 && inside / stroke.points.length >= 0.3) included.add(stroke.id);
    }
    const allUser = new Set(strokes.map((s) => s.id));
    this.excluded = new Set([...allUser].filter((id) => !included.has(id)));
    this.manifest.includedStrokeIds = [...included];
  }

  toggleStroke(id: string): void {
    if (this.excluded.has(id)) {
      this.excluded.delete(id);
      this.manifest?.includedStrokeIds.push(id);
    } else {
      this.excluded.add(id);
      if (this.manifest) {
        this.manifest.includedStrokeIds = this.manifest.includedStrokeIds.filter((s) => s !== id);
      }
    }
  }

  isExcluded(strokeId: string): boolean {
    return this.excluded.has(strokeId);
  }

  pointerDown(p: { x: number; y: number }): void {
    if (!this.box) return;
    if (this.stage === "box") {
      const hit = hitTestBox(p, this.box);
      this.drag = { ...hit, startX: p.x, startY: p.y, origin: { ...this.box } };
    } else if (this.stage === "strokes") {
      const strokeId = this.nearestStroke(p);
      if (strokeId) {
        this.toggleStroke(strokeId);
        return;
      }
      const hit = hitTestBox(p, this.box);
      if (hit.mode !== "move" && hit.mode !== "toggle") {
        this.drag = { ...hit, startX: p.x, startY: p.y, origin: { ...this.box } };
      }
    } else if (this.stage === "joints" && this.manifest) {
      const hit = hitTestJoint(p, this.manifest.joints);
      if (hit.mode === "joint") {
        this.drag = { ...hit, startX: p.x, startY: p.y, origin: { ...this.box } };
      }
    }
  }

  pointerMove(p: { x: number; y: number }): void {
    if (!this.drag || !this.box) return;
    const dx = p.x - this.drag.startX;
    const dy = p.y - this.drag.startY;
    const origin = this.drag.origin;
    const minSize = 24;

    switch (this.drag.mode) {
      case "move": {
        this.box = { ...origin, x: origin.x + dx, y: origin.y + dy };
        break;
      }
      case "resize_e": {
        this.box = { ...origin, width: Math.max(minSize, origin.width + dx) };
        break;
      }
      case "resize_w": {
        const nx = Math.min(origin.x + dx, origin.x + origin.width - minSize);
        this.box = { ...origin, x: nx, width: origin.x + origin.width - nx };
        break;
      }
      case "resize_s": {
        this.box = { ...origin, height: Math.max(minSize, origin.height + dy) };
        break;
      }
      case "resize_n": {
        const ny = Math.min(origin.y + dy, origin.y + origin.height - minSize);
        this.box = { ...origin, y: ny, height: origin.y + origin.height - ny };
        break;
      }
      case "joint": {
        if (!this.manifest) return;
        const joint = this.manifest.joints[this.drag.jointIndex];
        if (joint) {
          joint.x = p.x;
          joint.y = p.y;
        }
        break;
      }
      case "toggle":
        break;
    }
  }

  pointerUp(): void {
    this.drag = null;
  }

  isDragging(): boolean {
    return this.drag !== null;
  }

  private nearestStroke(p: { x: number; y: number }): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const stroke of this.store.all()) {
      if (!stroke.active || !this.filter(stroke)) continue;
      for (const point of stroke.points) {
        const dist = Math.hypot(p.x - point.x, p.y - point.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = stroke.id;
        }
      }
    }
    return best;
  }

  private finalize(): void {
    if (!this.manifest) return;
    this.manifest = ensureValidParents(this.manifest);
    this.manifest.parts = this.manifest.parts.filter((part) =>
      part.strokeIds.some((id) => !this.excluded.has(id)),
    );
  }

  manifestReady(): CharacterManifest | null {
    if (!this.manifest) return null;
    if (!verifyManifest(this.manifest)) return null;
    return this.manifest;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (!this.box || !this.manifest) return;
    const { width: w, height: h } = this.getViewport();

    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);

    ctx.fillStyle = "rgba(16,59,70,0.45)";
    ctx.fillRect(camera.state.x, 0, w, h);

    if (this.stage === "box" || this.stage === "strokes") {
      ctx.strokeStyle = PALETTE.activeInk;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(this.box.x, this.box.y, this.box.width, this.box.height);
      ctx.setLineDash([]);
      const corner = 10;
      for (const [cx, cy] of [
        [this.box.x, this.box.y],
        [this.box.x + this.box.width, this.box.y],
        [this.box.x, this.box.y + this.box.height],
        [this.box.x + this.box.width, this.box.y + this.box.height],
      ]) {
        ctx.fillStyle = PALETTE.activeInk;
        ctx.fillRect(cx - corner / 2, cy - corner / 2, corner, corner);
      }
    }

    if (this.stage === "strokes") {
      const strokes = this.store.all();
      for (const stroke of strokes) {
        if (!stroke.active || !this.filter(stroke)) continue;
        ctx.strokeStyle = this.excluded.has(stroke.id) ? "rgba(247,245,238,0.18)" : stroke.color;
        ctx.lineWidth = stroke.baseWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
    }

    if (this.stage === "joints") {
      for (const joint of this.manifest.joints) {
        const color =
          joint.confidence >= 0.85 ? PALETTE.primaryInk : joint.confidence >= 0.6 ? PALETTE.warning : PALETTE.error;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(joint.x, joint.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(16,59,70,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = PALETTE.primaryInk;
        ctx.font = "11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(joint.id, joint.x, joint.y - 12);
      }
    }

    ctx.restore();
  }
}
