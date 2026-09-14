# Line Pal — رفیق خطی

<img width="778" height="378" alt="image" src="https://github.com/user-attachments/assets/a04f95da-83cb-4b2a-861b-e5c646c1155e" />





Line Pal is a line-drawing adventure designed for iPad and Apple Pencil. An original living-line hero rises from the ground, then a child draws the shoes, tools, obstacles, and scenery that help it move through the world.

The central rule is simple: **the child's solution strokes stay the artwork**. AI understands the drawing; an authored hero, deterministic animation, and physics execute the result.

## What it does

- Captures pressure-sensitive Apple Pencil strokes in world coordinates.
- Starts immediately with a fixed, original line hero—no body analysis or joint editor.
- Animates authored spline paths for idle, blink, look, talk, protest, effort, reaction, and walking.
- Understands later drawings such as clothing, tools, platforms, stairs, obstacles, symbols, and scene objects.
- Keeps recognized drawings visible, approaches them from the safe side, and executes requested movement across bridges and platforms.
- Extends the white ground line and its Matter physics floor as the camera moves.
- Generates a controllable Persian character voice with six consistent performance presets and separate bubble/spoken text.
- Persists strokes, attachments, world entities, camera, story state, conversation, and completed-action history in IndexedDB.
- Installs as a fullscreen landscape PWA.

## Current status

The complete prototype pipeline is implemented through the polish phase. The latest verified baseline is:

- TypeScript strict typecheck passing
- 41 Vitest files and 221 tests passing
- Production build passing
- Real character/drawing analysis smoke-tested
- Gemini Persian TTS and Web Audio playback verified on iPad
- Shoe tutorial driven end to end in a browser against the live provider

See [docs.md](docs.md) for the phase-by-phase development log and [plan.md](plan.md) for the full product specification.

## Technology

| Area | Stack |
| --- | --- |
| Client | TypeScript, Vite, Canvas 2D, Phaser 4, Matter physics |
| Drawing | Pointer Events, Apple Pencil pressure, perfect-freehand |
| Animation | Custom joint rig, FK transforms, IK helpers, motion clips |
| Server | Node.js, Express, TypeScript, Zod |
| AI analysis | OpenAI-compatible multimodal provider |
| Voice | Gemini Flash TTS, PCM-to-WAV conversion, Web Audio |
| Storage | IndexedDB |
| Tests | Vitest, fake-indexeddb |

## Architecture

```text
src/
  ai/           scene capture, schemas, normalization, API client
  animation/    motion clips and animation controller
  app/          bootstrap, state, controls, diagnostics
  character/    analysis editor, manifest, rig, runtime, attachments
  drawing/      pointer input, stroke storage, rendering, ID map
  storage/      IndexedDB session persistence
  story/        quest engine, bubbles, generated speech playback
  world/        Phaser/Matter bridge, camera, entities, ground, walking

server/
  ai/           provider adapter, prompts, validation, Gemini TTS
  routes/       character analysis, drawing analysis, speech, config
  middleware/   rate limiting
```

Client requests never contain provider credentials. Character and drawing interpretation happen on the server, while animation frames, transforms, navigation, and collisions remain deterministic on the client.

## Requirements

- Node.js 20 or newer
- npm
- An AI provider key
- A provider endpoint that supports:
  - OpenAI-compatible chat completions for visual analysis
  - Gemini native `v1beta` audio generation for Gemini TTS

The current setup is tested with AvalAI, which exposes both API shapes through one server-side key.

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and configure it:

```env
PORT=3456
AI_BASE_URL=https://api.example.com/v1
AI_API_KEY=your-server-side-key
AI_MODEL=gemini-3.7-flash

AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=2
AI_JSON_MODE=json_schema
AI_THINKING_LEVEL=low
ENABLE_LEGACY_CHARACTER_ANALYSIS=0

TTS_MODEL=gemini-2.5-flash-tts
TTS_VOICE=Leda
TTS_STYLE=با صدایی جوان، گرم و بازیگوش؛ گاهی کمی غرغرو و عصبانی بامزه؛ بدون تکرار زیاد آها
```

`AI_API_KEY` is read only by the Express server. Do not expose it through Vite variables or commit `.env`.

## Development

Run the Vite client and Express server together:

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server: the `PORT` configured in `.env`
- Vite proxies `/api` requests to the server during development.

Useful commands:

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production client from `dist/` using the compiled Express server.

## Using the app

1. Open the app in landscape orientation on iPad.
2. Watch the moving ground-line bump rise into the hero.
3. Draw two shoes when the hero asks, together or one at a time, then tap **▶ ببین نقاشی‌مو**. Each foot accepts exactly one shoe and walking waits for both.
4. Draw a fishing tool for the second tutorial request.
5. Continue drawing or writing freely; the hero reacts in Persian and can follow written movement requests, including crossing a recognized bridge.

Refreshing during the incomplete shoe lesson restarts that lesson with two empty foot slots; completed story progress can still be restored.

Both hands have authored index-finger and thumb strokes with fixed semantic tip anchors. In free play the structured AI response may choose `point` plus a validated object index; the client selects the nearer hand, aims it with deterministic IK, holds the fingertip on target for the whole reaction beat, then clears the override.

If the ground is erased under the hero, physics lets it fall to an in-view rescue boundary. Drawing a recognized ladder moves a separate transform of those same source strokes to the nearest intact edge, then a fixed hand-and-foot cycle follows deterministic upward waypoints. The raw drawing coordinates are never rewritten, and the placed ladder remains in the world after recovery.

Use `?debug=speech` to show a direct voice-test button and forward speech lifecycle events to the server terminal:

```text
http://localhost:3456/?debug=speech
```

## Generated voice

The default actor is Gemini `Leda`, directed toward a youthful, warm Iranian-Persian performance that can become mock-grumpy without losing clarity. Tutorial and open-ended reactions first use that configured actor through generated TTS and one of six presets: curious, protesting, confused, effort, delighted, or sad. Reactions avoid repetitive interjections and may occasionally use «رفیق»، «مشتی»، or «چه خفن». Until the checked-in clips can be regenerated as Leda, the older local tutorial recordings are used only as a last-resort fallback when generation fails, so a provider outage does not create a silent story beat.

Conversation memory is stored with the local session. Each recognized child input, hero reply, action start, and completed movement is added to a bounded history and included in later drawing-analysis requests, allowing follow-ups such as written movement commands to refer to earlier objects and actions.

Gemini returns 24 kHz PCM audio. The server validates the AI response, wraps PCM as WAV, and keeps up to 48 repeated lines in memory. The client uses one tap-unlocked Web Audio context so delayed responses can play reliably on iPad Safari.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/config/public` | Safe public capabilities |
| `POST` | `/api/drawing/analyze` | Interpret new drawing strokes and select an action |
| `POST` | `/api/speech` | Generate and return Persian WAV audio |

The old `/api/character/analyze` route is disabled by default. Set `ENABLE_LEGACY_CHARACTER_ANALYSIS=1` only for development comparison and open `?debug=character` in the Vite client.

AI outputs are validated with closed Zod/JSON schemas, fixed attachment anchors, local target/semantic checks, request-size limits, and route rate limits. Generated speech text is capped at 200 characters. Invalid point or rescue targets never reach the animation engine.

## Design principles

- User strokes are never replaced by generated images.
- Raw stroke points are not overwritten.
- AI returns meaning and structured intent—not animation frames.
- Coordinates are stored in world space and transformed through the camera.
- Story art uses warm white line work on petroleum blue.
- Persian UI stays minimal, playful, and suitable for children.
- Failures remain in character instead of showing dry technical errors.

## Documentation

- [CLAUDE.md](CLAUDE.md) — repository conventions and architecture summary
- [rules.md](rules.md) — platform and security rules

## License

No license has been added yet. Add one before distributing or accepting external contributions.
