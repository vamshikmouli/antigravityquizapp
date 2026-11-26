import { QUESTION_TYPES } from '../shared/constants.js';
import { extractJson, cluePointsFrom } from './aiQuestions.js';

/**
 * Pure (no network) "understand the teacher's prompt" step.
 *
 * The teacher writes one free-text request, e.g.
 *   "Science quiz for class 8: 3 rounds. Round 1 is 5 MCQs on physics, 20s each,
 *    10 points. Round 2 buzzer on chemistry, 4 questions, -5 for wrong answers.
 *    Round 3 true/false on biology."
 *
 * The LLM turns that into a structured PLAN (rounds, question type per round,
 * count, difficulty, time limit, reading time, points, negative points). We
 * validate and clamp it here so a bad/odd model reply can never produce an
 * unplayable quiz, and the teacher reviews/edits the plan before any questions
 * are generated.
 */

export const LIMITS = {
  MAX_ROUNDS: 10,
  MAX_PER_ROUND: 30,      // the planner fetches big rounds in batches (see AIQuizPlanner)
  MAX_TOTAL: 60,
  TIME_MIN: 5,
  TIME_MAX: 600,
  READING_MAX: 60,
  POINTS_MAX: 10000
};

/** Sensible defaults per type, used for anything the prompt doesn't specify. */
export const TYPE_DEFAULTS = {
  MULTIPLE_CHOICE: { timeLimit: 30, readingTime: 0, points: 100, negativePoints: 0 },
  TRUE_FALSE: { timeLimit: 15, readingTime: 0, points: 50, negativePoints: 0 },
  SHORT_ANSWER: { timeLimit: 45, readingTime: 0, points: 100, negativePoints: 0 },
  BUZZER: { timeLimit: 15, readingTime: 5, points: 100, negativePoints: 50 },
  ORAL_BUZZER: { timeLimit: 20, readingTime: 5, points: 100, negativePoints: 50 },
  ORAL_OPEN: { timeLimit: 60, readingTime: 0, points: 100, negativePoints: 0 },
  CLUE: { timeLimit: 60, readingTime: 0, points: 30, negativePoints: 5 }
};

const SUPPORTED_TYPES = new Set(Object.values(QUESTION_TYPES));
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

// Words teachers actually use -> our types. Checked in order (first match wins),
// so more specific phrases come first.
const TYPE_SYNONYMS = [
  [/clue|who am i|what am i/i, 'CLUE'],
  [/oral.*buzz|buzz.*oral|spoken.*buzz/i, 'ORAL_BUZZER'],
  [/oral|viva|spoken|verbal|open.?ended.*oral/i, 'ORAL_OPEN'],
  [/buzz|rapid.?fire|fastest.?finger|quick.?fire/i, 'BUZZER'],
  [/true.?(\/|or|-)?.?false|t\/f|yes.?(\/|or).?no/i, 'TRUE_FALSE'],
  [/short|one.?word|fill.?in|blank|written|text.?answer|open/i, 'SHORT_ANSWER'],
  [/mcq|multiple|choice|options?|objective/i, 'MULTIPLE_CHOICE']
];

/** Map whatever the model wrote for a type onto one of our QuestionType values. */
export function normalizeType(value) {
  if (value == null) return 'MULTIPLE_CHOICE';
  const s = String(value).trim();
  const upper = s.toUpperCase().replace(/[\s-]+/g, '_');
  if (SUPPORTED_TYPES.has(upper)) return upper;
  for (const [re, type] of TYPE_SYNONYMS) if (re.test(s)) return type;
  return 'MULTIPLE_CHOICE';
}

function int(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string') {
    const m = v.match(/-?\d+(\.\d+)?/);
    if (m) return Math.round(parseFloat(m[0]));
  }
  return null;
}

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/** Group-competition round formats (see competition.js). */
const ROUND_FORMATS = new Set(['DIRECTED', 'ALL', 'BUZZER', 'CLUE']);
/** Best format for a round of this question type. */
export function defaultFormat(type) {
  if (type === 'CLUE') return 'CLUE';
  if (type === 'BUZZER' || type === 'ORAL_BUZZER') return 'BUZZER';
  return 'DIRECTED';
}

/** Build the { system, user } messages for the planning call. */
export function buildPlanPrompt({ prompt }) {
  const typeList = Object.keys(TYPE_DEFAULTS).join(', ');
  const defaults = Object.entries(TYPE_DEFAULTS)
    .map(([t, d]) => `  ${t}: timeLimit ${d.timeLimit}s, readingTime ${d.readingTime}s, points ${d.points}, negativePoints ${d.negativePoints}`)
    .join('\n');

  const system =
    'You are an expert quiz-master who designs classroom and competition quizzes. ' +
    'You read a teacher\'s request and turn it into a structured quiz PLAN. ' +
    'You respond with STRICT JSON only — no markdown, no commentary.\n' +
    'JSON shape:\n' +
    '{"title":string,"topic":string,"audience":string,"groupMode":boolean,"rounds":[{"round":number,"name":string,' +
    '"topic":string,"type":string,"count":number,"difficulty":"easy"|"medium"|"hard",' +
    '"timeLimit":number,"readingTime":number,"points":number,"negativePoints":number,' +
    '"format":"DIRECTED"|"ALL"|"BUZZER"|"CLUE","passOnWrong":boolean,"eliminate":number}],' +
    '"assumptions":string[]}';

  const user =
    `Teacher's request:\n"""\n${String(prompt).trim()}\n"""\n\n` +
    'Rules:\n' +
    '1. Follow EVERY explicit instruction exactly: the number of rounds, questions per round, ' +
    'question type per round, topics, difficulty, time limit, reading time, points and negative points.\n' +
    `2. "type" must be one of: ${typeList}. Map the teacher's words: MCQ/options -> MULTIPLE_CHOICE; ` +
    'true/false -> TRUE_FALSE; one-word/fill in the blank/written -> SHORT_ANSWER; buzzer/rapid fire/fastest finger -> BUZZER ' +
    '(buzzer with options); oral buzzer/spoken answer after buzzing -> ORAL_BUZZER; oral/viva/discussion/visual (identify the picture) -> ORAL_OPEN; ' +
    'clue round/"who am I"/"what am I" -> CLUE ("points" is the value at the first clue).\n' +
    '3. "timeLimit" and "readingTime" are in SECONDS (convert minutes). "readingTime" is how long the question is shown ' +
    'before answering/buzzing opens. "negativePoints" is a POSITIVE number deducted for a wrong answer ' +
    '("-10 for wrong" means negativePoints 10; "no negative marking" means 0).\n' +
    '4. For anything the teacher did not specify, choose sensible values. Defaults by type:\n' +
    `${defaults}\n` +
    '   Harder rounds may be worth more points. If the number of rounds is not given, design 3 rounds ' +
    'with different types; if the count per round is not given, use 5.\n' +
    `5. At most ${LIMITS.MAX_ROUNDS} rounds, ${LIMITS.MAX_PER_ROUND} questions per round, ${LIMITS.MAX_TOTAL} questions total.\n` +
    '6. Give each round a short engaging "name" and a specific "topic" (the subject its questions are about, ' +
    'including the audience/grade level if mentioned).\n' +
    '7. Default difficulty is "medium" unless the request or audience suggests otherwise.\n' +
    '9. Group competition: set "groupMode" true when the request is a competition between groups/teams. Then for each ' +
    'round set "format": DIRECTED (each question goes to one group in turn; use for normal/subject/visual/rapid-fire rounds), ' +
    'ALL (every group answers every question), BUZZER (groups buzz in; buzzer rounds) or CLUE (clue rounds); ' +
    '"passOnWrong" (a wrong answer passes to the next group; false for rapid fire unless asked); and "eliminate" = how many ' +
    'groups are knocked out at the END of that round (0 if not mentioned).\n' +
    '8. In "assumptions", list at most 6 short sentences about the important choices YOU made that the teacher did not ' +
    'state (e.g. a round count or question count you picked). Skip trivial defaults.\n' +
    'Return ONLY the JSON object.';

  return { system, user };
}

/**
 * Validate + normalize a raw model reply into a playable plan.
 * Returns { title, topic, audience, rounds, assumptions, warnings } or null.
 */
export function parsePlan(raw, { fallbackTopic = '', prompt = '' } = {}) {
  const parsed = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!parsed || typeof parsed !== 'object') return null;
  const list = Array.isArray(parsed.rounds) ? parsed.rounds : Array.isArray(parsed) ? parsed : null;
  if (!list || list.length === 0) return null;

  const warnings = [];
  const topic = typeof parsed.topic === 'string' && parsed.topic.trim() ? parsed.topic.trim() : fallbackTopic;
  const rounds = [];
  let total = 0;

  for (const item of list.slice(0, LIMITS.MAX_ROUNDS)) {
    if (!item || typeof item !== 'object') continue;
    const type = normalizeType(item.type);
    const d = TYPE_DEFAULTS[type];
    const idx = rounds.length + 1;

    let count = int(item.count ?? item.questions ?? item.numQuestions) ?? 5;
    if (count > LIMITS.MAX_PER_ROUND) warnings.push(`Round ${idx}: limited to ${LIMITS.MAX_PER_ROUND} questions.`);
    count = clamp(count, 1, LIMITS.MAX_PER_ROUND);
    if (total + count > LIMITS.MAX_TOTAL) {
      const left = LIMITS.MAX_TOTAL - total;
      if (left <= 0) { warnings.push(`Stopped at ${LIMITS.MAX_TOTAL} questions in total.`); break; }
      warnings.push(`Round ${idx}: reduced to ${left} questions (max ${LIMITS.MAX_TOTAL} in total).`);
      count = left;
    }
    total += count;

    const timeLimit = clamp(int(item.timeLimit) ?? d.timeLimit, LIMITS.TIME_MIN, LIMITS.TIME_MAX);
    const readingTime = clamp(int(item.readingTime) ?? d.readingTime, 0, LIMITS.READING_MAX);
    const points = clamp(int(item.points) ?? d.points, 0, LIMITS.POINTS_MAX);
    // Accept "-10" as well as 10: it is always a deduction.
    const negativePoints = clamp(Math.abs(int(item.negativePoints) ?? d.negativePoints), 0, LIMITS.POINTS_MAX);
    const difficulty = DIFFICULTIES.has(String(item.difficulty).toLowerCase())
      ? String(item.difficulty).toLowerCase()
      : 'medium';

    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : `Round ${idx}`;
    const fmt = String(item.format ?? '').trim().toUpperCase();
    const format = ROUND_FORMATS.has(fmt) ? fmt : defaultFormat(type);
    rounds.push({
      round: idx,
      name,
      format,
      passOnWrong: format === 'DIRECTED' && (typeof item.passOnWrong === 'boolean' ? item.passOnWrong : !/rapid|quick.?fire/i.test(name)),
      eliminate: clamp(int(item.eliminate) ?? 0, 0, 10),
      topic: (typeof item.topic === 'string' && item.topic.trim() ? item.topic.trim() : topic).slice(0, 300),
      type,
      count,
      difficulty,
      timeLimit,
      readingTime,
      points,
      negativePoints
    });
  }

  if (list.length > LIMITS.MAX_ROUNDS) warnings.push(`Limited to ${LIMITS.MAX_ROUNDS} rounds.`);
  if (!rounds.length) return null;

  const strList = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()).slice(0, 15) : []);

  return {
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 120) : 'AI Quiz',
    topic,
    audience: typeof parsed.audience === 'string' ? parsed.audience.trim().slice(0, 120) : '',
    // Group competition if the model says so or the request talks about groups/teams.
    groupMode: parsed.groupMode === true || /\b(groups?|teams?)\b/i.test(String(prompt)),
    rounds,
    totalQuestions: rounds.reduce((s, r) => s + r.count, 0),
    assumptions: strList(parsed.assumptions),
    warnings
  };
}

/**
 * Apply a round's settings to generated questions (the plan is the source of
 * truth for scoring/timing; the model only writes the content).
 */
export function applyRoundSettings(questions, settings = {}) {
  const pick = (k, lo, hi) => {
    const n = int(settings[k]);
    return n == null ? undefined : clamp(Math.abs(n), lo, hi);
  };
  const s = {
    round: pick('round', 1, 1000),
    timeLimit: pick('timeLimit', LIMITS.TIME_MIN, LIMITS.TIME_MAX),
    readingTime: pick('readingTime', 0, LIMITS.READING_MAX),
    points: pick('points', 0, LIMITS.POINTS_MAX),
    negativePoints: pick('negativePoints', 0, LIMITS.POINTS_MAX)
  };
  return questions.map((q) => {
    const out = { ...q };
    for (const [k, v] of Object.entries(s)) if (v !== undefined) out[k] = v;
    // Clue questions: the round's points are the value at the first clue.
    if (out.type === 'CLUE' && s.points !== undefined) out.cluePoints = cluePointsFrom(s.points, (out.clues || []).length || 3);
    if (typeof settings.category === 'string' && settings.category.trim()) out.category = settings.category.trim().slice(0, 80);
    return out;
  });
}
