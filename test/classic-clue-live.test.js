import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

// LIVE: a clue question in a CLASSIC (non-group) quiz is revealed clue by clue
// (it used to show every clue at once). Skips without the dev Postgres.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3996;
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = 'classic-clue-test-secret';
const prisma = new PrismaClient();
let ready = false;
let srv = null;
const made = { userId: null, quizId: null, sessionId: null, code: null };
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
    const user = await prisma.user.create({ data: { email: `cc-${Date.now()}@cctest.local`, authProvider: 'EMAIL' } });
    made.userId = user.id;
    const quiz = await prisma.quiz.create({ data: { title: 'Classic clue', ownerId: user.id } }); // CLASSIC mode
    made.quizId = quiz.id;
    const q = await prisma.question.create({ data: { ownerId: user.id, quizId: quiz.id, type: 'CLUE', text: 'What am I?', options: [], optionImages: [], clues: ['In Shivamogga district', 'Formed by the Sharavathi', 'A high plunge waterfall'], cluePoints: [30, 20, 10], correctAnswer: 'Jog Falls', points: 30, negativePoints: 5, timeLimit: 60, readingTime: 0, round: 1 } });
    made.code = 'CCL-' + Math.floor(100 + Math.random() * 900);
    const session = await prisma.session.create({ data: { code: made.code, hostId: user.id, quizId: quiz.id, questions: { create: [{ questionId: q.id, order: 0 }] } } });
    made.sessionId = session.id;
    ready = true;
  } catch (e) {
    console.error('[classic-clue-live] setup skipped:', e.message);
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

test('classic quiz: clue question shows one clue at a time and scores by clue', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const token = jwt.sign({ id: made.userId, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
  const { s: host } = await join({ code: made.code, role: 'host', token });
  const A = await join({ code: made.code, name: 'Asha', role: 'student' });
  const started = next(A.s, 'start-quiz'); host.emit('start-quiz'); await started;

  const qs = next(host, 'question-started'); host.emit('next-question'); const q = (await qs).question;
  assert.equal(q.mode, 'CLASSIC');
  assert.deepEqual(q.clues, ['In Shivamogga district']); // only the first clue
  assert.equal(q.cluesTotal, 3);
  assert.equal(q.pointsNow, 30);
  assert.equal('correctAnswer' in q, false);

  const rv = next(host, 'clue-revealed'); host.emit('reveal-clue', { questionId: q.id }); const r = await rv;
  assert.deepEqual([r.revealed, r.pointsNow, r.clues.length], [2, 20, 2]);

  // Asha buzzes after clue 2 and is marked correct: 20 points.
  const opened = await next(A.s, 'buzzer-activated', 8000);
  const win = next(host, 'buzzer-winner'); A.s.emit('buzzer-press', { questionId: q.id, roundId: opened.roundId, reactionMs: 300 });
  await win;
  const res = next(host, 'show-results'); host.emit('mark-turn', { questionId: q.id, isCorrect: true });
  assert.equal((await res).clues.length, 3);
  assert.equal((await prisma.participant.findUnique({ where: { id: A.data.participant.id } })).score, 20);
});
