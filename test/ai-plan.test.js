import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanPrompt, parsePlan, normalizeType, applyRoundSettings, TYPE_DEFAULTS, LIMITS } from '../controllers/aiQuizPlan.js';
import { buildGenerationPrompt } from '../controllers/aiQuestions.js';

// DB-free, network-free tests for "understand the teacher's prompt -> quiz plan".

test('buildPlanPrompt embeds the request, types, units and negative-mark rule', () => {
  const { system, user } = buildPlanPrompt({ prompt: '3 rounds of space trivia, -5 for wrong' });
  assert.match(system, /STRICT JSON/);
  assert.match(user, /3 rounds of space trivia/);
  for (const t of Object.keys(TYPE_DEFAULTS)) assert.match(user, new RegExp(t));
  assert.match(user, /SECONDS/);
  assert.match(user, /POSITIVE number deducted/);
});

test('normalizeType maps teacher words to question types', () => {
  assert.equal(normalizeType('MCQ'), 'MULTIPLE_CHOICE');
  assert.equal(normalizeType('multiple choice'), 'MULTIPLE_CHOICE');
  assert.equal(normalizeType('True/False'), 'TRUE_FALSE');
  assert.equal(normalizeType('rapid fire'), 'BUZZER');
  assert.equal(normalizeType('oral buzzer'), 'ORAL_BUZZER');
  assert.equal(normalizeType('viva'), 'ORAL_OPEN');
  assert.equal(normalizeType('fill in the blank'), 'SHORT_ANSWER');
  assert.equal(normalizeType('short-answer'), 'SHORT_ANSWER');
  assert.equal(normalizeType('ORAL_BUZZER'), 'ORAL_BUZZER');
  assert.equal(normalizeType('???'), 'MULTIPLE_CHOICE');
});

test('parsePlan keeps explicit values and fills per-type defaults', () => {
  const raw = JSON.stringify({
    title: 'Science', topic: 'Science', audience: 'Class 8',
    rounds: [
      { name: 'Physics', topic: 'Physics', type: 'MULTIPLE_CHOICE', count: 5, difficulty: 'easy', timeLimit: 20, readingTime: 0, points: 10, negativePoints: 0 },
      { name: 'Chem', topic: 'Chemistry', type: 'buzzer', count: '4', timeLimit: '15 seconds', readingTime: 3, points: 20, negativePoints: -10 },
      { name: 'Bio', type: 'true/false' }
    ],
    assumptions: ['Round 3 has 5 questions', 42]
  });
  const plan = parsePlan(raw);
  assert.equal(plan.rounds.length, 3);
  const [r1, r2, r3] = plan.rounds;
  assert.deepEqual([r1.type, r1.count, r1.timeLimit, r1.points, r1.negativePoints, r1.difficulty], ['MULTIPLE_CHOICE', 5, 20, 10, 0, 'easy']);
  assert.deepEqual([r2.type, r2.count, r2.timeLimit, r2.readingTime, r2.points, r2.negativePoints], ['BUZZER', 4, 15, 3, 20, 10]);
  assert.equal(r3.type, 'TRUE_FALSE');
  assert.equal(r3.count, 5);
  assert.equal(r3.timeLimit, TYPE_DEFAULTS.TRUE_FALSE.timeLimit);
  assert.equal(r3.points, TYPE_DEFAULTS.TRUE_FALSE.points);
  assert.equal(r3.topic, 'Science'); // falls back to quiz topic
  assert.equal(r3.difficulty, 'medium');
  assert.deepEqual(plan.rounds.map((r) => r.round), [1, 2, 3]);
  assert.equal(plan.totalQuestions, 14);
  assert.deepEqual(plan.assumptions, ['Round 3 has 5 questions']);
});

test('parsePlan clamps out-of-range values and caps totals with warnings', () => {
  const rounds = Array.from({ length: 12 }, () => ({ type: 'MCQ', count: 50, timeLimit: 1, readingTime: 999, points: 1e9 }));
  const plan = parsePlan(JSON.stringify({ rounds }));
  assert.ok(plan.rounds.length <= LIMITS.MAX_ROUNDS);
  assert.ok(plan.totalQuestions <= LIMITS.MAX_TOTAL);
  assert.equal(plan.rounds[0].count, LIMITS.MAX_PER_ROUND);
  assert.equal(plan.rounds[0].timeLimit, LIMITS.TIME_MIN);
  assert.equal(plan.rounds[0].readingTime, LIMITS.READING_MAX);
  assert.equal(plan.rounds[0].points, LIMITS.POINTS_MAX);
  assert.ok(plan.warnings.length > 0);
});

test('parsePlan handles fenced output and rejects garbage', () => {
  const fenced = '```json\n{"rounds":[{"type":"MULTIPLE_CHOICE","count":2}]}\n```';
  assert.equal(parsePlan(fenced).rounds[0].count, 2);
  assert.equal(parsePlan('not json'), null);
  assert.equal(parsePlan('{"rounds":[]}'), null);
  assert.equal(parsePlan(''), null);
});

test('applyRoundSettings makes the plan the source of truth for scoring/timing', () => {
  const qs = [{ text: 'Q', type: 'BUZZER', points: 100, negativePoints: 25, timeLimit: 30, readingTime: 0, round: 1 }];
  const [q] = applyRoundSettings(qs, { round: 3, timeLimit: 12, readingTime: 4, points: 20, negativePoints: -10 });
  assert.deepEqual([q.round, q.timeLimit, q.readingTime, q.points, q.negativePoints], [3, 12, 4, 20, 10]);
  const [same] = applyRoundSettings(qs, {});
  assert.deepEqual(same, qs[0]);
});

test('buildGenerationPrompt adds round context and an avoid list', () => {
  const { user } = buildGenerationPrompt({
    topic: 'Chemistry', count: 4, type: 'BUZZER', difficulty: 'medium',
    context: 'Quiz "Science", round "Chem Blitz"', avoid: ['What is H2O?']
  });
  assert.match(user, /Chem Blitz/);
  assert.match(user, /Do NOT repeat/);
  assert.match(user, /What is H2O\?/);
  assert.match(user, /buzzer questions/);
});

test('parsePlan allows up to 30 questions in a round (generated in batches)', () => {
  const plan = parsePlan(JSON.stringify({ rounds: [{ type: 'MCQ', count: 25 }, { type: 'MCQ', count: 40 }] }));
  assert.equal(LIMITS.MAX_PER_ROUND, 30);
  assert.equal(plan.rounds[0].count, 25);           // kept, no warning
  assert.equal(plan.rounds[1].count, 30);           // capped
  assert.ok(plan.warnings.some((w) => /Round 2: limited to 30/.test(w)));
  assert.ok(!plan.warnings.some((w) => /Round 1:/.test(w)));
});
