export function clampCoord(value, max) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(max, value));
}
export function clampConfidence(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1, value));
}
export function imageToWorldX(imageX, mapping) {
    return imageX / mapping.scale + mapping.cameraX;
}
export function imageToWorldY(imageY, mapping) {
    return imageY / mapping.scale;
}
export function worldToImage(p, mapping) {
    return {
        x: (p.x - mapping.cameraX) * mapping.scale,
        y: p.y * mapping.scale,
    };
}
