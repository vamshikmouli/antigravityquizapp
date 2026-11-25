import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

// LIVE regression tests for bugs found by the end-to-end run on production:
// typed answers ignore case; only the buzz winner may answer; blank names,
// seat take-over by participant id, late join via a fake id and joining an
// ended quiz are refused; invalid questions are a 400; questions can only be
// added to your own quiz. Skips when the dev Postgres from .env is unreachable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3993;
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = 'hardening-test-secret';
const prisma = new PrismaClient();
let ready = false;
let srv = null;
const made = { users: [], quizIds: [], sessionId: null, code: null, token: null, otherToken: null, otherQuiz: null };
const sockets = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const next = (s, ev, ms = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms);
  s.once(ev, (d) => { clearTimeout(t); res(d); });
});
const maybe = (s, ev, ms = 2500) => new Promise((res) => {
  const t = setTimeout(() => res(null), ms);
  s.once(ev, (d) => { clearTimeout(t); res(d); });
});
function join(payload) {
  return new Promise((resolve) => {
    const s = ioClient(BASE, { transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('latency-ping', (ack) => ack && ack());
    s.on('buzzer-activated', (_d, ack) => ack && ack());
    s.on('connect', () => s.emit('join-session', payload));
    s.once('session-joined', (data) => resolve({ s, data }));
    s.once('error', (e) => resolve({ s, error: e?.message }));
  });
}
const api = (method, url, token, body) => fetch(BASE + url, {
  method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined
});

before(async () => {
  try {
    await prisma.$connect();
    srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), JWT_SECRET }, stdio: ['ignore', 'ignore', 'inherit'] });
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await sleep(250); }
    const u1 = await prisma.user.create({ data: { email: `hard-${Date.now()}@hardtest.local`, authProvider: 'EMAIL' } });
    const u2 = await prisma.user.create({ data: { email: `hard2-${Date.now()}@hardtest.local`, authProvider: 'EMAIL' } });
    made.users.push(u1.id, u2.id);
    made.token = jwt.sign({ id: u1.id, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
    made.otherToken = jwt.sign({ id: u2.id, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
    const quiz = await prisma.quiz.create({ data: { title: 'Hardening', ownerId: u1.id } });
    const other = await prisma.quiz.create({ data: { title: 'Someone else', ownerId: u2.id } });
    made.quizIds.push(quiz.id, other.id);
    made.otherQuiz = other.id;
    const base = Date.now();
    const qs = [];
    for (const [i, d] of [
      { type: 'SHORT_ANSWER', text: 'Capital of Karnataka?', options: [], correctAnswer: 'Bengaluru', round: 1 },
      { type: 'BUZZER', text: 'Largest planet?', options: ['Mars', 'Jupiter', 'Venus', 'Earth'], correctAnswer: 'Jupiter', round: 1, readingTime: 0 }
    ].entries()) {
      qs.push(await prisma.question.create({ data: { ownerId: u1.id, quizId: quiz.id, optionImages: [], points: 10, negativePoints: 0, timeLimit: 30, createdAt: new Date(base + i), ...d } }));
    }
    made.code = 'HRD-' + Math.floor(100 + Math.random() * 900);
    const session = await prisma.session.create({ data: { code: made.code, hostId: u1.id, quizId: quiz.id, questions: { create: qs.map((q, i) => ({ questionId: q.id, order: i })) } } });
    made.sessionId = session.id;
    ready = true;
  } catch (e) {
    console.error('[hardening-live] setup skipped:', e.message);
  }
});

after(async () => {
  for (const s of sockets) s.close();
  try {
    await prisma.answer.deleteMany({ where: { participant: { sessionId: made.sessionId } } });
    await prisma.participant.deleteMany({ where: { sessionId: made.sessionId } });
    await prisma.session.deleteMany({ where: { id: made.sessionId } });
    await prisma.question.deleteMany({ where: { quizId: { in: made.quizIds } } });
    await prisma.quiz.deleteMany({ where: { id: { in: made.quizIds } } });
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  } catch {}
  await prisma.$disconnect();
  if (srv) srv.kill();
  await sleep(200);
});

test('question API: 400 for invalid, 404 for someone else\'s quiz', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const bad = await api('POST', '/api/questions', made.token, { type: 'MULTIPLE_CHOICE', text: 'x', options: ['a', 'b'], correctAnswer: 'z', points: 10, negativePoints: 0, timeLimit: 20 });
  assert.equal(bad.status, 400);
  const foreign = await api('POST', '/api/questions', made.token, { quizId: made.otherQuiz, type: 'TRUE_FALSE', text: 'x', options: ['True', 'False'], correctAnswer: 'True', points: 10, negativePoints: 0, timeLimit: 20, optionImages: [] });
  assert.equal(foreign.status, 404);
  const foreignJson = await api('POST', '/api/questions/import-json', made.token, { questions: [{ quizId: made.otherQuiz, type: 'TRUE_FALSE', text: 'x', options: ['True', 'False'], correctAnswer: 'True', points: 10, negativePoints: 0, timeLimit: 20, optionImages: [] }] });
  assert.equal(foreignJson.status, 404);
  assert.equal(await prisma.question.count({ where: { quizId: made.otherQuiz } }), 0);
});

test('joining: blank names, seat take-over, fake-id late join, ended quiz', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const blank = await join({ code: made.code, name: '   ', role: 'student' });
  assert.match(blank.error || '', /name/i);

  const A = await join({ code: made.code, name: 'Asha', role: 'student' });
  const B = await join({ code: made.code, name: 'Bala', role: 'student' });
  assert.ok(A.data.participant.rejoinToken);

  // Taking over Bala's seat with only her id does not work: it's treated as a new join.
  const thief = await join({ code: made.code, name: 'Thief', role: 'student', participantId: B.data.participant.id });
  assert.notEqual(thief.data?.participant?.id, B.data.participant.id);
  // A forged token for another participant is rejected too.
  const forged = jwt.sign({ pid: B.data.participant.id, sid: made.sessionId }, 'wrong-secret');
  const thief2 = await join({ code: made.code, name: 'Thief2', role: 'student', participantId: B.data.participant.id, rejoinToken: forged });
  assert.notEqual(thief2.data?.participant?.id, B.data.participant.id);

  const { s: host } = await join({ code: made.code, role: 'host', token: made.token });
  const started = next(A.s, 'start-quiz');
  host.emit('start-quiz');
  await started;
  const qs = next(host, 'question-started');
  host.emit('next-question');
  const q1 = (await qs).question;

  // Late join with a bogus participant id is still a late join.
  const late = await join({ code: made.code, name: 'Late', role: 'student', participantId: '00000000-0000-0000-0000-000000000000' });
  assert.match(late.error || '', /already started/i);

  // Real rejoin (phone refresh) with the token keeps the seat and the question.
  A.s.close();
  const A2 = await join({ code: made.code, name: 'Asha', role: 'student', participantId: A.data.participant.id, rejoinToken: A.data.participant.rejoinToken });
  assert.equal(A2.data.participant.id, A.data.participant.id);
  assert.equal(A2.data.currentGameState.question.id, q1.id);

  // Typed answers ignore case/spacing.
  const ans = next(B.s, 'answer-received');
  B.s.emit('submit-answer', { questionId: q1.id, answer: '  bengaluru ' });
  assert.equal((await ans).isCorrect, true);

  // Buzzer question: nobody but the buzz winner can answer.
  const q2p = next(host, 'question-started');
  host.emit('next-question');
  const q2 = (await q2p).question;
  const early = next(B.s, 'error');
  B.s.emit('submit-answer', { questionId: q2.id, answer: 'Jupiter' });
  assert.match((await early).message, /buzzed first/i);
  const opened = await next(A2.s, 'buzzer-activated', 8000);
  const won = next(host, 'buzzer-winner');
  A2.s.emit('buzzer-press', { questionId: q2.id, roundId: opened.roundId, reactionMs: 250 });
  assert.equal((await won).winner.participantId, A.data.participant.id);
  const loser = next(B.s, 'error');
  B.s.emit('submit-answer', { questionId: q2.id, answer: 'Jupiter' });
  assert.match((await loser).message, /buzzed first/i);
  const winAns = next(A2.s, 'answer-received');
  A2.s.emit('submit-answer', { questionId: q2.id, answer: 'Jupiter' });
  assert.equal((await winAns).isCorrect, true);
  const bala = await prisma.participant.findUnique({ where: { id: B.data.participant.id } });
  assert.equal(bala.score, 10); // only the short answer

  // End the quiz; new students can't join a finished quiz.
  const ended = next(host, 'end-quiz', 15000);
  host.emit('end-quiz');
  await ended;
  const afterEnd = await join({ code: made.code, name: 'After', role: 'student' });
  assert.match(afterEnd.error || '', /ended/i);
});
