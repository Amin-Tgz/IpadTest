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

## Wearable fit checkpoint

- **A wearable is fitted to the hero instead of burying it.** A child draws a shoe at pencil scale — roughly five times the hero's foot — so two equipped shoes overlapped into one blob that hid the legs. `wearableFitScale` shrinks an oversized wearable toward its anchor through the existing `localTransform`, never enlarges, and never drops below 0.35 so the child still recognizes their own drawing. The raw stroke points are untouched.
- **A shoe's sole sits on the ground line.** The foot joint rests exactly on the baseline, so anchoring a shoe 35% down its height buried two thirds of it underground. The anchor is now the sole line (`SHOE_SOLE_RATIO`).
- Verification: strict typecheck passed, 41 test files / 221 tests passed, production build passed, and a live provider run placed one correctly sized shoe on each foot with the hero's legs still visible.

## Static voice checkpoint

- The four fixed tutorial lines (shoes protest/request, pond notice, tool request) now play the pre-downloaded clips in `public/audio/hero/*.pwa` as their primary source (`audioUrl`) instead of generating Gemini TTS on every scenario start. Generated TTS remains only as the on-failure fallback.
- `GeneratedSpeech.prime` no longer warms the generated cache for lines that already ship a static clip, so booting a scenario no longer calls `/api/speech` for the fixed scripted lines.
- All seven clips in `public/audio/hero/` were regenerated with the current `gemini-2.5-flash-tts` / `Leda` voice (the old clips were from an earlier male-sounding voice). The script's delighted interjection text was corrected to «آها!» so the clip matches the manifest and stays a short exclamation. Verification: strict typecheck passed, 42 test files / 225 tests passed, production build passed, and the built app served `/audio/hero/*.pwa` (valid WAV, 200) and `/api/health` 200. The clips are WAV bytes served as `application/octet-stream`; playback uses Web Audio `decodeAudioData`, which sniffs the RIFF header.

## Free-world handoff, stair climbing, and ladder-fall voice checkpoint

- After the fish is caught and the ending overlay shows «حالا نوبت دنیای توست.», the world is handed back to the child on plain ground: `showEnding()` clears the pond and the rod's hook/line (`pond = null`, `fishingLine = null`, and clears the hero's look) so the scene is just the ground line for free drawing.
- Drawn stairs are now actually climbable. `climbTo` marks a stairs-targeted navigation as `kinematic`, and `updateKinematicClimb` steers the character body directly onto each tread top (via `stairTopWaypoints`) instead of relying on a velocity hop that wedges the box on the static step risers. It advances tread-by-tread and reports `navigation_arrived` at the top. The final `startNavigation` gains an optional `kinematic` flag.
- The ladder-fall plea («اوه! افتادم... یک نردبان پله‌پله برام بکش تا بیام بالا.») now plays a pre-downloaded static clip against `audioUrl: /audio/hero/ladder-fall.pwa` instead of generating Gemini TTS on the rescue start, and it is preloaded at boot alongside the tutorial lines. `scripts/generate-tutorial-audio.ts` now emits the eighth clip (`ladder-fall.pwa`, `sad` preset).
- Verification: strict typecheck passed, 42 test files / 225 tests passed, production build passed. The manifest now carries eight entries; the generated-speech policy test asserts at least seven and that every entry is a WAV.

## Single-take voice and drawn-stairs climbing checkpoint

- **The hero said lines twice because the audio itself did.** Gemini TTS sometimes reads a line two or more times: `shoes-protest.pwa` was 8.9s holding two ~3.7s takes of one sentence, «آها!» was spoken twice, and «هوم...» was 27s of rambling. `server/ai/speech-guard.ts` finds speech phrases in the PCM and rejects a take that runs past a per-character duration budget, or that splits into two balanced takes around a long pause no sentence break in the text explains. The generator retries up to three takes, and if every take is bad it keeps exactly one by cutting at the end of the first take. Leading and trailing silence is trimmed, so playback starts sooner.
- **The TTS prompt is now a short English director's note.** Measured against the live model: the old Persian prompt repeated in about 1 of 5 takes, a Persian "say it only once" instruction repeated in every successful take (up to 49s), and Persian style text inside an English note still repeated in 3 of 9. The English note alone was clean 6/6 for sentences. The `TTS_STYLE` default and `.env.example` are English; a Persian `TTS_STYLE` in a local `.env` still works but costs retries.
- All eight tutorial clips were regenerated through the guard; none is over budget or repeated (`shoes-protest` 4.4s, `interjection-thinking` 1.9s).
- **Drawn stairs are climbed on the drawn outline.** Stairs used to be 2–8 synthetic, equal steps inside the provider's bounding box, the climb pushed a dynamic box diagonally into riser corners against gravity, and a tower or block classified as `obstacle` was never climbable. `drawnSurface` now reads the top-most ink per 8px column (inner lines such as an arrow drawn inside the structure, and stray marks far outside its box, never become a surface). `surfaceSupportRects` merges that skyline into treads (narrow pen ticks are flattened) that double as the Matter colliders, and `surfaceClimbRoute` walks to the foot of the structure, then follows its treads to the middle of the highest level. During the tread-by-tread part the character body is held static, so it cannot wedge or fall.
- **Movement intent.** `src/ai/movement-intent.ts` makes drawn stairs, ramps and hills climbable even when the provider only reacted to them, pointed at them, targeted the arrow drawn on them, or asked to move "up". A climb aimed at a tower/block also uses its drawn outline. `move` toward a box, wall, or ladder now stops beside it instead of walking into its middle and stalling.
- **The drawing prompt** asks for one object covering a staircase and whatever it leads onto, treats arrows and written commands as instructions (physicsShape `none`), maps stairs/ramps/hills to `climb`, and phrases move/climb reactions as arrivals, because they are spoken after the hero gets there. If a walk or climb fails, the hero says an in-character "I couldn't get there" line instead of the arrival line.
- **Vertical camera follow.** A hero standing on a tall drawing used to have its head and bubble cut off at the top of the screen. The camera now rises to keep the head on screen and returns to the ground framing afterwards. The ground line, the AI capture image, and the joint→image mapping all honor camera y.
- Foot-to-ground correction now picks the support under the foot, not a riser beside it.
- Verification: strict typecheck passed, 45 test files / 249 tests passed, production build passed. Playwright (Chromium, 1024×768) drove the running app on the user's screenshot drawing: with a mocked analysis that only "reacted", the hero climbed 13 tread waypoints onto the plateau. Against the live model, the provider returned one `stairs` object plus an `arrow` (`none`) and `climb`, and the hero climbed and said «هوف! رسیدم بالا رفیق، از این بالا همه‌جا پیداست!». A fresh-start run showed exactly two tutorial beats and two playbacks.

## Tall-wall and ladder climbing checkpoint

- **A rise too tall to step (a wall facing the hero) is climbed, not hopped.** `surfaceClimbRoute` marks any rise over 1.5 body half-heights as a `climb` waypoint: the hero goes straight up in front of the wall with the `ladder_climb` motion at a slower pace, then steps onto the tread. This covers stairs whose tall side faces the hero and the tall last step of the screenshot drawing.
- **Drawn ladders are climbable in free play.** A ladder no longer gets a solid box collider (the post-rescue ladder was also re-added as a rotated solid block). `ladderClimbRoute` walks to its foot and climbs to the top rung; `ladderLanding` finds the support it leans on (level with its top and touching its side) and the hero steps onto it. With nothing to step onto, the hero pauses at the top and climbs back down. Movement intent treats ladders as invitations to climb, `move` toward a ladder climbs it, and the drawing prompt says a free-play ladder is for climbing.
- The navigation snapshot exposes `climbingSegment`, and the bootstrap switches between `walk` and `ladder_climb` while navigating.
- Verification: strict typecheck passed, 45 test files / 254 tests passed. Playwright (Chromium, 1024×768) against the running app, with screenshots and page logs checked for each: screenshot stairs with a mocked "react" analysis, stairs whose tall wall faces the hero, a ladder leaning on a tower, and the screenshot stairs with the live model (it returned `stairs_tower` + `arrow` and `climb`) all ended with `navigation_arrived` and the hero standing on the top, head and bubble on screen. A fresh-start voice run showed two beats and two playbacks.

## Echo-free first line, tools put away, and jumping down checkpoint

- **The first line said «اِ» twice.** A transcription of `shoes-protest.pwa` by the analysis model heard «اه، این خط برای پای برهنم خیلی زبره، اه.»: the voice model echoed its opening interjection after the sentence, a 0.3s phrase too short for the duration and balanced-take checks. The speech guard now also cuts a trailing phrase the text's final clause cannot account for, and any second phrase after a one-word line («هوم آخ»).
- `npm run audio:generate` now listens to every clip with the analysis model (audio input) and regenerates until the transcript matches the line exactly once. All eight clips were regenerated and accepted (`ladder-fall` needed a second take).
- **Tools are put away when the fishing story ends.** `showEnding` removes held-tool attachments, deactivates their strokes and world entities, and records it in the conversation; shoes stay on. A session restored after the ending no longer brings the pond back.
- **Jumping down works.** A `jump` was only a vertical hop, so a hero on top of a drawn tower answered «باشه، آماده پرشم!» and stayed there. `jumpDestination` now lands a jump at the tip of the drawn arrow, on a drawn object, or — with only a direction — just past the nearest point where the ground drops to the floor (`dropLandingX`). `jumpToward` leaps with horizontal speed and keeps walking to the landing point; the reply is spoken after landing. A downward `move` is treated as a jump down, and the prompt asks for jump direction and target.
- A pending reaction is only held for a navigation that actually started, so a jump in place can never leave the review button blocked.
- Verification: strict typecheck passed, 45 test files / 260 tests passed. Playwright (Chromium, 1024×768), screenshots and page logs checked: climb the screenshot stairs, then draw an arrow off the tower — the live model returned `jump` toward the arrow, the hero leapt (`jump_started`), landed on the ground (`character_landed`), walked to the arrow tip (`navigation_arrived`), and then spoke; a fishing run showed the rod in hand at the pond and gone after the ending (`held_tools_put_away`); the stairs, facing-away, and ladder scenes still reach the top; a fresh start shows two beats and two playbacks.

## Rideable vehicles checkpoint

- **A drawn motorcycle (or scooter, bicycle, car, skateboard) can be ridden.** The drawing protocol gains physicsShape `vehicle`, action `ride`, and per-object `vehicle` hints — `facing`, `seat`, and `exhaust` (null for vehicles without an engine) — validated by zod, clamped to the image, and required by the strict JSON schema. The prompt asks for them and for the reaction to be phrased as after the ride.
- `src/world/vehicle-ride.ts` owns the ride. `vehicleLayout` takes the seat from the provider when it lands on the drawing (otherwise a little behind the middle) and always takes its height from the top of the child's ink; the exhaust comes from the provider or, for engine vehicles, the rear-bottom of the drawing. `VehicleRide` is a time-driven mount → ride → dismount state machine: a hop onto the seat, acceleration with a small wheelie, a light bounce, braking to the ride distance (480–1100px from the requested duration), stopping early before a ground gap or anything taller than the ground ahead, and a hop off onto the ground.
- The child's strokes are moved as drawn (`MovableWorldObject`, now with `transformPoint`); the vehicle has no collider, is parked where it stopped, and keeps that transform across reloads. The hero is held on the seat through `holdCharacterAt` / `releaseCharacter`, in a new `ride` motion clip (legs straddling, hands out on the handlebars, a small engine shiver). The camera follows the ride.
- **Exhaust smoke:** engine vehicles puff white line-art rings from the exhaust that drift back and up, grow, and fade, faster at higher throttle, with a procedural engine "putt" (`SfxEngine.engine`). Bicycles and skateboards make no smoke.
- Movement intent turns a reaction, a `use`/`equip`/`interact`, a move, or a mistargeted `ride` into riding the drawn vehicle; a `jump` is left alone. The review button stays hidden during a ride, and a failed ride gets an in-character line.
- Verification: strict typecheck passed, 46 test files / 272 tests passed (layout, seat/exhaust hints, the full ride, feet above the ground, wheelie, stopping before an obstacle, riding left, and ride intent). Playwright (Chromium, 1024×768), screenshots and page logs checked: with a mocked analysis that only "reacted", the hero walked to the bike, mounted (`ride_mounted`), rode 480px with smoke rings trailing the exhaust, got off (`ride_finished`), and then spoke; against the live model a motorcycle drawing came back as `motorcycle` / `vehicle` with an exhaust and `ride`, and the hero rode 700px (a plainer drawing was read as a bicycle — ridden without smoke). The stairs, facing-away, ladder, jump-down (live model), fishing, and voice scenes all still pass.
