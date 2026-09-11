export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Camera y that keeps the hero's head (and the bubble above it) on screen
 * when it stands on top of something tall. Never scrolls below the ground
 * framing, so ordinary play keeps the baseline where the child expects it.
 */
export function verticalFollowTarget(headWorldY: number, viewportHeight: number): number {
  return Math.min(0, headWorldY - Math.max(140, viewportHeight * 0.2));
}

export class Camera {
  state: CameraState = { x: 0, y: 0, zoom: 1 };

  worldToScreen(p: { x: number; y: number }): { x: number; y: number } {
    return {
      x: (p.x - this.state.x) * this.state.zoom,
      y: (p.y - this.state.y) * this.state.zoom,
    };
  }

  screenToWorld(p: { x: number; y: number }): { x: number; y: number } {
    return {
      x: p.x / this.state.zoom + this.state.x,
      y: p.y / this.state.zoom + this.state.y,
    };
  }

  setX(x: number): void {
    this.state.x = x;
  }

  translateScreenToWorldWith(viewSize: { width: number; height: number }): void {
    this.state.zoom = 1;
    void viewSize;
  }
}
