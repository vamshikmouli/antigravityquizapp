import { getProvider, defaultProviderId, listConfiguredProviders } from './aiProviders.js';
import { buildGenerationPrompt, parseGeneratedQuestions } from './aiQuestions.js';

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

/**
 * POST /api/questions/generate — generate DRAFT questions with an LLM.
 *
 * Body: { topic, count?, type?, difficulty?, provider? }
 *
 * Returns drafts only (NOT saved). The client reviews/edits them and persists
 * the chosen ones through the normal create/import flow, which stamps
 * ownership + tenant.
 */
export async function generateQuestions(req, res) {
  try {
    const { topic, count = 5, type = 'MULTIPLE_CHOICE', difficulty = 'medium', provider } = req.body || {};

    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ error: 'A topic is required' });
    }

    const providerId = provider || defaultProviderId();
    const selected = providerId ? getProvider(providerId) : null;
    if (!selected) {
      return res.status(503).json({
        error: 'No AI provider is configured. Set GROQ_API_KEY or GEMINI_API_KEY on the server.'
      });
    }

    const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
    const { system, user } = buildGenerationPrompt({ topic: String(topic).trim(), count: n, type, difficulty });

    let raw;
    try {
      raw = await selected.complete({ system, user, env: process.env });
    } catch (err) {
      console.error(`AI provider (${providerId}) error:`, err.message);
      return res.status(502).json({ error: 'The AI provider request failed. Check the API key and try again.' });
    }

    const questions = parseGeneratedQuestions(raw, { type, count: n });
    if (questions.length === 0) {
      return res.status(422).json({ error: 'The AI did not return usable questions. Try rephrasing the topic.' });
    }

    res.json({ provider: providerId, questions });
  } catch (error) {
    console.error('AI generate error:', error);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
}
