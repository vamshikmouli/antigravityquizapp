import { getProvider, defaultProviderId, listConfiguredProviders } from './aiProviders.js';
import { buildGenerationPrompt, parseGeneratedQuestions, generateInBatches } from './aiQuestions.js';
import { buildPlanPrompt, parsePlan, applyRoundSettings, LIMITS } from './aiQuizPlan.js';

/**
 * GET /api/ai/providers — which AI providers are configured, so the UI can show
 * (or hide) the "Generate with AI" feature and populate a provider picker.
 */
export function listProviders(req, res) {
  res.json({
    providers: listConfiguredProviders(),
    default: defaultProviderId()
  });
}

function pickProvider(provider, res) {
  const providerId = provider || defaultProviderId();
  const selected = providerId ? getProvider(providerId) : null;
  if (!selected) {
    res.status(503).json({
      error: 'No AI provider is configured. Set GROQ_API_KEY or GEMINI_API_KEY on the server.'
    });
    return null;
  }
  return { providerId, selected };
}

// Call the provider; on failure send a helpful error and return null.
async function callProvider({ providerId, selected }, messages, res) {
  try {
    return await selected.complete({ ...messages, env: process.env });
  } catch (err) {
    sendProviderError(providerId, err, res);
    return null;
  }
}

function sendProviderError(providerId, err, res) {
  console.error(`AI provider (${providerId}) error:`, err.message);
  if (err.status === 429) {
    res.status(429).json({ error: 'The AI provider is rate-limiting requests. Wait a few seconds and try again.' });
  } else if (err.status === 503 || err.status === 504) {
    res.status(503).json({ error: 'The AI provider is busy or timed out. Try again, or pick another provider.' });
  } else {
    res.status(502).json({ error: 'The AI provider request failed. Check the API key and try again.' });
  }
}

/**
 * POST /api/ai/plan — understand a free-text request and return a quiz PLAN:
 * rounds, question type per round, count, difficulty, time limit, reading time,
 * points and negative points. Nothing is generated or saved yet; the teacher
 * reviews/edits the plan, then generates each round via /api/questions/generate.
 *
 * Body: { prompt, provider? }
 */
export async function planQuiz(req, res) {
  try {
    const { prompt, provider } = req.body || {};
    const text = typeof prompt === 'string' ? prompt.trim() : '';
    if (!text) return res.status(400).json({ error: 'Describe the quiz you want.' });
    if (text.length > 4000) return res.status(400).json({ error: 'Please keep the description under 4000 characters.' });

    const p = pickProvider(provider, res);
    if (!p) return;

    const raw = await callProvider(p, buildPlanPrompt({ prompt: text }), res);
    if (raw == null) return;

    const plan = parsePlan(raw, { fallbackTopic: text.slice(0, 200), prompt: text });
    if (!plan) {
      return res.status(422).json({ error: 'The AI could not understand that request. Try describing the rounds more plainly.' });
    }
    res.json({ provider: p.providerId, plan });
  } catch (error) {
    console.error('AI plan error:', error);
    res.status(500).json({ error: 'Failed to plan the quiz' });
  }
}

/**
 * POST /api/questions/generate — generate DRAFT questions with an LLM.
 *
 * Body: { topic, count?, type?, difficulty?, provider?, context?, avoid?, settings? }
 *   settings: { round, timeLimit, readingTime, points, negativePoints, category }
 *             applied to every generated question (a plan round's settings).
 *   avoid:    texts of questions already generated, to prevent repeats.
 *
 * Returns drafts only (NOT saved). The client reviews/edits them and persists
 * the chosen ones through the normal create/import flow, which stamps
 * ownership + tenant.
 */
export async function generateQuestions(req, res) {
  try {
    const {
      topic, count = 5, type = 'MULTIPLE_CHOICE', difficulty = 'medium', provider,
      context, avoid, settings
    } = req.body || {};

    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ error: 'A topic is required' });
    }

    const p = pickProvider(provider, res);
    if (!p) return;

    // Up to a full plan round (30). Models return short lists for big asks, so
    // generateInBatches asks at most 15 at a time and tops up any shortfall.
    const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), LIMITS.MAX_PER_ROUND);
    const baseContext = typeof context === 'string' ? context : '';
    let questions;
    try {
      questions = await generateInBatches({
        total: n,
        avoid: Array.isArray(avoid) ? avoid.filter((a) => typeof a === 'string') : [],
        ask: async (want, part, avoidList) => {
          const messages = buildGenerationPrompt({
            topic: String(topic).trim().slice(0, 300),
            count: want,
            type,
            difficulty,
            context: [baseContext, part].filter(Boolean).join('; ') || undefined,
            avoid: avoidList
          });
          const raw = await p.selected.complete({ ...messages, env: process.env });
          return parseGeneratedQuestions(raw, { type, count: want });
        }
      });
    } catch (err) {
      return sendProviderError(p.providerId, err, res);
    }
    if (questions.length === 0) {
      return res.status(422).json({ error: 'The AI did not return usable questions. Try rephrasing the topic.' });
    }
    if (settings && typeof settings === 'object') questions = applyRoundSettings(questions, settings);

    res.json({ provider: p.providerId, questions });
  } catch (error) {
    console.error('AI generate error:', error);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
}
