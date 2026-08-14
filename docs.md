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
- Real provider smoke test: stick-figure PNG → `gemini-3.6-flash` returned complete 16-joint skeleton, face anchors, part regions, confidence 0.98, `skeletonSound: true`. Latency ~20.5s (likely json_schema→json_object fallback doubling the call; tuned later by AI_JSON_MODE).
- Spike gate (plan §31 Test A): PASS for simple stick figures.

## Phase 2 — Joint Editor & Manifest (done)

- Three-stage setup: bounding box (drag/resize) → stroke selection (tap to toggle, dim excluded) → joint drag with confidence coloring (white ≥0.85 / warning 0.6–0.84 / error <0.6). Parent validation, skeleton cycle checks, manifest JSON + IndexedDB persistence.
- `id-map.ts`: offscreen canvas color registry (encode/decode), region & polygon sampling to map AI polygons → real stroke ids. `character-manifest.ts`: analysis → manifest (world coords), verify/repair (ensureValidParents), missing-joint reporting.
- Tests: 59 passing incl. fake-indexeddb storage round-trips.

## Phase 3 — Rig Runtime (done)

- `rig-builder`: resample + nearest-joint assignment (implicit virtual stroke splitting), face groups (eye/mouth points within radius).
- `rig-runtime`: FK chains (accumulated rotations), rigid point transforms, blink timer, pencil look (clamped offset), talk mouth pulse, `boneToWorld` for attachments.
- `motion-clips` + `animation-controller`: spawn, idle, happy, confused, talk, walk, stop_at_pond, hold_rod, cast_rod, pull_fish (track arrays, smoothstep interpolation, loop/one-shot).
- Sample character now boots ALIVE (hardcoded manifest) — plan §31 Test B demo.
- Tests: 73 passing (FK rotation math, blink squash, clip evaluation, controller loop/end).

## Phase 4 — Story Shell (done)

- `quest-engine`: deterministic state machine DRAW_CHARACTER → … → AWAIT_SHOES → EQUIP_SHOES → WALK_TO_POND → AWAIT_TOOL → EQUIP_TOOL → FISHING → ENDING, with bubble queues, in-character failures (Per-Bubble timing driven by bootstrap).
- `pond-scene`: pre-authored line pond, ripple lines, parabola fish jump, caught-fish drawing.
- `walker` + camera easing: character walks the ground path to the pond (root delta + camera follow, lock during goals).
- Hardcoded shoes/rod attachments (fallback when AI path unused), cast sequence (rod → line → fish jump → pull → ending bubbles).
- Tests: 84 passing (full story run, invalid-drawing stay, walker math, pond jump).

## Phase 5 — Shoe Recognition (done)

- `POST /api/drawing/analyze`: full scene + delta crop + goal + joints + world summary → DrawingAnalysis (zod-validated, clamped, bubble truncated at 70).
- Client: stroke checkpoint on `await_drawing`, delta-crop capture, 1.4s inactivity analysis, early-call accumulation (checkpoint unchanged until success).
- Equip uses the USER'S OWN strokes: AI bounding box → ID map → stroke ids → points in foot-bone local space (`buildAttachmentFromObject`, ≤500 pts, nearest-bone fallback).
- Reactions: AI bubble (Persian guard w/ in-character fallbacks), failure → character asks again.
- Real provider test: drawn shoe boxes → 2 shoe objects, attachTo left/right_foot, equip_shoes, confidence 0.95. ✓
- Tests: 92 passing.

## Phase 6 — Fishing Tool Recognition (done)

- Same pipeline as shoes; accepted categories rod/net/spear/magnet; held_tool attaches to right_hand; handle anchor from AI.
- Curved sag line attachment, fish jump timed to cast, caught fish drawn at line end after pull, ending sequence («من خیلی کوچیکم!» → «ادامهٔ این خط را تو میکشی.»).
- Real provider test: curved rod → fishing_rod/held_tool, right_hand, equip_tool, confidence 0.92. ✓
- Tests: 103 passing.

## Phase 7 — Polish (done)

- PWA: `manifest.webmanifest` (fullscreen, landscape), SVG icon, `sw.js` (cache-first for static, never /api), registered in prod.
- Session persistence: strokes (debounced) + manifest + quest state in IndexedDB; restore on reload → character re-rigged, story resumes at the pending request.
- Reset button (↺): clears session + reloads. Thinking animation (confused) during analysis; idle after failure.
- Build fix: server emits to `server/dist/` (`rootDir`), static served from `process.cwd()/dist`; separate `tsconfig.tests.json` for typecheck.
- Verified: `npm run build` + `npm start` → health, config/public, HTML, sw.js, manifest all 200.

## Notes / Open questions

- AI latency: character analyze ~20s first call (fallback double-call); drawing analyze ~10-15s. Perceived wait covered by confused anim + look; further tuning via AI_JSON_MODE/AI_THINKING_LEVEL or a faster model in `.env`.
- AI Persian bubbles came back garbled from the provider (?) — guarded client-side with Persian fallbacks; story-critical bubbles are hardcoded Persian in the engine.
- iPad touch testing not possible in this environment — verify Pencil flow on device (pressure, eraser, fullscreen).
- Plan §31 Test C (shoe loop) passed end-to-end with real provider images; on-device delight check remains.


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
