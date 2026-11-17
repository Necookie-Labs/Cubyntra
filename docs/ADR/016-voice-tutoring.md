# ADR-016: Voice Tutoring

**Status**: Accepted
**Date**: 2026-11-18
**Deciders**: Necookie Labs Core Engineering Team
**Related**: [ADR-012](012-deterministic-tutor-engine.md) (the engine picks every move),
[ADR-014](014-claude-coach.md) (coach, guardrail, spend cap), [ADR-015](015-state-only-sync.md)
(state-only sync, no pixels leave the device)

---

## Context

A student solving a real cube has both hands on it and their eyes on it. Reading the twin's move
chips and the coach panel between turns breaks the flow. The tutor should talk: name each move
as the twin plays it, say what a checkpoint found, and read the coach's explanation. Speech must
cost little (the coach already has a $10/month cap), work with no key and offline, never say a
move the engine did not choose, and send nothing private off the laptop.

## Decision

### 1. A fallback chain, chosen in Settings
`settings.voiceMode` (profile schema v3) is `off`, `device` or `elevenlabs`, default `off`.
- **Device voice**: the browser's `speechSynthesis` (`src/voice/deviceVoice.ts`), feature-detected,
  preferring the default English voice, then a local `en-US`, `en-GB`, then any `en-*`. Free,
  offline, no key.
- **ElevenLabs** through the laptop (`/api/voice`), Flash v2.5 (`eleven_flash_v2_5`), a stock
  premade voice (`JBFqnCBsd6RMkjVDRZzb`, overridable with `ELEVENLABS_VOICE_ID`; no cloning).
- Any failure (no key, the cap, ElevenLabs down, no network, autoplay blocked) says the line with
  the device voice (`createVoiceSpeaker`). After "no key" or "credits used up" the chain stops
  asking ElevenLabs for the rest of the screen.

Settings also hold `voiceRate` (0.75, 1, 1.25) and `voiceMoves` (`words` or `notation`).

### 2. Speak only what the screen shows, after the guardrail
- `speechText.ts` turns text into speech: markdown and backticks are stripped and every move token
  (found by the coach guardrail's own `extractMoveTokens`) becomes its spoken form. Words:
  `moveName` ("Turn the right side up"). Notation: the letter with "prime", "two" or "wide"
  ("R prime", "R wide two", "M", "x two"). A run of moves is read as a list; a gloss
  "R = turn the right side up" is read once.
- Coach replies are spoken by `coachSpeech` only when `useCoach` reports `done` (so any `replace`
  event has already swapped in the template) and only if the final text passes
  `checkReplyMoves` again for the step. A reply that fails the guard is never spoken.
- Free-form coach replies use the device voice; in ElevenLabs mode a "Read with ElevenLabs" button
  reads one with ElevenLabs. Step narration and checkpoints use the phrase bank.

### 3. Phrase bank and clip cache
`src/voice/phrases.ts` holds every fixed line: all 54 moves (face, wide, slice, rotation × three
amounts) in both styles, an intro per stage of both methods (and the full last layer), "show me
the X face" for the six faces, and the checkpoint lines (match, match by hand, three praise lines,
show it again, hold it as shown, wrong face, one more face, mismatch, solved), plus "Test voice".
142 distinct lines, 3,118 characters, about 1,559 Flash credits for the whole bank.

A `phrase` request is served from `data/voice/<sha256(model, voice, text)>.mp3` when it exists,
spending nothing; otherwise it is made and saved atomically. Only bank texts may be sent as
`phrase` (so the cache cannot be filled with arbitrary text); `reply` clips are never stored.
`npm run voice:prewarm` prints the line, character and credit totals and makes the missing clips
only with `--yes`. The browser also keeps fetched phrase clips in memory for the page.

### 4. Credits
- `src/voice/credits.ts` has one table of credits per character (Flash and Turbo v2.5: 0.5;
  Multilingual v2: 1; see https://elevenlabs.io/docs/models and https://elevenlabs.io/pricing).
- Characters sent are counted per UTC month in `data/voice-usage.json` (atomic writes, saves
  serialized). Cached clips are not counted.
- Before a call its credits are reserved and the call is refused if it could pass the limit, so
  one request cannot overshoot. The limit is the lower of the monthly cap (default 20,000 credits,
  `ELEVENLABS_MONTHLY_CREDIT_CAP`) and the account's real balance:
  `character_limit - character_count` from `GET /v1/user/subscription`, read at most every
  10 minutes, minus credits spent through the laptop since.
- 80% of the limit raises `warning` (Settings shows a notice). At the limit `/api/voice` answers
  503 `{ fallback: 'device', reason: 'capped' }` and status reports `mode: 'device'`.
- An ElevenLabs HTTP error charges nothing; audio that broke off after a 200 is counted.

### 5. Routes
- `POST /api/voice`: `x-cubyntra-token` required, body `{ text, kind? }` only (4 KB cap, read in
  chunks), text 1-1,200 characters with no data URL or long base64 run, 60 requests a minute per
  token (twice the coach: narration asks once per move the first time). Answers `audio/mpeg` with
  `X-Voice-Cache: hit | miss`, or a JSON fallback (503 no key / capped, 502 upstream).
- `GET /api/voice/status[?preference=]`: `{ mode, keySet, monthCredits, capCredits, remaining?,
  accountRemaining?, warning, reason?, month }`. `preference` defaults to the profile's choice.
- ElevenLabs is called with `fetch` (no SDK): `POST /v1/text-to-speech/{voice_id}?output_format=
  mp3_44100_128` with `xi-api-key` and `{ text, model_id }`, and `GET /v1/user/subscription`.
  Checked against the API reference on 2026-11-18.

### 6. When the voice speaks
- Never before the page's first user gesture (`audioUnlock.ts`): browsers block autoplay, and lines
  before it are dropped, not queued. The speaker button's tap is such a gesture.
- `SpeechQueue` says lines one after another. A new step interrupts (the current line stops, the
  waiting ones are dropped); the next move cuts the last move's name short.
- The solve screen (`useSolveVoice`) says a stage intro when a step opens a new stage, each move as
  it starts turning forwards (stepping back is silent), and each checkpoint result.
- **One speaker**: when paired, only the device driving the solve speaks: the one that last showed
  a new step (a new plan id) or sent a playback command (`play`, `pause`, `seek`, `speed`).
  Re-sent steps (the follower adopting a plan) and `index` move reports do not count. Both devices
  see the same relayed order, so they agree (`SpeakerArbiter`).

### 7. Privacy
Only text goes to ElevenLabs: the line to speak and the model id. No images, cube state, profile
or student name. `/api/voice` refuses any field besides `text` and `kind`, and any text that looks
like a data URL or an encoded blob (`tests/voice-privacy.test.ts`). The key stays in `.env.local`
on the laptop; the browser never sees it.

## Alternatives considered

- **ElevenLabs for everything, coach replies included.** Rejected as the default: replies are
  free-form and uncacheable, about 300-700 characters each; a few hints a day would use the cap.
  The student can still ask for one.
- **The ElevenLabs SDK.** Two plain HTTP calls do not need a dependency; `fetch` keeps the request
  visible and easy to fake in tests.
- **Streaming audio (`/stream`).** Clips are short; a whole MP3 is simpler to cache and play.
- **Cache every reply too.** Rejected: unbounded disk use for text that rarely repeats.
- **Both paired devices speak.** Rejected: an echo between laptop and phone a metre apart.

## Consequences

- The tutor speaks with no key at all; a key only changes the voice.
- After the bank is made once (about 1,559 credits), narrating solves costs nothing; the 20,000
  monthly cap mostly covers "Read with ElevenLabs" (about 1,000 characters ≈ 1 minute of audio ≈
  500 Flash credits).
- Changing the voice id or model makes new clips (the hash covers both); old clips stay on disk.
- The device voice's quality and choice of voices depend on the browser and OS.
