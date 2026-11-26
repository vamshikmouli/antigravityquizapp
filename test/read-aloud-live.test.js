import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

// LIVE: read-aloud mode. Questions open without options or clock; the host's
// "Show options" sends them and starts the clock; the host can pause/resume.
// Skips when the dev Postgres from .env is unreachable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3997;
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = 'read-aloud-test-secret';
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
const none = (s, ev, ms = 1500) => new Promise((res) => {
  const h = () => { clearTimeout(t); res(false); };
  const t = setTimeout(() => { s.off(ev, h); res(true); }, ms);
  s.once(ev, h);
});
function join(payload) {
  return new Promise((resolve, reject) => {
    const s = ioClient(BASE, { transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('latency-ping', (ack) => ack && ack());
    s.on('buzzer-activated', (_d, ack) => ack && ack());
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
    const user = await prisma.user.create({ data: { email: `ra-${Date.now()}@ratest.local`, authProvider: 'EMAIL' } });
    made.userId = user.id;
    const quiz = await prisma.quiz.create({ data: { title: 'Read aloud', ownerId: user.id } });
    made.quizId = quiz.id;
    const base = Date.now();
    made.q.push(await prisma.question.create({ data: { ownerId: user.id, quizId: quiz.id, type: 'MULTIPLE_CHOICE', text: 'Capital of Karnataka?', options: ['Mysuru', 'Bengaluru'], correctAnswer: 'Bengaluru', points: 10, negativePoints: 0, timeLimit: 60, readingTime: 5, optionImages: [], round: 1, createdAt: new Date(base) } }));
    made.q.push(await prisma.question.create({ data: { ownerId: user.id, quizId: quiz.id, type: 'ORAL_BUZZER', text: 'Largest planet?', options: [], correctAnswer: 'Jupiter', points: 20, negativePoints: 5, timeLimit: 30, readingTime: 3, optionImages: [], round: 1, createdAt: new Date(base + 1) } }));
    made.code = 'RAL-' + Math.floor(100 + Math.random() * 900);
    const session = await prisma.session.create({ data: { code: made.code, hostId: user.id, quizId: quiz.id, readAloud: true, questions: { create: made.q.map((q, i) => ({ questionId: q.id, order: i })) } } });
    made.sessionId = session.id;
    ready = true;
  } catch (e) {
    console.error('[read-aloud-live] setup skipped:', e.message);
  }
});

after(async () => {
  for (const s of sockets) s.close();
  try {
    if (made.sessionId) {
      await prisma.answer.deleteMany({ where: { participant: { sessionId: made.sessionId } } });
      await prisma.buzzerPress.deleteMany({ where: { sessionId: made.sessionId } }).catch(() => {});
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

test('read-aloud: options and clock wait for the host; pause/resume', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const token = jwt.sign({ id: made.userId, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
  const { s: host, data: hostJoin } = await join({ code: made.code, role: 'host', token });
  assert.equal(hostJoin.session.readAloud, true);
  const A = await join({ code: made.code, name: 'Asha', role: 'student' });
  const started = next(A.s, 'start-quiz'); host.emit('start-quiz'); await started;

  // Question opens held: no options, no clock, answers refused.
  let qs = next(A.s, 'question-started'); host.emit('next-question'); let s = await qs;
  assert.deepEqual([s.question.held, s.question.options, s.question.optionCount, s.startTime, s.question.readingTime], [true, [], 2, null, 0]);
  let err = next(A.s, 'error'); A.s.emit('submit-answer', { questionId: s.question.id, answer: 'Bengaluru' });
  assert.match((await err).message, /wait for the options/i);
  // A student can't release it.
  err = next(A.s, 'error'); A.s.emit('release-question', { questionId: s.question.id });
  assert.match((await err).message, /only the host/i);

  // Host shows the options: they arrive with a start time.
  const rel = next(A.s, 'question-released'); host.emit('release-question', { questionId: s.question.id });
  const r = await rel;
  assert.deepEqual(r.options, ['Mysuru', 'Bengaluru']);
  assert.ok(Math.abs(r.startTime - Date.now()) < 3000);

  // Pause: answers wait. Resume: the start time moves forward by the pause.
  const p = next(A.s, 'timer-paused'); host.emit('pause-timer', { questionId: s.question.id }); await p;
  err = next(A.s, 'error'); A.s.emit('submit-answer', { questionId: s.question.id, answer: 'Bengaluru' });
  assert.match((await err).message, /paused/i);
  await sleep(1200);
  const res = next(A.s, 'timer-resumed'); host.emit('resume-timer', { questionId: s.question.id });
  const rs = await res;
  assert.ok(rs.startTime - r.startTime >= 1000, 'start time shifted by the pause');
  const ans = next(A.s, 'answer-received'); A.s.emit('submit-answer', { questionId: s.question.id, answer: 'Bengaluru' });
  assert.equal((await ans).isCorrect, true);

  // Buzzer question held: the buzzer only opens after "Open buzzer".
  const shown = next(host, 'show-results'); host.emit('show-results'); await shown;
  qs = next(A.s, 'question-started'); host.emit('next-question'); s = await qs;
  assert.equal(s.question.held, true);
  assert.equal(await none(A.s, 'buzzer-armed', 1500), true, 'no buzzer while the teacher reads');
  const armed = next(A.s, 'buzzer-armed', 5000);
  host.emit('release-question', { questionId: s.question.id });
  await armed;
  await next(A.s, 'buzzer-activated', 6000);
});
