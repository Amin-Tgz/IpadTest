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

- PWA: `manifest.webmanifest` (fullscreen, landscape), SVG icon, and `sw.js` registered in production. Navigations are network-first so new releases reach installed iPads; hashed static assets remain cache-first and `/api` is never cached.
- Session persistence: strokes (debounced) + manifest + quest state in IndexedDB; restore on reload → character re-rigged, story resumes at the pending request.
- Reset button (↺): clears session + reloads. Thinking animation (confused) during analysis; idle after failure.
- Build fix: server emits to `server/dist/` (`rootDir`), static served from `process.cwd()/dist`; separate `tsconfig.tests.json` for typecheck.
- Verified: `npm run build` + `npm start` → health, config/public, HTML, sw.js, manifest all 200.

## Notes / Open questions

- AI latency: character analyze ~20s first call (fallback double-call); drawing analyze ~10-15s. Perceived wait covered by confused anim + look; further tuning via AI_JSON_MODE/AI_THINKING_LEVEL or a faster model in `.env`.
- Gemini TTS takes several seconds on a cache miss. Repeated lines use an in-memory WAV cache; pre-generation/streaming remains a possible latency improvement.
- AI Persian bubbles are guarded client-side with Persian fallbacks; story-critical bubbles are hardcoded Persian in the engine.
- Generated Persian audio playback is verified on-device. Pencil pressure, eraser feel, and long-session fullscreen behavior still need continued iPad testing.
- Plan §31 Test C (shoe loop) passed end-to-end with real provider images; on-device delight check remains.

## Repair checkpoint — core interaction and transform ownership

- Normal startup no longer creates a sample character, rig, or running quest. The sample remains an explicit demo action only.
- Pointer input now keeps a transient stroke rendered on every frame, consumes coalesced pointer samples, and commits only at pointer-up. Repeated undo now walks backwards through active strokes.
- Rig geometry is character-local. Rendering follows: rest-local point → posed/skinned local point → persistent entity transform → camera world-to-screen. Root rotation is applied by the runtime.
- Walking updates the persistent entity transform, so the next idle frame, anchors, attachments, and camera follow all retain the pond position.
- Rigged strokes retain source stroke order, samples, and pressure for perfect-freehand rendering. Semantic manifest parts constrain bone assignment where available.
- Attachments retain independent source strokes and transfer their render ownership from the world layer. Attachment source IDs are stable and rods do not remove shoes.
- AI drawing captures label full-scene and delta images, state the delta crop in full-image coordinates, and render the baseline only once through the camera transform.
- Server configuration is loaded at app creation rather than module import; response-format mode honors `AI_JSON_MODE` on its first attempt.


## Phaser living-world checkpoint

- Phaser 4.2.1 owns the Canvas frame lifecycle, camera bridge, input surface, and Matter physics world while preserving pressure-sensitive Pencil strokes.
- Character creation uses a 30%-wide left guide and a non-upscaled cropped capture with X/Y crop-aware coordinate normalization.
- AI analysis is manual-only through `زنده‌اش کن` and `▶ ببین نقاشی‌مو`; failed reviews retain their checkpoint.
- Character manifests migrate to v2 with AI part polygons and Pencil-lasso segment overrides; bone-owned segments overlap at seams.
- Drawing analysis can return validated capability actions and collision semantics for platforms, stairs, slopes, obstacles, and dynamic objects.
- On-screen diagnostics were removed while console logs remain; primary bottom actions have 15% larger text, padding, and touch height.

## Drawing reaction movement and speech checkpoint

- Recognized free-play drawings remain visible; the character approaches from the nearest safe side before performing and speaking its reaction.
- The baseline and its Matter collision floor extend ahead of the camera, preserving continuous walking as the world scrolls.
- Persian speech now uses server-generated Gemini Flash TTS (`gemini-2.5-flash-tts`, `Leda`) instead of device voices. The server converts 24 kHz PCM to WAV, caches repeated lines in memory, and the client plays through a tap-unlocked Web Audio context on iPad Safari.
- `TTS_MODEL`, `TTS_VOICE`, and `TTS_STYLE` provide voice and performance control without exposing provider credentials to the client.
- Speech lifecycle diagnostics cover generation, Web Audio context state, playback start/end, and provider failures. `?debug=speech` exposes a direct voice test and forwards diagnostics to the server terminal.
- Verified on iPad: generated Persian voice is audible without installing a Farsi system voice.
- Verification at commit `d2002cd`: typecheck passed, 31 test files / 155 tests passed, production build passed, real Gemini TTS returned valid 24 kHz WAV, and repeated requests hit the in-memory cache.

## Original living-line hero checkpoint

- Normal startup now shows a moving bump in the ground line and raises one authored, unnamed hero; character drawing, AI body analysis, joint setup, and segment repair are absent from the user journey.
- The hero uses fixed spline-sampled paths, 16 reliable semantic anchors, curved runtime limbs, distance-synchronized walking, and new protest/effort motion clips.
- The shoe and fishing tutorial is wired into the live drawing-analysis flow before open-ended free play. Prototype sessions without schema version 3 reset instead of restoring obsolete character manifests.
- Reactions now carry a controlled emotion, separate Persian `bubble` and `spoken` strings, and a non-blocking audio fallback. Tutorial voice lines preload into a client/server cache when available.
- The legacy character-analysis route is opt-in with `ENABLE_LEGACY_CHARACTER_ANALYSIS=1`; it is not registered in normal startup.
- Verification: strict typecheck passed, 32 test files / 163 tests passed, production build passed, and offline Playwright checks covered the intro bump, tutorial bubbles, DPR 1/2 rendering, Pencil/mouse shoe strokes, and review-button reveal.

## Line Pal continuity and interaction checkpoint

- The local product identity is now **Line Pal / رفیق خطی**. The public GitHub repository is intentionally not renamed until the exact repository slug is approved.
- A bounded conversation ledger persists with the session. It records child interpretations, hero bubble/spoken replies, action starts, arrivals, falls, fishing, and rescue milestones, and sends the recent history with each structured drawing-analysis request.
- Explicit AI `move` and `climb` actions now execute. Platforms and bridges target the far edge so requests to cross them complete; ordinary reactions approach the near side rather than walking through an object.
- The tutorial walker stops before the pond's left waterline. On arrival a fish follows a full jump arc, re-enters the water, and disappears.
- Fishing line geometry is generated each frame from the transformed tip of the child's held tool to a J-shaped hook. The hook and caught fish remain at the line end instead of appearing at the hand anchor.
- Web Audio retries local clip delivery, falls back to generated speech if a static clip cannot load or decode, rechecks suspended contexts, and uses a post-duration watchdog only for missed `onended` browser events.
- The default actor is `Leda`. Performance direction allows occasional mock anger and sparse «رفیق»، «مشتی»، and «چه خفن», while explicitly discouraging repetitive «آها/اهان». Leda generation is always attempted first; because the provider connection timed out during the asset refresh, older local tutorial clips remain only as a last-resort anti-silence fallback until they can be regenerated.
- The persistent top drawing hint, the free-play announcement, and the speech-bubble tail were removed.

## Drawing-preservation and provider-resilience checkpoint

Found by driving the running app in a browser against the real provider, not by the test suite (which was green throughout).

- **The child's drawing could be silently deleted.** Reviewed strokes were retained only when a point fell inside the provider's bounding box (+12px). Provider boxes routinely land tens of pixels off, so a correct drawing was reclassified as instruction ink and deactivated — the artwork vanished while the hero spoke a delighted line about it. `src/world/object-strokes.ts` now owns stroke→object ownership: containment first, then a nearest-box match within a tolerance scaled to the object, and only genuinely distant ink counts as instruction ink.
- **Ownership is settled before ink is swept.** `clearTemporaryReviewInk` ran before attachments existed, so strokes an attachment was about to claim had no `entityId` to protect them. It now runs after the equip branches.
- **One object's attachment could swallow a neighbouring drawing.** The id-map region sampler bleeds nearby strokes into a padded box, which handed both shoes to a single foot and left the second slot unfillable. The caller's resolved stroke set is now authoritative; box sampling is only the fallback. Covered by `tests/character/attachments.test.ts`.
- **Wearable anchors come from the child's ink**, not from the reported box, so a misplaced box no longer parks a shoe below the ground line.
- **Provider connection errors are now retried.** The OpenAI SDK reports every DNS/TCP/TLS failure as the opaque `"Connection error."`, which the old regex missed, so a transient blip cost a whole story beat with zero retries. `isRetryableProviderError` now walks the cause chain and matches connection/socket/DNS codes and retryable statuses.
- **A stale server on the dev port is no longer silent.** `EADDRINUSE` previously set `exitCode` and let the client keep running against whatever old build held the port — this cost real debugging time during this session. The server now exits with a loud banner and `npm run dev` uses `--kill-others-on-fail`.
- **An empty `getCoalescedEvents()` no longer discards a stroke.** Safari has shipped builds that answer with an empty list; every point between pen-down and pen-up was dropped. `pointerMoveSamples` falls back to the event itself.
- Verification: strict typecheck passed, 41 test files / 216 tests passed, production build passed, and a live run with the real provider equipped both shoes from two separate drawings with `removedCount: 0`.
