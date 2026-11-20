# ADR-014: Claude Coach

**Status**: Accepted
**Date**: 2026-11-17
**Deciders**: Necookie Labs Core Engineering Team
**Related**: ADR-012 (deterministic tutor engine, Claude as explainer only), [ADR-001](001-client-side-processing.md) (client-side processing)

---

## Context

The tutor engine (`src/tutor/`) picks every move of a guided solve and checks each plan by
replaying it on the logical cube. A 10-year-old still needs the step explained: what to look
for, why it works, and how to do it, in plain words, with more help after a failed checkpoint.
A language model writes those explanations well, but it must never be trusted with moves, must
cost almost nothing, must keep working with no key or no network, and must not send anything
private off the laptop.

## Decision

### 1. Model and request
- `@anthropic-ai/sdk`, model `claude-haiku-5-5`, `client.messages.stream(...)`.
- `thinking: { type: "disabled" }`, `output_config: { effort: "low" }`, `max_tokens: 400`.
  Haiku 5.5 thinks adaptively by default and thinking tokens would eat into the 400-token reply
  budget (a cut-off reply becomes a template), so thinking is turned off; Haiku 5.5 accepts
  disabled thinking at effort `high` or below. No `temperature` / `top_p` / `top_k` (the current
  API rejects them).
- System prompt: one fixed text (`src/coach/systemPrompt.ts`, about 20,100 characters, roughly
  5,000 tokens) with the curriculum for both methods, stage-by-stage teaching notes, the tone for
  ages 10+, the hint levels and the rules. It is sent as a text block with
  `cache_control: { type: "ephemeral" }`. It contains nothing per request (a test hashes it and
  rejects dates and ids) so the prefix stays cached; it is well above the minimum cacheable size.
- User message: a compact facts JSON (`src/coach/facts.ts`) built from the tutor's `StepPlan`:
  method, stage id and name, case id and name, hint level, grip, setup moves, algorithm, repeat
  unit, the plan's own `facts.goal` / `lookFor` / `why`, up to five earlier attempts and, at hint
  level 3 only, `moveWords`: one plain-language line per taught move (`R = turn the right side
  up`, from `src/cube/moveNames.ts`; the server recomputes it from the notation). No cube state,
  no images.
- Case notes: every request also carries `caseTip`, the case's own teaching note for the hint
  level (a recognition cue at level 1, the idea and a common mistake at level 2, a fingertrick or
  practice tip at level 3). `src/coach/caseNotes.ts` generates the notes for every id in
  `allCaseIds()` from the tutor tables (OLL patterns, PLL cycles and recognition, algorithms)
  plus a short hand-written note per group or stage, so they cannot contradict the tables. Cue
  and idea name no moves; the tip names only moves of the case's algorithm, and any sentence
  with a move outside the facts is dropped. The server recomputes `caseTip` from `caseId`, the
  templates append it, and the notes stay out of the cached system prompt (which only describes
  the field) so the prompt stays byte-stable.
- Diagnosis: `useCoach` and `buildCoachFacts` take the tutor's own `Diagnosis` /
  `LikelyMistake` (`src/tutor/types.ts`). Only a compact projection is sent:
  `{ likelyMistakes: [{ kind, detail?, moveIndex?, confidence, description? }] (at most 3),
  confident, showNext? }`, with confidence rounded to two decimals and `showNext` in words
  ("the right side"). `performedMoves`, `resultingState`, `score` and `contradictions` stay in
  the browser.
- Hint levels: 1 = what to look for, 2 = why it works, 3 = the exact moves.

### 2. Claude never decides moves
- The prompt forbids inventing, changing or reordering moves and asks for words, not single
  letters, when naming sides or shapes.
- `src/coach/guard.ts` extracts every move-notation token (face, wide, slice and rotation turns
  with `'`, `2`, `w`, curly primes) and rejects the reply if any token is not allowed. Words such
  as "U-turn", "R&B", "I", "F2L", "L shape", "U perm" and the step's own case and stage names
  are not tokens.
- A bare single letter counts as a move only in move-like context: in a run of two or more move
  tokens separated by spaces, commas or brackets (with at least one capital or suffixed token),
  with a suffix (`R2`, `U'`, `Rw`), inside backticks, alone in brackets ("(F)"), or right after
  "do", "then", "turn" or "try". So "R U R' U'" and a single invented "R2" are caught, while
  "plan B", "the F face" and "the L becomes a line" are prose. The cost: a lone invented capital
  in plain prose ("look at F") passes; it names a side, not a sequence to perform.
- Condensed notation is split unit by unit: a word made only of move units, glued or joined by
  hyphens ("RUR'U'", "R-U-R'-U'", "R2U"), counts as moves when it has a prime, a count or a
  hyphen and a capital; a plain capital word ("URL", "FUR") counts only next to other moves. A
  count other than 2 is quarter turns ("R3" is `R'`); one with no net turn ("R4") is rejected,
  since it cannot be checked. "F2L", "3x3", possessives and "x3" stay words.
- Allowed moves: the step's setup, algorithm and repeat unit, plus moves named in the top
  diagnosed mistake's description. Descriptions are checked when the facts are built: the top
  mistake's description may name step moves or moves the student most likely did (its
  `performedMoves`); a lower-ranked description may name only step moves. A description that
  breaks this is dropped (the kind stays); the server also rejects a lower description that
  names a move outside the step. The tutor writes descriptions in words, so in practice they
  carry no notation.
- Text is relayed to the student only after the guard has seen it: up to the last whitespace,
  and a trailing bare letter is held back until the next word shows whether it starts a run of
  moves. A rejected move is normally never displayed. On rejection the reply is replaced by the
  template.

### 3. Templates and fallbacks
`src/coach/templates.ts` builds deterministic text at every hint level from the plan's own
facts: level 1 the goal and what to look for, level 2 the case and stage names and why it works,
level 3 the grip, the setup and algorithm (or repeat unit) and each move's plain-language name.
A tip about the last mistake comes first (the tutor's description when the diagnosis is
confident, otherwise a tip for the kind, plus the side to show next). Because the text comes
from the facts, any stage or case the tutor produces gets a template, including ones the coach
has never seen (for example full OLL/PLL cases).

`src/coach/stages.ts` adds teaching notes per stage. The stage list (ids, names, order) is taken
from the tutor's `METHODS`, not copied; notes are looked up by `method:stageId`, then by stage
family (`oll…`, `pll…`), and a stage without notes still gets the facts-based template. Tests
check that every stage in `METHODS` has notes and a template at levels 1-3, and that every note
names a real stage. Templates only quote moves from the facts. They are served:
- in **mock** mode (no `ANTHROPIC_API_KEY`),
- in **capped** mode (monthly cap reached),
- when the reply fails the guardrail, ends with `stop_reason` `refusal` (Haiku has no server-side
  fallback) or `max_tokens`, is empty, or the SDK throws (`Anthropic.RateLimitError`,
  `Anthropic.APIConnectionError`, any `Anthropic.APIError`). A client abort stops quietly.

### 4. Spend cap
`src/coach/spend.ts` prices `usage` with one table (Haiku 5.5: $0.10 / $0.50 per million input /
output tokens, cache writes 1.25x and cache reads 0.1x the input price) and adds it to the current
UTC month in `data/coach-usage.json` (atomic write). Before each call the worst case (whole prompt
as a cache write plus 400 output tokens, well under a tenth of a cent) is reserved, and the call is
refused if it could pass the cap. The cap is $10 a month, configurable with
`COACH_MONTHLY_CAP_USD`. Cache read and write token counts are logged on the server.

Usage is taken from the stream events as they arrive (`message_start` brings the input and cache
counts, `message_delta` the cumulative output count), so a call that the student leaves or that
fails part-way is still recorded. Cut off before the output count arrived, it is charged the full
400 output tokens; with no usage at all it is charged the worst-case estimate, unless the API
refused it with an HTTP status (nothing was billed). Saves of the usage file are serialized and,
like every atomic write, retried after 20 / 50 / 100 / 200 ms if Windows briefly locks the file.

### 5. Access
- `POST /api/coach` and `GET /api/coach/status` require the per-install app secret in the
  `x-cubyntra-token` header. The secret is created on first use in `data/app-secret`.
- `GET /api/auth/token` returns the secret only to loopback requests. Next.js 16 route handlers
  do not expose the client address (`NextRequest.ip` was removed in 15), so loopback is judged
  from headers: the Host must be `localhost`, `127.0.0.1` or `[::1]`, no proxy headers, and any
  browser `Origin` must be loopback too. A phone reaches the laptop by its LAN address and is
  refused; it will receive the secret in the pairing QR (`getPairingToken()`, Phase 8).
- 30 coach requests per minute per token (in-memory sliding window), 8 KB request bodies.

### 6. Wire format
`/api/coach` streams Server-Sent Events: `delta` (append text), `replace` (swap everything shown
for a template, with the reason) and one `done` (`source: live | template`, `mode`, optional reason
and notice). `src/coach/useCoach.ts` reads them into React state and aborts on unmount or when the
step changes.

## Alternatives considered

- **Let Claude produce or choose moves.** Rejected: the engine is verified by replay; a model is
  not. Moves stay deterministic (ADR-012).
- **Buffer the whole reply, check it, then send.** Simpler, but the student waits for the full
  reply. Relaying checked words keeps it responsive with the same safety.
- **No templates, show an error when Claude is unavailable.** Rejected: the tutor must work with
  no key, offline and after the cap.
- **A larger model.** Not needed for short explanations of fixed facts; Haiku at low effort keeps a
  hint near a hundredth of a cent with caching.

## Consequences

- The tutor is fully usable without a key; adding a key only changes the wording of hints.
- The guardrail is strict about sequences and suffixed moves but lets a lone capital in prose
  through; `npm run coach:eval` reports how often replies still fall back. The eval draws its 50
  situations from real guided solves of seeded scrambles (both methods, every stage, all hint
  levels), six of them with a diagnosis made by `diagnoseMistake` after an injected slip.
- Loopback detection by headers can be fooled by a program on the home network that forges
  `Host: localhost`; the token protects spend, not secrets, and Phase 8 moves the phone to the
  pairing QR.
- Stage ids and names have one source, the tutor's `METHODS`. A new stage needs a note in
  `STAGE_TIPS` (or matches a family) to pass the coverage test; until then it still gets the
  facts-based template.

## Addendum (2026-11-20): Ask the coach

A student often has one question the three hint levels do not answer ("what does R' mean?",
"what if I mess up?"). "Ask the coach" is a short conversation about the step on screen.

- **Route**: `POST /api/coach/chat` (`src/app/api/coach/chat/route.ts`). The same `guardUser`
  identity guard and `x-cubyntra-token` as `/api/coach`, the same chunked body reader (cap 24 KB,
  room for the 8 KB facts plus a full history), and its own limiter of 20 questions a minute per
  token (per user when hosted), separate from the 30 hints a minute.
- **Body**: `{ facts, question, history }`. `facts` is the usual `CoachFacts` (the browser builds
  them at hint level 3, so `moveWords` are there for notation questions); the server parses them
  with `parseCoachFacts`, which recomputes `moveWords` and `caseTip`. `question` is 1-400
  characters; `history` holds `{ role: 'student' | 'coach', text }` turns of up to 1,200
  characters, and only the newest eight are kept. Any other field, and any text that looks like
  a data URL or an encoded blob, is refused (`src/coach/chat.ts`).
- **Request** (`src/coach/chatService.ts`): `claude-haiku-5-5`, `thinking: disabled`,
  `output_config: { effort: 'low' }`, `max_tokens: 500`, streaming. Two system blocks: the cached
  coach prompt (first, with `cache_control`, so the cache is shared with hints) and the short,
  byte-stable `CHAT_RULES`: answer about this step only, 2-5 short sentences for ages 10+, notation
  may be explained, never invent moves, steer off-topic or personal questions back to the cube,
  say so when unsure. History becomes earlier user/assistant turns (starting with the student,
  same-side turns joined), and the last user turn is the facts JSON followed by the question.
- **Same wire format** as `/api/coach` (`delta` / `replace` / `done`), the same monthly cap
  (shared), and usage recorded from the stream events. The live loop is shared
  (`streamGuardedReply` in `src/coach/service.ts`).
- **Chat guardrail** (`checkChatMoves` in `src/coach/guard.ts`): any run of two or more moves must
  be a contiguous run of the step's setup moves followed by its algorithm; a lone move outside the
  step is allowed only in a notation explanation ("D' means ...", "a letter like U2 ..."); a move
  that cannot be parsed always fails. The hint guard is unchanged. A failing answer is replaced,
  before the offending token is shown, by the built-in answer.
- **Built-in answers** (no key, the cap, refusal, cut off, guard): `chatTemplate` classifies the
  question by keywords (why / how to spot it / what a move means / what if I mess up / anything
  else) and answers from the facts and case notes, with a mode notice. They only name moves one
  at a time to explain them, so they always pass the chat guard.
- **Talk instead of type**: optional push-to-talk with the browser's own `SpeechRecognition`
  (`src/voice/speechInput.ts`), off until "Talk to the coach" is on in Settings. Only the
  transcript (text) is sent; see ADR-016.
