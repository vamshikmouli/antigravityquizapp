import { isValidQuestion } from '../shared/utils.js';
import { QUESTION_TYPES } from '../shared/constants.js';

/**
 * Pure (no network) prompt construction + response parsing for AI question
 * generation. Kept separate from the providers so it is easy to unit-test and
 * shared across every provider.
 */

const SUPPORTED_TYPES = new Set(Object.values(QUESTION_TYPES));

const TYPE_HINTS = {
  MULTIPLE_CHOICE: 'exactly 4 distinct "options" and a "correctAnswer" that is one of them',
  BUZZER: 'exactly 4 distinct "options" and a "correctAnswer" that is one of them',
  TRUE_FALSE: 'options ["True","False"] and a "correctAnswer" of either "True" or "False"',
  SHORT_ANSWER: 'an empty "options" array and a concise "correctAnswer" string',
  ORAL_OPEN: 'an empty "options" array and a "correctAnswer" string (the model answer)',
  ORAL_BUZZER: 'an empty "options" array and a "correctAnswer" string (the model answer)'
};

/**
 * Build the { system, user } messages instructing the model to return strict
 * JSON: { "questions": [ { text, options, correctAnswer, category }, ... ] }.
 */
export function buildGenerationPrompt({ topic, count, type, difficulty, context, avoid }) {
  const t = SUPPORTED_TYPES.has(type) ? type : 'MULTIPLE_CHOICE';
  const hint = TYPE_HINTS[t] || TYPE_HINTS.MULTIPLE_CHOICE;

  const system =
    'You are a quiz author. You generate accurate, unambiguous quiz questions and ' +
    'respond with STRICT JSON only — no markdown, no commentary. ' +
    'The JSON shape is: {"questions":[{"text":string,"options":string[],"correctAnswer":string,"category":string}]}.';

  const user =
    `Generate ${count} ${difficulty} difficulty quiz question(s) of type ${t} about: ${topic}.\n` +
    `Each question must have ${hint}.\n` +
    'Keep "text" clear and self-contained. "category" is a short topic label. ' +
    (t === 'BUZZER' || t === 'ORAL_BUZZER'
      ? 'These are buzzer questions: keep them short enough to read in a few seconds, with one crisp answer. '
      : '') +
    (context ? `Context: ${String(context).slice(0, 300)}.\n` : '') +
    (Array.isArray(avoid) && avoid.length
      ? 'Do NOT repeat or closely paraphrase any of these existing questions:\n' +
        avoid.slice(0, 40).map((q) => `- ${String(q).slice(0, 160)}`).join('\n') + '\n'
      : '') +
    'Return ONLY the JSON object described, with exactly a "questions" array.';

  return { system, user };
}

// Pull the first JSON value out of a raw model response (handles ```json fences
// and leading/trailing prose).
export function extractJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  // Strip a ```json ... ``` or ``` ... ``` fence if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // Fall back to the first {...} or [...] block.
    const start = s.search(/[[{]/);
    if (start === -1) return null;
    const open = s[start];
    const close = open === '[' ? ']' : '}';
    const end = s.lastIndexOf(close);
    if (end <= start) return null;
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

// Coerce one raw AI item into our question schema, or return null if unusable.
function normalizeQuestion(item, type) {
  if (!item || typeof item !== 'object') return null;

  const q = {
    text: typeof item.text === 'string' ? item.text.trim() : '',
    type,
    options: Array.isArray(item.options) ? item.options.map((o) => String(o).trim()).filter(Boolean) : [],
    correctAnswer: item.correctAnswer != null ? String(item.correctAnswer).trim() : '',
    points: clampInt(item.points, 100, 0, 100000),
    negativePoints: clampInt(item.negativePoints, 25, 0, 100000),
    timeLimit: clampInt(item.timeLimit, 30, 5, 3600),
    readingTime: clampInt(item.readingTime, 0, 0, 600),
    round: clampInt(item.round, 1, 1, 1000),
    category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : 'General',
    optionImages: []
  };

  if (type === 'TRUE_FALSE') {
    q.options = ['True', 'False'];
    // Normalize boolean-ish answers.
    const a = q.correctAnswer.toLowerCase();
    q.correctAnswer = a === 'true' || a === 't' || a === 'yes' ? 'True' : 'False';
  }

  return q;
}

/**
 * Parse a raw provider response into an array of valid, normalized questions.
 *
 * @param {string} raw   The raw text the provider returned.
 * @param {object} opts
 * @param {string} opts.type   The requested question type.
 * @param {number} opts.count  Max number of questions to return.
 * @returns {Array} valid questions (may be empty)
 */
export function parseGeneratedQuestions(raw, { type = 'MULTIPLE_CHOICE', count = 5 } = {}) {
  const t = SUPPORTED_TYPES.has(type) ? type : 'MULTIPLE_CHOICE';
  const parsed = extractJson(raw);
  if (!parsed) return [];

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.questions)
      ? parsed.questions
      : Array.isArray(parsed.data)
        ? parsed.data
        : null;
  if (!list) return [];

  const out = [];
  for (const item of list) {
    const q = normalizeQuestion(item, t);
    if (q && isValidQuestion(q)) out.push(q);
    if (out.length >= count) break;
  }
  return out;
}
