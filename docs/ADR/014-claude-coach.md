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
- `output_config: { effort: "low" }`, `max_tokens: 400`. No `temperature` / `top_p` / `top_k`
  (the current API rejects them) and no `thinking` field (Haiku 5.5 thinks adaptively by default).
- System prompt: one fixed text (`src/coach/systemPrompt.ts`, about 18,000 characters, roughly
  4,500 tokens) with the curriculum for both methods, stage-by-stage teaching notes, the tone for
  ages 10+, the hint levels and the rules. It is sent as a text block with
  `cache_control: { type: "ephemeral" }`. It contains nothing per request (a test hashes it and
  rejects dates and ids) so the prefix stays cached; it is well above the minimum cacheable size.
- User message: a compact facts JSON (`src/coach/facts.ts`): method, stage, case, hint level,
  grip, setup moves, algorithm, repeat unit, goal / look-for / why text from the engine, up to five
  earlier attempts and an optional diagnosis `{ likelyMistakes: [{ kind, moveIndex?, confidence? }] }`
  that the Phase 5 checkpoint builder fills. No cube state, no images.
- Hint levels: 1 = what to look for, 2 = why it works, 3 = the exact moves.

### 2. Claude never decides moves
- The prompt forbids inventing, changing or reordering moves and asks for words, not single
  letters, when naming sides or shapes.
- `src/coach/guard.ts` extracts every move-notation token (face, wide, slice and rotation turns
  with `'`, `2`, sequences, curly primes) and rejects the reply if any token is not in the step's
  setup, algorithm or repeat unit. Words such as "U-turn", "R&B", "I", "F2L", "L shape",
  "U perm" and the step's own case name are not tokens.
- Text is relayed to the student word by word only after the guard has seen it, so a rejected
  move is normally never displayed. On rejection the reply is replaced by the template.

### 3. Templates and fallbacks
`src/coach/templates.ts` holds deterministic text for every stage (`src/coach/stages.ts`) and
every case in the F2L, 2-look OLL and 2-look PLL tables, plus the engine's own cases, at every
hint level. Templates only quote moves from the facts. They are served:
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
- A guardrail that is strict on purpose: an unusual phrase with a lone capital letter (for
  example "plan B") makes the coach fall back to the template. That is safe, and
  `npm run coach:eval` reports how often it happens.
- Loopback detection by headers can be fooled by a program on the home network that forges
  `Host: localhost`; the token protects spend, not secrets, and Phase 8 moves the phone to the
  pairing QR.
- The beginner's stage ids in `src/coach/stages.ts` follow `docs/tutor/GOAL.md` and must be kept
  in step with the engine when the beginner's method lands (unknown ids still get templates built
  from the plan's facts).
