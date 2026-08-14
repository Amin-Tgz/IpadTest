# docs.md — Progress & Dev Notes

Living document. Each plan phase ends with: test result, commit hash, notes, open questions.

## Phase 0 — Visual Prototype (done)

- Petroleum theme, white 4px strokes (2–8px via pressure), baseline at 72% viewport height, RTL Persian speech bubble with scale-in, sample character (hardcoded strokes, `src/app/sample-character.ts`), pencil glow, inactivity bubble demo.
- Modules: `stroke-store`, `pointer-input` (Pointer Events + pressure + world space), `stroke-renderer` (perfect-freehand + path cache), `stroke-resampler`, `camera`, `ground-path`, `speech-bubble`, `app-state`.
- Tests: 14 passing (store, resampler, camera, ground-path). Vite build OK. Server smoke OK.

## Phase 1 — Character Analysis (in progress)

Server + provider adapter + `/api/character/analyze`.

## Phase 2 — Joint Editor (planned)

Draggable joints, ID map, manifest persistence.

## Phase 3 — Rig Runtime (planned)

Segmentation, rigid transforms, idle/blink/look/walk.

## Phase 4 — Story Shell (planned)

Quest engine, camera, pond, hardcoded objects, ending.

## Phase 5 — Shoe Recognition (planned)

Checkpoints, delta crop, attachment, reactions.

## Phase 6 — Fishing Tool Recognition (planned)

Rod attach, cast animation, fish sequence.

## Phase 7 — Polish (planned)

PWA fullscreen, session reset, perf.
