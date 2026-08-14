let counter = 0;
export function nextId(prefix) {
    counter += 1;
    return `${prefix}_${Date.now().toString(36)}_${counter}`;
}
export class StrokeStore {
    strokes = [];
    onAdd = [];
    onRemove = [];
    subscribeAdd(fn) {
        this.onAdd.push(fn);
    }
    subscribeRemove(fn) {
        this.onRemove.push(fn);
    }
    all() {
        return this.strokes;
    }
    active() {
        return this.strokes.filter((s) => s.active);
    }
    byId(id) {
        return this.strokes.find((s) => s.id === id);
    }
    count() {
        return this.strokes.length;
    }
    add(stroke) {
        this.strokes.push(stroke);
        this.onAdd.forEach((fn) => fn(stroke));
    }
    deactivate(id) {
        const stroke = this.byId(id);
        if (stroke)
            stroke.active = false;
    }
    setInactiveFrom(index) {
        for (let i = index; i < this.strokes.length; i++) {
            this.strokes[i].active = false;
        }
    }
    setEntityId(id, entityId) {
        const stroke = this.byId(id);
        if (stroke)
            stroke.entityId = entityId;
    }
    undo() {
        const last = this.strokes[this.strokes.length - 1];
        if (!last)
            return undefined;
        last.active = false;
        this.onRemove.forEach((fn) => fn(last));
        return last;
    }
}
