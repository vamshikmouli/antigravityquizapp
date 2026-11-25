# AI Question Generation

Teachers can generate quiz questions with an LLM, **review** them, and save the
ones they want into a quiz. Questions are never saved until the teacher confirms.

Providers are **pluggable**: Gemini and Groq ship today, and others slot in by
adding one entry to the registry — the controller, prompt, parsing and UI are all
provider-agnostic.

## Configuration

Set at least one provider's API key. The feature is enabled automatically when a
key is present (the UI shows the "✨ Generate with AI" option; otherwise it
explains that no provider is configured).

| Env var          | Purpose                                                        |
|------------------|----------------------------------------------------------------|
| `GROQ_API_KEY`   | Enables Groq. Key from https://console.groq.com                |
| `GROQ_MODEL`     | Optional. Default `llama-3.3-70b-versatile`.                    |
| `GEMINI_API_KEY` | Enables Gemini. Key from https://aistudio.google.com/app/apikey |
| `GEMINI_MODEL`   | Optional. Default `gemini-flash-latest`.                       |
| `AI_PROVIDER`    | Optional default provider (`groq` \| `gemini`) when several are set. |

No SDKs are required — providers are called over HTTPS with the built-in `fetch`.

## Endpoints (both require auth)

### `GET /api/ai/providers`
```json
{ "providers": [ { "id": "groq", "label": "Groq" } ], "default": "groq" }
```
Empty `providers` ⇒ feature disabled.

### `POST /api/questions/generate`
```json
{ "topic": "Photosynthesis", "count": 5, "type": "MULTIPLE_CHOICE", "difficulty": "medium", "provider": "groq" }
```
- `type` ∈ `MULTIPLE_CHOICE | TRUE_FALSE | BUZZER | SHORT_ANSWER | ORAL_BUZZER | ORAL_OPEN`
- `count` 1–20 (clamped); `provider` optional (defaults to `AI_PROVIDER` / first configured).

**200** → `{ "provider": "groq", "questions": [ { text, type, options, correctAnswer, points, negativePoints, timeLimit, round, category } ] }`
— **drafts only, not saved.** The response is validated and normalized; malformed
items the model returns are dropped.

**Errors:** `400` (no topic) · `503` (no provider configured) · `502` (provider
request failed — bad key / network) · `422` (model returned nothing usable) · `500`.

## Plan a whole quiz from one prompt

**⋮ → Generate with AI → 🧠 Plan whole quiz** (the default tab). The teacher writes
one request in plain words, for example:

> Science quiz for class 8 with 3 rounds: 5 MCQs on physics (20 s, 10 points), a
> buzzer round on chemistry with 4 questions (3 s reading time, +20 / −10), and 6
> true/false on biology.

1. **Understand**: `POST /api/ai/plan` turns the request into a plan. Each round
   gets a name, topic, type, count, difficulty, time limit, reading time, points
   and negative points. The AI follows everything the teacher stated and fills in
   the rest from per-type defaults. It lists what it decided on its own under
   "The AI decided".
2. **Review the plan**: every round's settings are editable. Rounds can be added
   or removed, and you can set the first round number. It defaults to the round
   after the last one already in the quiz.
3. **Generate**: each round calls `POST /api/questions/generate` in turn, which
   is easy on free-tier rate limits. The round's settings are applied to every
   question, and earlier questions are passed along so they are not repeated. A
   round that fails can be retried on its own.
4. **Review and save** the questions by round. They are saved in round order.

Defaults when the prompt doesn't say (`TYPE_DEFAULTS` in `controllers/aiQuizPlan.js`):

| Type | Time | Reading | Points | Negative |
|---|---|---|---|---|
| MULTIPLE_CHOICE | 30 s | 0 | 100 | 0 |
| TRUE_FALSE | 15 s | 0 | 50 | 0 |
| SHORT_ANSWER | 45 s | 0 | 100 | 0 |
| BUZZER | 15 s | 5 s | 100 | 50 |
| ORAL_BUZZER | 20 s | 5 s | 100 | 50 |
| ORAL_OPEN | 60 s | 0 | 100 | 0 |

Limits: 10 rounds, 20 questions per round, 60 questions in total, time 5–600 s,
reading 0–60 s. The server clamps every value, so an unusual model reply can't
produce an unplayable quiz.

### `POST /api/ai/plan`
```json
{ "prompt": "3 rounds of space trivia for grade 6, -5 for wrong answers", "provider": "groq" }
```
**200** → `{ "provider", "plan": { title, topic, audience, totalQuestions, assumptions[], warnings[],
rounds: [ { round, name, topic, type, count, difficulty, timeLimit, readingTime, points, negativePoints } ] } }`

`/api/questions/generate` also accepts `context`, `avoid` (texts not to repeat) and
`settings: { round, timeLimit, readingTime, points, negativePoints }`.

**Errors (both):**
- `429`: the provider is rate-limiting.
- `503`: the provider is busy or timed out. Try again or switch provider.
- `502`, `422`: as above.

## How saving works

The TV Questions page → **⋮ → Generate with AI** opens a modal: enter a topic,
count, type and difficulty (and provider if several are configured), click
**Generate**, review the drafts (tick the ones to keep), then **Save selected**.
Saving posts the chosen drafts to `POST /api/questions/import-json`, which stamps
ownership + tenant (Phase 2) and attaches them to the current quiz. Teachers can
then edit any saved question with the normal editor.

## Extending with another provider

Add an entry to `PROVIDERS` in `controllers/aiProviders.js`:
```js
myprovider: {
  id: 'myprovider', label: 'My Provider',
  keyEnv: 'MYPROVIDER_API_KEY', modelEnv: 'MYPROVIDER_MODEL', defaultModel: '…',
  configured: (env) => Boolean(env.MYPROVIDER_API_KEY),
  async complete({ system, user, model, env }) { /* call API, return raw text */ }
}
```
Nothing else changes — selection, config listing, prompt and parsing are shared.
