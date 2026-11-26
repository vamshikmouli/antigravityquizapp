import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

// LIVE: a quiz planned for more groups, played by only 2.
//  - directed rounds give each group the same number of turns (leftovers skipped)
//  - elimination never leaves fewer than 2 groups
//  - the host can fix marks (result + points) for played questions
// Skips when the dev Postgres from .env is unreachable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3994;
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = 'groups-marks-test-secret';
const prisma = new PrismaClient();
let ready = false;
let srv = null;
const made = { userId: null, quizId: null, sessionId: null, code: null, q: [] };
const sockets = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const next = (s, ev, ms = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms);
  s.once(ev, (d) => { clearTimeout(t); res(d); });
});
function join(payload) {
  return new Promise((resolve, reject) => {
    const s = ioClient(BASE, { transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('latency-ping', (ack) => ack && ack());
    s.on('connect', () => s.emit('join-session', payload));
    s.once('session-joined', (data) => resolve({ s, data }));
    s.once('error', (e) => reject(new Error(e?.message)));
    setTimeout(() => reject(new Error('join timeout')), 6000);
  });
}
const ask = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));

before(async () => {
  try {
    await prisma.$connect();
    srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), JWT_SECRET }, stdio: ['ignore', 'ignore', 'inherit'] });
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await sleep(250); }
    const user = await prisma.user.create({ data: { email: `gm-${Date.now()}@gmtest.local`, authProvider: 'EMAIL' } });
    made.userId = user.id;
    // Planned like a 5-group quiz: eliminations after rounds 1 and 2.
    const quiz = await prisma.quiz.create({ data: { title: 'Groups and marks', ownerId: user.id, mode: 'TEAMS', roundSettings: [
      { round: 1, name: 'General', format: 'DIRECTED', passOnWrong: false, eliminate: 1 },
      { round: 2, name: 'Rapid fire', format: 'DIRECTED', passOnWrong: false, eliminate: 1 }
    ] } });
    made.quizId = quiz.id;
    const base = Date.now();
    const rows = [
      ...[1, 2, 3, 4, 5].map((n) => ({ round: 1, text: `R1 Q${n}` })),
      ...[1, 2].map((n) => ({ round: 2, text: `R2 Q${n}` }))
    ];
    for (const [i, r] of rows.entries()) {
      made.q.push(await prisma.question.create({ data: { ownerId: user.id, quizId: quiz.id, type: 'MULTIPLE_CHOICE', options: ['a', 'b'], correctAnswer: 'a', points: 10, negativePoints: 5, timeLimit: 60, readingTime: 0, optionImages: [], createdAt: new Date(base + i), ...r } }));
    }
    made.code = 'GMK-' + Math.floor(100 + Math.random() * 900);
    const session = await prisma.session.create({ data: { code: made.code, hostId: user.id, quizId: quiz.id, questions: { create: made.q.map((q, i) => ({ questionId: q.id, order: i })) } } });
    made.sessionId = session.id;
    ready = true;
  } catch (e) {
    console.error('[groups-marks-live] setup skipped:', e.message);
  }
});

after(async () => {
  for (const s of sockets) s.close();
  try {
    if (made.sessionId) {
      await prisma.answer.deleteMany({ where: { participant: { sessionId: made.sessionId } } });
      await prisma.participant.deleteMany({ where: { sessionId: made.sessionId } });
      await prisma.session.deleteMany({ where: { id: made.sessionId } });
    }
    if (made.quizId) { await prisma.question.deleteMany({ where: { quizId: made.quizId } }); await prisma.quiz.deleteMany({ where: { id: made.quizId } }); }
    if (made.userId) await prisma.user.deleteMany({ where: { id: made.userId } });
  } catch {}
  await prisma.$disconnect();
  if (srv) srv.kill();
  await sleep(200);
});

test('2 groups in a quiz planned for more: even turns, no elimination, host fixes marks', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const token = jwt.sign({ id: made.userId, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
  const { s: host } = await join({ code: made.code, role: 'host', token });
  const A = await join({ code: made.code, name: 'Alpha', role: 'student' });
  const B = await join({ code: made.code, name: 'Bravo', role: 'student' });
  const aId = A.data.participant.id, bId = B.data.participant.id;
  const started = next(A.s, 'start-quiz'); host.emit('start-quiz'); await started;

  // Round 1 has 5 questions; with 2 groups only 4 are played (2 each).
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const qs = next(host, 'question-started'); host.emit('next-question'); const q = (await qs).question;
    assert.equal(q.roundPlan.groups, 2);
    assert.equal(q.roundPlan.perGroup, 2);
    assert.equal(q.roundPlan.playing, 4);
    seen.push([q.text, q.turn.name]);
    const turnSocket = q.turn.participantId === aId ? A.s : B.s;
    const res = next(host, 'show-results');
    // Alpha answers its first question wrong (to be fixed later); the rest right.
    turnSocket.emit('submit-answer', { questionId: q.id, answer: i === 0 ? 'b' : 'a' });
    await res;
  }
  assert.deepEqual(seen, [['R1 Q1', 'Alpha'], ['R1 Q2', 'Bravo'], ['R1 Q3', 'Alpha'], ['R1 Q4', 'Bravo']]);

  // Next: R1 Q5 is skipped, round 1 ends. Eliminating 1 of 2 would leave 1, so it is skipped.
  const ended = next(host, 'round-ended'); host.emit('next-question'); const r1 = await ended;
  assert.equal(r1.round, 1);
  assert.equal(r1.elimination, null);
  assert.deepEqual(r1.eliminationSkipped, { requested: 1, groupsLeft: 2 });
  const alphaRow = () => r1.summary.rows.find((r) => r.id === aId);
  assert.equal(alphaRow().roundPoints, 5); // -5 + 10

  // ---- Fix marks ----
  const marks = await ask(host, 'get-marks', { questionId: made.q[0].id });
  assert.equal(marks.questions.length, 4); // played: Q1-Q4 (Q5 skipped, never shown)
  const aMark = marks.rows.find((r) => r.participantId === aId);
  assert.deepEqual([aMark.answered, aMark.isCorrect, aMark.points], [true, false, -5]);

  // Students cannot fix marks.
  const denied = next(A.s, 'error'); A.s.emit('correct-mark', { questionId: made.q[0].id, participantId: aId, isCorrect: true, points: 10 });
  assert.match((await denied).message, /only the host/i);
  const studentGet = await ask(A.s, 'get-marks', {});
  assert.match(studentGet.error, /only the host/i);

  // A question that was never played (the skipped R1 Q5) cannot be marked.
  const notPlayed = next(host, 'error'); host.emit('correct-mark', { questionId: made.q[4].id, participantId: aId, isCorrect: true, points: 10 });
  assert.match((await notPlayed).message, /not been played/i);

  // Host changes Alpha's Q1 from wrong (-5) to correct (+10): +15 on the total.
  const corrected = next(B.s, 'marks-corrected');
  const summary = next(host, 'round-summary-updated');
  host.emit('correct-mark', { questionId: made.q[0].id, participantId: aId, isCorrect: true, points: 10 });
  const c = await corrected;
  assert.deepEqual([c.participantId, c.isCorrect, c.points, c.delta], [aId, true, 10, 15]);
  assert.deepEqual(c.correctNames, ['Alpha']);
  const s1 = await summary;
  assert.equal(s1.summary.rows.find((r) => r.id === aId).roundPoints, 20);
  assert.equal((await prisma.participant.findUnique({ where: { id: aId } })).score, 20);

  // Host can also give marks to a group that had no answer (Bravo on Q1).
  host.emit('correct-mark', { questionId: made.q[0].id, participantId: bId, isCorrect: true, points: 3 });
  await next(host, 'marks-corrected');
  assert.equal((await prisma.participant.findUnique({ where: { id: bId } })).score, 23);

  // ---- Round 2: still 2 groups, 2 questions -> 1 each ----
  let qs = next(host, 'question-started'); host.emit('next-question', { force: true }); let q = (await qs).question;
  assert.equal(q.text, 'R2 Q1');
  assert.equal(q.roundPlan.perGroup, 1);
  // Before the answer is shown, the host cannot add a mark for a group with none on this question.
  const early = next(host, 'error');
  host.emit('correct-mark', { questionId: q.id, participantId: bId, isCorrect: true, points: 10 });
  assert.match((await early).message, /show the answer first/i);
});
