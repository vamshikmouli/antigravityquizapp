import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGenerationPrompt, parseGeneratedQuestions } from '../controllers/aiQuestions.js';
import { listConfiguredProviders, getProvider, defaultProviderId, PROVIDERS } from '../controllers/aiProviders.js';

// DB-free, network-free unit tests for the AI question-generation layer: prompt
// construction, response parsing/normalization/validation, and provider selection.

test('buildGenerationPrompt includes topic, count and type', () => {
  const { system, user } = buildGenerationPrompt({ topic: 'Photosynthesis', count: 3, type: 'MULTIPLE_CHOICE', difficulty: 'easy' });
  assert.match(system, /JSON/i);
  assert.match(user, /Photosynthesis/);
  assert.match(user, /3/);
  assert.match(user, /MULTIPLE_CHOICE/);
  assert.match(user, /easy/);
});

test('buildGenerationPrompt falls back to MULTIPLE_CHOICE for unknown types', () => {
  const { user } = buildGenerationPrompt({ topic: 'X', count: 1, type: 'NONSENSE', difficulty: 'hard' });
  assert.match(user, /MULTIPLE_CHOICE/);
});

test('parseGeneratedQuestions parses a clean {questions:[...]} object', () => {
  const raw = JSON.stringify({
    questions: [
      { text: 'Capital of France?', options: ['London', 'Paris', 'Berlin', 'Rome'], correctAnswer: 'Paris', category: 'Geo' }
    ]
  });
  const out = parseGeneratedQuestions(raw, { type: 'MULTIPLE_CHOICE', count: 5 });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'MULTIPLE_CHOICE');
  assert.equal(out[0].correctAnswer, 'Paris');
  assert.equal(out[0].points, 100); // defaulted
  assert.equal(out[0].timeLimit, 30);
});

test('parseGeneratedQuestions strips ```json fences', () => {
  const raw = '```json\n{"questions":[{"text":"2+2?","options":["3","4"],"correctAnswer":"4"}]}\n```';
  const out = parseGeneratedQuestions(raw, { type: 'MULTIPLE_CHOICE', count: 5 });
  assert.equal(out.length, 1);
  assert.equal(out[0].correctAnswer, '4');
});

test('parseGeneratedQuestions accepts a bare array too', () => {
  const raw = '[{"text":"Sky color?","options":["Blue","Green"],"correctAnswer":"Blue"}]';
  const out = parseGeneratedQuestions(raw, { type: 'MULTIPLE_CHOICE', count: 5 });
  assert.equal(out.length, 1);
});

test('parseGeneratedQuestions normalizes TRUE_FALSE answers and options', () => {
  const raw = JSON.stringify({ questions: [{ text: 'Earth is flat.', correctAnswer: 'false' }] });
  const out = parseGeneratedQuestions(raw, { type: 'TRUE_FALSE', count: 5 });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].options, ['True', 'False']);
  assert.equal(out[0].correctAnswer, 'False');
});

test('parseGeneratedQuestions drops invalid items (bad answer / too few options)', () => {
  const raw = JSON.stringify({
    questions: [
      { text: 'Good', options: ['A', 'B'], correctAnswer: 'A' },     // valid
      { text: 'Bad answer', options: ['A', 'B'], correctAnswer: 'Z' }, // answer not in options
      { text: 'Too few', options: ['A'], correctAnswer: 'A' },         // < 2 options
      { text: '', options: ['A', 'B'], correctAnswer: 'A' }            // empty text
    ]
  });
  const out = parseGeneratedQuestions(raw, { type: 'MULTIPLE_CHOICE', count: 10 });
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'Good');
});

test('parseGeneratedQuestions caps results at count', () => {
  const questions = Array.from({ length: 8 }, (_, i) => ({ text: `Q${i}`, options: ['A', 'B'], correctAnswer: 'A' }));
  const out = parseGeneratedQuestions(JSON.stringify({ questions }), { type: 'MULTIPLE_CHOICE', count: 3 });
  assert.equal(out.length, 3);
});

test('parseGeneratedQuestions returns [] on garbage', () => {
  assert.deepEqual(parseGeneratedQuestions('not json at all', { type: 'MULTIPLE_CHOICE', count: 5 }), []);
  assert.deepEqual(parseGeneratedQuestions('', { type: 'MULTIPLE_CHOICE', count: 5 }), []);
});

test('provider registry: configured detection + default selection', () => {
  assert.ok(PROVIDERS.groq && PROVIDERS.gemini, 'ships groq + gemini');

  assert.deepEqual(listConfiguredProviders({}), []);
  assert.equal(defaultProviderId({}), null);

  const env = { GROQ_API_KEY: 'k' };
  assert.deepEqual(listConfiguredProviders(env), [{ id: 'groq', label: 'Groq' }]);
  assert.equal(defaultProviderId(env), 'groq');
  assert.ok(getProvider('groq', env));
  assert.equal(getProvider('gemini', env), null); // not configured

  const both = { GROQ_API_KEY: 'k', GEMINI_API_KEY: 'g', AI_PROVIDER: 'gemini' };
  assert.equal(defaultProviderId(both), 'gemini'); // honors AI_PROVIDER
  assert.equal(listConfiguredProviders(both).length, 2);
});
