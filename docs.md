# docs.md — Progress & Dev Notes

Living document. Each plan phase ends with: test result, commit hash, notes, open questions.

## Phase 0 — Visual Prototype (done)

- Petroleum theme, white 4px strokes (2–8px via pressure), baseline at 72% viewport height, RTL Persian speech bubble with scale-in, sample character (hardcoded strokes, `src/app/sample-character.ts`), pencil glow, inactivity bubble demo.
- Modules: `stroke-store`, `pointer-input` (Pointer Events + pressure + world space), `stroke-renderer` (perfect-freehand + path cache), `stroke-resampler`, `camera`, `ground-path`, `speech-bubble`, `app-state`.
- Tests: 14 passing (store, resampler, camera, ground-path). Vite build OK. Server smoke OK.

## Phase 1 — Character Analysis (done)

- Server: `config.ts` (zod env), provider adapter (`openai-compatible.ts`, json_schema → json_object → text fallback), prompts, zod validation + clamping + skeleton soundness checks, retry policy, light rate limit, `POST /api/character/analyze`, `GET /api/config/public`.
- Client: `ai-client`, `schemas` (TS types), `normalization`, `capture` (offscreen canvas snapshot at ≤1024, image→world mapping), `AnalysisSpike` overlay (dashed box, joint dots with confidence coloring, face crosses), «زندهاش کن» button + sample-character demo button.
- Tests: 37 passing (validation, skeleton cycles, retry policy, route with mock provider).
- Real provider smoke test: stick-figure PNG → `gemini-3.6-flash` returned complete 16-joint skeleton, face anchors, part regions, confidence 0.98, `skeletonSound: true`. Latency ~20.5s (likely json_schema→json_object fallback doubling the call; tuning in phase 7).
- Spike gate (plan §31 Test A): PASS for simple stick figures.

## Phase 2 — Joint Editor (in progress)

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
