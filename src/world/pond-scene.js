import { PALETTE, BASE_LINE_WIDTH } from "../app/constants.js";
const JUMP_DURATION_MS = 1500;
export class PondScene {
    x;
    y;
    radiusX;
    radiusY;
    fish = { jumping: false, jumpStart: 0, caught: false };
    constructor(x, y, radiusX, radiusY) {
        this.x = x;
        this.y = y;
        this.radiusX = radiusX;
        this.radiusY = radiusY;
    }
    triggerFishJump(now) {
        this.fish.jumping = true;
        this.fish.jumpStart = now;
    }
    fishPosition(now) {
        if (!this.fish.jumping || this.fish.caught)
            return null;
        const t = Math.min(1, (now - this.fish.jumpStart) / JUMP_DURATION_MS);
        if (t >= 1) {
            this.fish.jumping = false;
            return null;
        }
        const x = this.x - this.radiusX * 0.35 + t * this.radiusX * 0.7;
        const y = this.y + this.radiusY * 0.55 - Math.sin(t * Math.PI) * this.radiusY * 1.9;
        return { x, y };
    }
    draw(ctx, camera, now) {
        ctx.save();
        ctx.translate(-camera.state.x, -camera.state.y);
        ctx.strokeStyle = PALETTE.primaryInk;
        ctx.lineWidth = BASE_LINE_WIDTH;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, this.radiusX, this.radiusY, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
            const ry = this.radiusY * (0.55 + i * 0.16);
            const alpha = 0.5 - i * 0.13;
            ctx.strokeStyle = `rgba(247,245,238,${alpha})`;
            ctx.beginPath();
            ctx.ellipse(this.x, this.y + this.radiusY * 0.15 + i * 4, this.radiusX * (0.85 - i * 0.22), ry * 0.35, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.strokeStyle = PALETTE.primaryInk;
        const fishPos = this.fishPosition(now);
        if (fishPos)
            this.drawFish(ctx, fishPos);
        ctx.restore();
    }
    drawFish(ctx, p) {
        const sway = Math.sin(p.x * 0.1) * 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 16, 9, sway * 0.03, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x + 12, p.y);
        ctx.lineTo(p.x + 22, p.y - 8);
        ctx.lineTo(p.x + 22, p.y + 8);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = PALETTE.primaryInk;
        ctx.beginPath();
        ctx.arc(p.x - 8, p.y - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    drawCaughtFish(ctx, p) {
        this.drawFish(ctx, p);
    }
}
