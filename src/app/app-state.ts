export type AppMode = "intro" | "drawing" | "analyzing" | "setup" | "live";

export interface AppState {
  mode: AppMode;
  cameraX: number;
  viewportWidth: number;
  viewportHeight: number;
}

export type AppStateListener = (state: AppState) => void;

export class AppStateController {
  private state: AppState = {
    mode: "intro",
    cameraX: 0,
    viewportWidth: 0,
    viewportHeight: 0,
  };
  private listeners: AppStateListener[] = [];

  get(): AppState {
    return { ...this.state };
  }

  setMode(mode: AppMode): void {
    if (this.state.mode === mode) return;
    this.state.mode = mode;
    this.emit();
  }

  setViewport(width: number, height: number): void {
    if (this.state.viewportWidth === width && this.state.viewportHeight === height) return;
    this.state.viewportWidth = width;
    this.state.viewportHeight = height;
    this.emit();
  }

  setCameraX(x: number): void {
    if (Math.abs(this.state.cameraX - x) < 0.05) return;
    this.state.cameraX = x;
    this.emit();
  }

  subscribe(fn: AppStateListener): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    const snapshot = this.get();
    this.listeners.forEach((fn) => fn(snapshot));
  }
}
