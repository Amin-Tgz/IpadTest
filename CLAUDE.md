# CLAUDE.md — Pencil AI

Pencil AI is a line-drawing adventure for iPad Safari: the user draws a character with Apple Pencil, AI detects joints as JSON, the character comes alive and the story is told through drawing only (draw shoes, draw a fishing rod). No voice, no buttons beyond a minimum.

Product spec: `plan.md`. Platform/security rules: `rules.md`. Progress log: `docs.md`.

## Commands

- `npm run dev` — Vite client (5173) + Express server (PORT from `.env`), `/api` proxied
- `npm run typecheck` — both client and server TS
- `npm test` — vitest unit/integration tests
- `npm run build` — compile server to `server/dist/`, client to `dist/`
- `npm start` — serve built app from Express (`PORT` from `.env`)

## Environment

`.env` (git-ignored, copy from `.env.example`) — API key lives ONLY on the server:

- `AI_BASE_URL` — OpenAI-compatible base URL
- `AI_API_KEY` — provider key
- `AI_MODEL` — model name (default `gemini-3.7-flash`)
- `PORT` — Express port
- `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_JSON_MODE`, `AI_THINKING_LEVEL` — optional tuning

The client never receives the API key or base URL; it only calls the local server.

## Architecture

```
client (src/)                 server (server/)
  drawing/ pointer-input,       routes/ analyze-character,
  stroke-store, renderer,       analyze-drawing
  id-map                        ai/ provider adapter, prompts,
  character/ joint-editor,      validation (zod), retry policy
  rig-builder, rig-runtime,     config.ts (env → zod)
  attachments
  animation/ controller,
  motion-clips
  world/ scene-graph, camera,
  ground-path, pond-scene
  story/ quest-engine, quests,
  speech-bubble
  ai/ ai-client, schemas
  storage/ indexed-db
```

Principles (from plan §6.1):

- AI understands; the animation engine executes. AI never produces frames/transforms.
- User strokes are sacred — never replaced by generated images.
- Coordinates are stored in world space; camera transforms to screen.
- Raw stroke points are never overwritten; resampled copies are used for rigging.
- All story elements are white line art on petroleum blue (`#103B46`), width 4px at 1024 ref.
- UI is Persian, RTL, minimal. Bubble text ≤ 70 chars, ≤ 2 lines.
- Failure is in-character (personality reacts), never a dry error message.

## Coding conventions

- TypeScript strict everywhere; zod schemas for every AI output boundary.
- No comments in code unless they carry semantics the names can't.
- Tests live in `tests/` mirroring module paths, one `*.test.ts` per unit.
- After each plan phase: run typecheck + tests + a manual server smoke test, then commit with a `phase N:` message and update `docs.md`.
