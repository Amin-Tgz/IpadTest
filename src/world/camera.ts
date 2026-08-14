export interface CameraState {
  x: number;
  y: number;
  zoom: number;
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
