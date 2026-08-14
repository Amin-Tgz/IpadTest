import type { StrokeStore } from "../drawing/stroke-store";
import type { Camera } from "../world/camera";
import type { GroundPath } from "../world/ground-path";
import type { SpeechBubble } from "../story/speech-bubble";
import { captureViewport } from "../ai/capture";
import { analyzeCharacter } from "../ai/ai-client";
import { imageToWorldX, imageToWorldY, type CaptureMapping } from "../ai/normalization";
import type { CharacterAnalysis } from "../ai/schemas";
import { PALETTE } from "../app/constants";

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
    private readonly onStateChange: () => void = () => void 0,
  ) {}

  userHasDrawn(): boolean {
    return this.store.all().some((s) => s.entityId === null);
  }

  async requestAnalyze(includeSample: boolean): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    this.status = "analyzing";
    this.analysis = null;
    this.bubble.show("بذار دقیق ببینمت…", this.headAnchor());
    this.onStateChange();

    try {
      const viewport = this.getViewport();
      const captured = captureViewport(
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
    } catch (error) {
      this.status = "failed";
      this.bubble.show("هوم… هنوز خوب نمی‌بینمت. یه بار دیگه امتحان کنیم؟", this.headAnchor());
    } finally {
      this.inFlight = false;
      this.onStateChange();
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
    cross(this.faceWorld.mouth, PALETTE.warning);

    ctx.restore();
  }
}
