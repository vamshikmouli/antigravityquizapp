/**
 * Pluggable LLM provider registry for AI question generation.
 *
 * Adding a new provider = add one entry to PROVIDERS with:
 *   - id / label
 *   - keyEnv:   the env var holding its API key
 *   - defaultModel / modelEnv
 *   - configured(env): whether its key is present
 *   - complete({ system, user, model, env }): returns the raw text response
 *
 * Everything else (selection, config listing, the controller, the prompt and
 * the JSON parsing) is provider-agnostic, so Gemini and Groq ship now and other
 * providers slot in without touching the controller.
 *
 * Uses global fetch (Node 18+), so no provider SDKs are required.
 */

const DEFAULT_TIMEOUT_MS = 30000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]); // transient; worth retrying
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postOnce(url, { headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } finally {
    clearTimeout(timer);
  }
}

// POST JSON with a small retry/backoff on transient upstream errors (e.g. a
// provider returning 503 "high demand"). Non-retryable errors (401/404/400)
// fail fast.
async function postJson(url, opts) {
  let last;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await postOnce(url, opts);
    if (r.ok) return JSON.parse(r.text);
    last = new Error(`HTTP ${r.status}: ${r.text.slice(0, 300)}`);
    if (!RETRY_STATUSES.has(r.status) || attempt === MAX_ATTEMPTS) break;
    await sleep(600 * attempt); // 600ms, 1200ms
  }
  throw last;
}

export const PROVIDERS = {
  groq: {
    id: 'groq',
    label: 'Groq',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    configured: (env) => Boolean(env.GROQ_API_KEY),
    async complete({ system, user, model, env }) {
      const data = await postJson('https://api.groq.com/openai/v1/chat/completions', {
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: {
          model: model || env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' }
        }
      });
      return data?.choices?.[0]?.message?.content || '';
    }
  },

  gemini: {
    id: 'gemini',
    label: 'Gemini',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    // 'gemini-flash-latest' is a rolling alias to the current Flash model, so it
    // won't 404 when a dated model (e.g. gemini-2.0-flash) is retired.
    defaultModel: 'gemini-flash-latest',
    configured: (env) => Boolean(env.GEMINI_API_KEY),
    async complete({ system, user, model, env }) {
      const m = model || env.GEMINI_MODEL || 'gemini-flash-latest';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${env.GEMINI_API_KEY}`;
      const data = await postJson(url, {
        body: {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
        }
      });
      return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('') || '';
    }
  }
};

/** Providers whose API key is configured, as [{ id, label }]. */
export function listConfiguredProviders(env = process.env) {
  return Object.values(PROVIDERS)
    .filter((p) => p.configured(env))
    .map((p) => ({ id: p.id, label: p.label }));
}

/** A configured provider by id, or null if unknown / not configured. */
export function getProvider(id, env = process.env) {
  const p = PROVIDERS[id];
  return p && p.configured(env) ? p : null;
}

/** The default provider id: AI_PROVIDER if valid+configured, else the first configured one, else null. */
export function defaultProviderId(env = process.env) {
  if (env.AI_PROVIDER && getProvider(env.AI_PROVIDER, env)) return env.AI_PROVIDER;
  const first = listConfiguredProviders(env)[0];
  return first ? first.id : null;
}
