export class Camera {
    state = { x: 0, y: 0, zoom: 1 };
    worldToScreen(p) {
        return {
            x: (p.x - this.state.x) * this.state.zoom,
            y: (p.y - this.state.y) * this.state.zoom,
        };
    }
    screenToWorld(p) {
        return {
            x: p.x / this.state.zoom + this.state.x,
            y: p.y / this.state.zoom + this.state.y,
        };
    }
    setX(x) {
        this.state.x = x;
    }
    translateScreenToWorldWith(viewSize) {
        this.state.zoom = 1;
        void viewSize;
    }
}
