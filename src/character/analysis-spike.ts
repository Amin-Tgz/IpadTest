import type { StrokeStore } from "../drawing/stroke-store.js";
import type { Camera } from "../world/camera.js";
import type { GroundPath } from "../world/ground-path.js";
import type { SpeechBubble } from "../story/speech-bubble.js";
import { captureRegion, captureViewport } from "../ai/capture.js";
import { analyzeCharacter } from "../ai/ai-client.js";
import { imageToWorldX, imageToWorldY, type CaptureMapping } from "../ai/normalization.js";
import type { CharacterAnalysis, CharacterAnalyzeResult } from "../ai/schemas.js";
import { PALETTE } from "../app/constants.js";
import type { Diagnostics } from "../app/diagnostics.js";

export type SpikeStatus = "idle" | "analyzing" | "done" | "failed";

interface JointWorld {
  id: string;
  x: number;
  y: number;
  parent: string | null;
  confidence: number;
}

interface FaceWorld {
  leftEye?: { x: number; y: number };
  rightEye?: { x: number; y: number };
  leftEyebrow?: { x: number; y: number };
  rightEyebrow?: { x: number; y: number };
  mouth?: { x: number; y: number };
}

export class AnalysisSpike {
  status: SpikeStatus = "idle";
  analysis: CharacterAnalysis | null = null;
  boxWorld: { x: number; y: number; width: number; height: number } | null = null;
  jointsWorld: JointWorld[] = [];
  faceWorld: FaceWorld = {};
  confidence = 0;
  private mapping: CaptureMapping | null = null;
  private inFlight = false;

  constructor(
    private readonly store: StrokeStore,
    private readonly camera: Camera,
    private readonly getViewport: () => { width: number; height: number },
    private readonly getGroundPath: () => GroundPath,
    private readonly bubble: SpeechBubble,
    private readonly diagnostics: Diagnostics,
    private readonly getAnalysisRegion: (() => { x: number; y: number; width: number; height: number }) | null = null,
    private readonly onStateChange: () => void = () => void 0,
  ) {}

  userHasDrawn(): boolean {
    return this.store.all().some((s) => s.active && s.entityId === null);
  }

  getMapping(): CaptureMapping | null {
    return this.mapping;
  }

  async requestAnalyze(includeSample: boolean): Promise<CharacterAnalyzeResult | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    this.status = "analyzing";
    this.diagnostics.info("character_analysis_started", { includeSample, activeStrokes: this.store.active().length });
    this.analysis = null;
    this.bubble.show("بذار دقیق ببینمت…", this.headAnchor());
    this.onStateChange();

    try {
      const viewport = this.getViewport();
      const captured = !includeSample && this.getAnalysisRegion
        ? captureRegion(this.store, paddedRegion(this.getAnalysisRegion(), viewport), {
            targetMaxDim: 768,
            includeSampleCharacter: false,
          })
        : captureViewport(
            this.store,
            this.camera,
            viewport,
            this.getGroundPath(),
            { targetMaxDim: 1024, includeSampleCharacter: includeSample },
          );
      const result = await analyzeCharacter(captured.dataUrl, {
        width: captured.mapping.width,
        height: captured.mapping.height,
      });
      this.mapping = captured.mapping;
      this.applyAnalysis(result.analysis);
      this.status = "done";
      this.diagnostics.info("character_analysis_succeeded", {
        joints: result.analysis.character.joints.length,
        partRegions: result.analysis.character.partRegions.length,
        partNames: result.analysis.character.partRegions.map((region) => region.part),
        confidence: result.analysis.character.confidence,
      });
      this.onStateChange();
      return result;
    } catch (error) {
      this.status = "failed";
      this.diagnostics.error("character_analysis_failed", error);
      this.bubble.show("هوم… هنوز خوب نمی‌بینمت. یه بار دیگه امتحان کنیم؟", this.headAnchor());
      this.onStateChange();
      return null;
    } finally {
      this.inFlight = false;
    }
  }

  private applyAnalysis(analysis: CharacterAnalysis): void {
    this.analysis = analysis;
    const mapping = this.mapping;
    if (!mapping) return;
    const box = analysis.character.boundingBox;
    this.boxWorld = {
      x: imageToWorldX(box.x, mapping),
      y: imageToWorldY(box.y, mapping),
      width: box.width / mapping.scale,
      height: box.height / mapping.scale,
    };
    this.jointsWorld = analysis.character.joints.map((j) => ({
      id: j.id,
      x: imageToWorldX(j.x, mapping),
      y: imageToWorldY(j.y, mapping),
      parent: j.parent,
      confidence: j.confidence,
    }));
    this.faceWorld = {
      leftEye: analysis.character.face.leftEye
        ? { x: imageToWorldX(analysis.character.face.leftEye.x, mapping), y: imageToWorldY(analysis.character.face.leftEye.y, mapping) }
        : undefined,
      rightEye: analysis.character.face.rightEye
        ? { x: imageToWorldX(analysis.character.face.rightEye.x, mapping), y: imageToWorldY(analysis.character.face.rightEye.y, mapping) }
        : undefined,
      leftEyebrow: analysis.character.face.leftEyebrow
        ? { x: imageToWorldX(analysis.character.face.leftEyebrow.x, mapping), y: imageToWorldY(analysis.character.face.leftEyebrow.y, mapping) }
        : undefined,
      rightEyebrow: analysis.character.face.rightEyebrow
        ? { x: imageToWorldX(analysis.character.face.rightEyebrow.x, mapping), y: imageToWorldY(analysis.character.face.rightEyebrow.y, mapping) }
        : undefined,
      mouth: analysis.character.face.mouth
        ? { x: imageToWorldX(analysis.character.face.mouth.x, mapping), y: imageToWorldY(analysis.character.face.mouth.y, mapping) }
        : undefined,
    };
    this.confidence = analysis.character.confidence;
  }

  private headAnchor(): { x: number; y: number } {
    const viewport = this.getViewport();
    return this.camera.worldToScreen({
      x: viewport.width * 0.34,
      y: viewport.height * 0.4,
    });
  }

  confidenceColor(c: number): string {
    if (c >= 0.85) return PALETTE.primaryInk;
    if (c >= 0.6) return PALETTE.warning;
    return PALETTE.error;
  }

  drawOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.status !== "done" || !this.analysis) return;
    ctx.save();
    ctx.translate(-camera.state.x, -camera.state.y);

    if (this.boxWorld) {
      const box = this.boxWorld;
      ctx.strokeStyle = PALETTE.activeInk;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.setLineDash([]);
    }

    for (const joint of this.jointsWorld) {
      ctx.fillStyle = this.confidenceColor(joint.confidence);
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(247,245,238,0.75)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(joint.id, joint.x, joint.y - 9);
    }

    const cross = (p: { x: number; y: number } | undefined, color: string): void => {
      if (!p) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y);
      ctx.lineTo(p.x + 6, p.y);
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x, p.y + 6);
      ctx.stroke();
    };
    cross(this.faceWorld.leftEye, PALETTE.activeInk);
    cross(this.faceWorld.rightEye, PALETTE.activeInk);
    cross(this.faceWorld.leftEyebrow, PALETTE.warning);
    cross(this.faceWorld.rightEyebrow, PALETTE.warning);
    cross(this.faceWorld.mouth, PALETTE.warning);

    ctx.restore();
  }
}

function paddedRegion(
  region: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const padding = Math.max(18, Math.min(region.width, region.height) * 0.08);
  const x = Math.max(0, region.x - padding);
  const y = Math.max(0, region.y - padding);
  const right = Math.min(viewport.width, region.x + region.width + padding);
  const bottom = Math.min(viewport.height, region.y + region.height + padding);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}
