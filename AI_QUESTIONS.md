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
| `GEMINI_MODEL`   | Optional. Default `gemini-2.0-flash`.                          |
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
