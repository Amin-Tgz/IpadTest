export class Walker {
    path;
    stopDistance;
    distance = 0;
    speed = 96;
    constructor(path, stopDistance) {
        this.path = path;
        this.stopDistance = stopDistance;
    }
    start() {
        this.distance = 0;
    }
    get finished() {
        return this.distance >= this.stopDistance;
    }
    step(dtMs) {
        if (this.finished)
            return;
        this.distance = Math.min(this.stopDistance, this.distance + (this.speed * dtMs) / 1000);
    }
    position() {
        const { point, tangentAngle } = this.path.pointAtDistance(this.distance);
        return { x: point.x, y: point.y, tangentAngle };
    }
}
export function easeToward(current, target, dtMs, speed = 3.2) {
    const t = Math.min(1, (dtMs / 1000) * speed);
    return current + (target - current) * t;
}
