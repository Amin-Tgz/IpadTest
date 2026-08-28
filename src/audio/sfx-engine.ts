export type SfxDiagnostic = (event: string, detail: Record<string, unknown>) => void;

export class SfxEngine {
  private noiseBuffer: AudioBuffer | null = null;

  constructor(
    private readonly getContext: () => AudioContext | null,
    private readonly diagnostic: SfxDiagnostic = () => void 0,
  ) {}

  footstep(intensity = 1): void {
    const ctx = this.getContext();
    if (!ctx || ctx.state !== "running") return;
    try {
      const now = ctx.currentTime;
      const buffer = this.getNoise(ctx);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1200 + Math.random() * 400;
      band.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18 * intensity, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      src.connect(band);
      band.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.1);
    } catch (error) {
      this.diagnostic("sfx_footstep_error", { message: String(error) });
    }
  }

  land(strength = 1): void {
    const ctx = this.getContext();
    if (!ctx || ctx.state !== "running") return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.18);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.28 * strength, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);

      const buffer = this.getNoise(ctx);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 420;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0, now);
      nGain.gain.linearRampToValueAtTime(0.12 * strength, now + 0.005);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      src.connect(low);
      low.connect(nGain);
      nGain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.09);
    } catch (error) {
      this.diagnostic("sfx_land_error", { message: String(error) });
    }
  }

  drawTick(speed: number, pressure: number): void {
    const ctx = this.getContext();
    if (!ctx || ctx.state !== "running") return;
    if (Math.random() > 0.45) return;
    try {
      const now = ctx.currentTime;
      const buffer = this.getNoise(ctx);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      const freq = 700 + Math.min(1800, speed * 22) + pressure * 600;
      band.frequency.value = freq;
      band.Q.value = 2.2;
      const gain = ctx.createGain();
      const amp = 0.04 + pressure * 0.06;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      src.connect(band);
      band.connect(gain);
      gain.connect(ctx.destination);
      src.playbackRate.value = 0.9 + Math.random() * 0.25;
      src.start(now);
      src.stop(now + 0.05);
    } catch (error) {
      this.diagnostic("sfx_draw_error", { message: String(error) });
    }
  }

  jump(): void {
    const ctx = this.getContext();
    if (!ctx || ctx.state !== "running") return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(320, now + 0.11);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (error) {
      this.diagnostic("sfx_jump_error", { message: String(error) });
    }
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) return this.noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }
}
