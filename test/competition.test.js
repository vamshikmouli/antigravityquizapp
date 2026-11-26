import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATS, inferFormat, roundConfig, normalizeRoundSettings, answersMatch, directedPoints,
  cluePointsFor, CompetitionState, roundSummary, eliminationCandidates, rankGroups
} from '../controllers/competition.js';
import { calculateRankings } from '../shared/utils.js';

const G = (id, score = 0, extra = {}) => ({ id, name: `Group ${id}`, score, joinedAt: new Date(2026, 0, 1, 0, 0, id.charCodeAt(0)), ...extra });

test('inferFormat / roundConfig defaults', () => {
  assert.equal(inferFormat(['MULTIPLE_CHOICE', 'ORAL_OPEN']), FORMATS.DIRECTED);
  assert.equal(inferFormat(['BUZZER', 'ORAL_BUZZER']), FORMATS.BUZZER);
  assert.equal(inferFormat(['CLUE']), FORMATS.CLUE);
  const c = roundConfig([], 1, ['MULTIPLE_CHOICE']);
  assert.deepEqual([c.format, c.passOnWrong, c.passPercent, c.eliminate], ['DIRECTED', true, 50, 0]);
  const r3 = roundConfig([{ round: 3, format: 'DIRECTED', passOnWrong: false, eliminate: 1, name: 'Rapid fire' }], 3);
  assert.deepEqual([r3.name, r3.passOnWrong, r3.eliminate], ['Rapid fire', false, 1]);
  assert.equal(roundConfig([{ round: 4, format: 'BUZZER', passOnWrong: true }], 4).passOnWrong, false);
});

test('normalizeRoundSettings drops junk and duplicates', () => {
  const out = normalizeRoundSettings([{ round: 2, format: 'CLUE' }, { round: 2 }, { round: 'x' }, { round: 1, format: 'NOPE' }]);
  assert.deepEqual(out.map((r) => [r.round, r.format]), [[1, 'DIRECTED'], [2, 'CLUE']]);
});

test('answersMatch is lenient but not empty', () => {
  assert.ok(answersMatch(' Mitochondria. ', 'mitochondria'));
  assert.ok(answersMatch('ಕುವೆಂಪು', 'ಕುವೆಂಪು'));
  assert.ok(!answersMatch('', ''));
  assert.ok(!answersMatch('Na', 'Ne'));
});

test('directedPoints: full / negative on first try, pass bonus no penalty', () => {
  assert.equal(directedPoints({ attempt: 1, isCorrect: true, points: 10 }), 10);
  assert.equal(directedPoints({ attempt: 1, isCorrect: false, points: 10, negativePoints: 5 }), -5);
  assert.equal(directedPoints({ attempt: 2, isCorrect: true, points: 10, passPercent: 50 }), 5);
  assert.equal(directedPoints({ attempt: 3, isCorrect: false, points: 10, negativePoints: 5 }), 0);
});

test('cluePointsFor uses the list, else decreases evenly', () => {
  assert.equal(cluePointsFor({ clues: ['a', 'b', 'c'], cluePoints: [30, 20, 10] }, 2), 20);
  assert.equal(cluePointsFor({ clues: ['a', 'b', 'c'], cluePoints: [], points: 30 }, 1), 30);
  assert.equal(cluePointsFor({ clues: ['a', 'b', 'c'], cluePoints: [], points: 30 }, 3), 10);
  assert.equal(cluePointsFor({ clues: ['a', 'b', 'c'], cluePoints: [30, 20, 10] }, 9), 10);
});

test('directed rotation starts with the next group each question and passes in order', () => {
  const groups = [G('A'), G('B'), G('C')];
  const cfg = roundConfig([], 1, ['MULTIPLE_CHOICE']);
  const st = new CompetitionState();
  assert.equal(st.startDirected({ id: 'q1' }, groups, cfg).participantId, 'A');
  assert.equal(st.startDirected({ id: 'q2' }, groups, cfg).participantId, 'B');
  const t = st.startDirected({ id: 'q3' }, groups, cfg);
  assert.deepEqual([t.participantId, t.order], ['C', ['Group C', 'Group A', 'Group B']]);
  assert.deepEqual([st.pass().participantId, st.turn().attempt], ['A', 2]);
  assert.equal(st.pass().participantId, 'B');
  assert.equal(st.pass(), null);                // everyone tried
  // A new round restarts the rotation from the first group.
  assert.equal(st.startDirected({ id: 'q4' }, groups, roundConfig([], 2, ['MULTIPLE_CHOICE'])).participantId, 'A');
});

test('no pass when the round disables it', () => {
  const st = new CompetitionState();
  st.startDirected({ id: 'q' }, [G('A'), G('B')], roundConfig([{ round: 3, passOnWrong: false }], 3));
  assert.equal(st.pass(), null);
});

test('clue state reveals up to the number of clues and tracks lock-outs', () => {
  const st = new CompetitionState();
  st.startClue({ id: 'c', clues: ['1', '2', '3'] }, roundConfig([], 5, ['CLUE']));
  assert.equal(st.revealClue().revealed, 2);
  assert.equal(st.revealClue().revealed, 3);
  assert.equal(st.revealClue().revealed, 3);
  st.lockOut('A');
  assert.ok(st.isLockedOut('A'));
  assert.ok(!st.isLockedOut('B'));
});

test('roundSummary: round points, toppers, eliminated last', () => {
  const groups = [
    G('A', 30, { answers: [{ points: 10, question: { round: 1 } }, { points: 20, question: { round: 2 } }] }),
    G('B', 25, { answers: [{ points: 25, question: { round: 2 } }] }),
    G('C', 40, { answers: [{ points: 40, question: { round: 1 } }], eliminatedAt: new Date(), eliminatedRound: 1 })
  ];
  const s = roundSummary(groups, 2);
  assert.deepEqual(s.rows.map((r) => [r.id, r.roundPoints]), [['A', 20], ['B', 25], ['C', 0]]);
  assert.deepEqual(s.toppers, ['B']);
});

test('roundSummary: groups eliminated later still count as toppers of earlier rounds', () => {
  const groups = [
    G('A', 60, { answers: [{ points: 15, question: { round: 1 } }] }),
    G('B', 15, { answers: [{ points: 15, question: { round: 1 } }], eliminatedAt: new Date(), eliminatedRound: 2 }),
    G('C', 9, { answers: [{ points: 9, question: { round: 1 } }], eliminatedAt: new Date(), eliminatedRound: 0 })
  ];
  assert.deepEqual(roundSummary(groups, 1).toppers.sort(), ['A', 'B']);
});

test('eliminationCandidates: lowest total, ties left to the host', () => {
  assert.deepEqual(eliminationCandidates([G('A', 30), G('B', 10), G('C', 20)]).candidates, ['B']);
  const tie = eliminationCandidates([G('A', 30), G('B', 10), G('C', 10)]);
  assert.deepEqual([tie.candidates, tie.tied.sort(), tie.needed], [[], ['B', 'C'], 1]);
  assert.deepEqual(eliminationCandidates([G('A', 1)]).candidates, []); // never knock out the last group
  assert.deepEqual(eliminationCandidates([G('A', 5), G('B', 1, { eliminatedAt: new Date() }), G('C', 3)]).candidates, ['C']);
});

test('rankGroups / calculateRankings put eliminated groups last', () => {
  const r = rankGroups([G('A', 5), G('B', 50, { eliminatedAt: new Date(), eliminatedRound: 2 }), G('C', 9)]);
  assert.deepEqual(r.map((g) => [g.id, g.rank, g.eliminated]), [['C', 1, false], ['A', 2, false], ['B', 3, true]]);
  const c = calculateRankings([G('A', 5), G('B', 50, { eliminatedAt: new Date() }), G('C', 9)]);
  assert.deepEqual(c.map((g) => g.id), ['C', 'A', 'B']);
});

test('playableCount: equal turns for however many groups join', async () => {
  const { playableCount } = await import('../controllers/competition.js');
  assert.equal(playableCount(20, 5), 20); // planned for 5 groups
  assert.equal(playableCount(20, 2), 20); // 10 each
  assert.equal(playableCount(20, 3), 18); // 6 each, 2 left over
  assert.equal(playableCount(8, 3), 6);
  assert.equal(playableCount(8, 5), 5);   // 1 each
  assert.equal(playableCount(3, 5), 3);   // fewer questions than groups: play them all
  assert.equal(playableCount(8, 0), 8);   // nobody joined yet
});

test('eliminationAllowance: never leaves fewer than 2 groups in', async () => {
  const { eliminationAllowance } = await import('../controllers/competition.js');
  assert.equal(eliminationAllowance(5, 1), 1);
  assert.equal(eliminationAllowance(3, 1), 1);
  assert.equal(eliminationAllowance(2, 1), 0); // 2 groups: no elimination
  assert.equal(eliminationAllowance(4, 3), 2);
  assert.equal(eliminationAllowance(1, 1), 0);
  assert.equal(eliminationAllowance(5, 0), 0);
});

test('planDirectedRound: one question per subject for each group', async () => {
  const { planDirectedRound } = await import('../controllers/competition.js');
  const subjects = ['Karnataka', 'Constitution', 'Maths', 'Sports', 'Science'];
  const qs = subjects.flatMap((s) => [1, 2, 3, 4, 5].map((n) => ({ id: `${s}${n}`, category: s })));
  const ids = (g) => [...planDirectedRound(qs, g).ids];

  // 5 groups: everything is played, 5 each (one per subject)
  assert.equal(ids(5).length, 25);
  assert.equal(planDirectedRound(qs, 5).perGroup, 5);
  // 2 groups: first 2 of each subject -> 10 played, 5 each
  assert.deepEqual(ids(2), subjects.flatMap((s) => [`${s}1`, `${s}2`]));
  const p2 = planDirectedRound(qs, 2);
  assert.deepEqual([p2.bySubject, p2.subjects, p2.perGroup, p2.playing, p2.total], [true, 5, 5, 10, 25]);
  // 3 groups: first 3 of each subject
  assert.equal(ids(3).length, 15);
  // subjects are matched case/space-insensitively
  assert.equal(planDirectedRound([{ id: 'a', category: 'Maths' }, { id: 'b', category: ' maths ' }, { id: 'c', category: 'Sports' }], 1).ids.size, 2);
});

test('planDirectedRound: without subjects it falls back to equal turns', async () => {
  const { planDirectedRound } = await import('../controllers/competition.js');
  const plain = [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}`, category: null }));
  assert.deepEqual([...planDirectedRound(plain, 2).ids], ['q1', 'q2', 'q3', 'q4']);
  // one subject only, or some questions missing a subject: not a subject round
  assert.equal(planDirectedRound(plain.map((q) => ({ ...q, category: 'GK' })), 2).bySubject, false);
  assert.equal(planDirectedRound([{ id: 'a', category: 'Maths' }, { id: 'b', category: null }, { id: 'c', category: 'Sports' }], 2).bySubject, false);
});
