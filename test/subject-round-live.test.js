import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

// LIVE: a directed round built as subject blocks (each subject's questions
// together), played by 2 groups. Each group must get exactly one question of
// every subject; the extra questions of each subject are skipped.
// Skips when the dev Postgres from .env is unreachable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3995;
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = 'subject-round-test-secret';
const prisma = new PrismaClient();
let ready = false;
let srv = null;
const made = { userId: null, quizId: null, sessionId: null, code: null };
const sockets = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SUBJECTS = ['Karnataka', 'Constitution', 'Maths'];

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

before(async () => {
  try {
    await prisma.$connect();
    srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), JWT_SECRET }, stdio: ['ignore', 'ignore', 'inherit'] });
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await sleep(250); }
    const user = await prisma.user.create({ data: { email: `sr-${Date.now()}@srtest.local`, authProvider: 'EMAIL' } });
    made.userId = user.id;
    const quiz = await prisma.quiz.create({ data: { title: 'Subject round', ownerId: user.id, mode: 'TEAMS', roundSettings: [
      { round: 1, name: 'Round 1', format: 'DIRECTED', passOnWrong: false },
      { round: 2, name: 'Round 2', format: 'DIRECTED', passOnWrong: false }
    ] } });
    made.quizId = quiz.id;
    const base = Date.now();
    let i = 0;
    const qs = [];
    for (const s of SUBJECTS) {
      for (const n of [1, 2, 3]) {
        qs.push(await prisma.question.create({ data: { ownerId: user.id, quizId: quiz.id, type: 'MULTIPLE_CHOICE', options: ['a', 'b'], correctAnswer: 'a', points: 10, negativePoints: 0, timeLimit: 60, readingTime: 0, optionImages: [], round: 1, category: s, text: `${s} ${n}`, createdAt: new Date(base + i++) } }));
      }
    }
    qs.push(await prisma.question.create({ data: { ownerId: user.id, quizId: quiz.id, type: 'MULTIPLE_CHOICE', options: ['a', 'b'], correctAnswer: 'a', points: 10, negativePoints: 0, timeLimit: 60, readingTime: 0, optionImages: [], round: 2, text: 'Round 2 first', createdAt: new Date(base + i++) } }));
    made.code = 'SUB-' + Math.floor(100 + Math.random() * 900);
    const session = await prisma.session.create({ data: { code: made.code, hostId: user.id, quizId: quiz.id, questions: { create: qs.map((q, k) => ({ questionId: q.id, order: k })) } } });
    made.sessionId = session.id;
    ready = true;
  } catch (e) {
    console.error('[subject-round-live] setup skipped:', e.message);
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

test('subject round with 2 groups: one question per subject for each group', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const token = jwt.sign({ id: made.userId, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
  const { s: host } = await join({ code: made.code, role: 'host', token });
  const A = await join({ code: made.code, name: 'Alpha', role: 'student' });
  const B = await join({ code: made.code, name: 'Bravo', role: 'student' });
  const started = next(A.s, 'start-quiz'); host.emit('start-quiz'); await started;

  const played = [];
  for (let k = 0; k < 6; k++) {
    const qs = next(host, 'question-started'); host.emit('next-question'); const q = (await qs).question;
    if (k === 0) {
      assert.deepEqual([q.roundPlan.bySubject, q.roundPlan.subjects, q.roundPlan.perGroup, q.roundPlan.playing, q.roundPlan.total], [true, 3, 3, 6, 9]);
    }
    played.push(`${q.text} -> ${q.turn.name}`);
    const res = next(host, 'show-results');
    (q.turn.name === 'Alpha' ? A.s : B.s).emit('submit-answer', { questionId: q.id, answer: 'a' });
    await res;
  }
  assert.deepEqual(played, [
    'Karnataka 1 -> Alpha', 'Karnataka 2 -> Bravo',
    'Constitution 1 -> Alpha', 'Constitution 2 -> Bravo',
    'Maths 1 -> Alpha', 'Maths 2 -> Bravo'
  ]);

  // The 3rd question of each subject is skipped; next comes the end of round 1.
  const ended = next(host, 'round-ended'); host.emit('next-question'); const r = await ended;
  assert.equal(r.round, 1);
  const scores = Object.fromEntries((await prisma.participant.findMany({ where: { sessionId: made.sessionId } })).map((p) => [p.name, p.score]));
  assert.deepEqual(scores, { Alpha: 30, Bravo: 30 });
});
