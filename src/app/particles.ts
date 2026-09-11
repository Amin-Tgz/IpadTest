import { PALETTE } from "./constants.js";
import type { Camera } from "../world/camera.js";
import type { RigRuntime } from "../character/rig-runtime.js";

export interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface SmokePuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
}

const MAX_SMOKE_PUFFS = 90;

export class ParticleFXManager {
  private readonly dustParticles: DustParticle[] = [];
  private readonly smokePuffs: SmokePuff[] = [];

  /** Exhaust smoke: white line-art rings that drift back and up, grow, and fade. */
  spawnSmoke(x: number, y: number, backward: -1 | 1, throttle = 1): void {
    const count = throttle > 0.75 ? 2 : 1;
    for (let i = 0; i < count && this.smokePuffs.length < MAX_SMOKE_PUFFS; i++) {
      this.smokePuffs.push({
        x: x + backward * 2,
        y: y + (Math.random() - 0.5) * 3,
        vx: backward * (0.6 + Math.random() * 0.9) * (0.6 + throttle * 0.6) + (Math.random() - 0.5) * 0.3,
        vy: -(0.25 + Math.random() * 0.45),
        radius: 2.5 + Math.random() * 2.5,
        life: 1,
      });
    }
  }

  updateAndDrawSmoke(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
      const puff = this.smokePuffs[i];
      puff.x += puff.vx;
      puff.y += puff.vy;
      puff.vx *= 0.985;
      puff.vy *= 0.99;
      puff.radius += 0.3;
      puff.life -= 0.018;
      if (puff.life <= 0) this.smokePuffs.splice(i, 1);
    }
    if (this.smokePuffs.length === 0) return;
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    ctx.strokeStyle = PALETTE.primaryInk;
    ctx.lineWidth = 2;
    for (const puff of this.smokePuffs) {
      ctx.globalAlpha = Math.max(0, puff.life) * 0.8;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  private squashUntil = 0;
  private squashScaleX = 1;
  private squashScaleY = 1;

  spawnDust(x: number, y: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * 1.4;
      const speed = 1.2 + Math.random() * 2.8;
      this.dustParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 1.5,
        life: 1,
        maxLife: 1,
      });
    }
  }

  triggerSquash(sx: number, sy: number, durationMs: number, nowMs: number): void {
    this.squashScaleX = sx;
    this.squashScaleY = sy;
    this.squashUntil = nowMs + durationMs;
  }

  updateAndDrawDust(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const p = this.dustParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.98;
      p.life -= 0.04;
      if (p.life <= 0) this.dustParticles.splice(i, 1);
    }
    if (this.dustParticles.length === 0) return;

    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);
    ctx.strokeStyle = PALETTE.primaryInk;
    ctx.lineCap = "round";
    for (const p of this.dustParticles) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.85;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 0.5, p.y + p.vy * 0.2 + 1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  applySquash(rigRuntime: RigRuntime | null, now: number): void {
    if (!rigRuntime) return;
    if (now < this.squashUntil) {
      const remaining = this.squashUntil - now;
      const duration = 120;
      const p = 1 - remaining / duration;
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      const sx = 1 + (this.squashScaleX - 1) * (1 - ease);
      const sy = 1 + (this.squashScaleY - 1) * (1 - ease);
      const base = rigRuntime.entityTransform;
      rigRuntime.setEntityTransform({ ...base, scaleX: sx, scaleY: sy });
    } else if (rigRuntime.entityTransform.scaleX !== 1 || rigRuntime.entityTransform.scaleY !== 1) {
      const base = rigRuntime.entityTransform;
      rigRuntime.setEntityTransform({ ...base, scaleX: 1, scaleY: 1 });
    }
  }
}
