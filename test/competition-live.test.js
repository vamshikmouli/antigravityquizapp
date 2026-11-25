import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

// LIVE end-to-end test of competition (team) mode: directed turns with pass,
// not-your-turn, rapid fire without pass, round summary + topper, elimination,
// and the clue round (wrong buzz locks out + reopens; fewer clues = more points).
// Skips when the dev Postgres from .env is unreachable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3992;
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = 'competition-test-secret';

const prisma = new PrismaClient();
let ready = false;
let srv = null;
const made = { userId: null, quizId: null, sessionId: null, code: null };
const sockets = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function next(socket, event, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

function join(payload) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE, { transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    socket.on('connect', () => socket.emit('join-session', payload));
    socket.once('session-joined', (data) => resolve({ socket, data }));
    socket.once('error', (e) => reject(new Error(e?.message || 'join error')));
    setTimeout(() => reject(new Error('join timeout')), 6000);
  });
}

async function group(name) {
  const { socket, data } = await join({ code: made.code, name, role: 'student' });
  socket.on('latency-ping', (ack) => ack && ack());
  socket.on('buzzer-activated', (_d, ack) => ack && ack());
  return { id: data.participant.id, name, socket, mode: data.mode };
}

before(async () => {
  try {
    await prisma.$connect();
    srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), JWT_SECRET }, stdio: ['ignore', 'ignore', 'inherit'] });
    for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await sleep(250); }

    const user = await prisma.user.create({ data: { email: `comp-${Date.now()}@comptest.local`, authProvider: 'EMAIL' } });
    made.userId = user.id;
    const quiz = await prisma.quiz.create({
      data: {
        title: 'Competition test', ownerId: user.id, mode: 'TEAMS',
        roundSettings: [
          { round: 1, name: 'General', format: 'DIRECTED', passOnWrong: true, passPercent: 50 },
          { round: 2, name: 'Rapid fire', format: 'DIRECTED', passOnWrong: false, eliminate: 1 },
          { round: 3, name: 'Buzzer', format: 'BUZZER' },
          { round: 4, name: 'Clue', format: 'CLUE' }
        ]
      }
    });
    made.quizId = quiz.id;
    const base = Date.now();
    const q = (i, d) => ({ ownerId: user.id, quizId: quiz.id, optionImages: [], readingTime: 0, timeLimit: 30, createdAt: new Date(base + i), ...d });
    const rows = [
      q(0, { text: 'R1 Q1', type: 'MULTIPLE_CHOICE', options: ['a', 'b', 'c', 'd'], correctAnswer: 'b', points: 10, negativePoints: 0, round: 1 }),
      q(1, { text: 'R1 Q2 ಕನ್ನಡ', type: 'SHORT_ANSWER', options: [], correctAnswer: 'ಕುವೆಂಪು', points: 10, negativePoints: 0, round: 1 }),
      q(2, { text: 'R2 rapid', type: 'MULTIPLE_CHOICE', options: ['Yes', 'No'], correctAnswer: 'Yes', points: 10, negativePoints: 5, timeLimit: 15, round: 2 }),
      q(3, { text: 'R3 buzzer', type: 'ORAL_BUZZER', options: [], correctAnswer: 'Mars', points: 20, negativePoints: 5, round: 3 }),
      q(4, { text: 'R4 clue', type: 'CLUE', options: [], clues: ['clue one', 'clue two', 'clue three'], cluePoints: [30, 20, 10], correctAnswer: 'Answer', points: 30, negativePoints: 5, round: 4 })
    ];
    const qs = [];
    for (const r of rows) qs.push(await prisma.question.create({ data: r }));
    made.code = 'CMP-' + Math.floor(100 + Math.random() * 900);
    const session = await prisma.session.create({
      data: { code: made.code, hostId: user.id, quizId: quiz.id, questions: { create: qs.map((x, i) => ({ questionId: x.id, order: i })) } }
    });
    made.sessionId = session.id;
    ready = true;
  } catch (err) {
    console.error('[competition-live] setup skipped:', err.message);
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

test('competition mode: turns, passes, elimination, clue round', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const token = jwt.sign({ id: made.userId, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
  const { socket: host } = await join({ code: made.code, role: 'host', token });
  const A = await group('Alpha');
  const B = await group('Bravo');
  const C = await group('Charlie');
  assert.equal(A.mode, 'TEAMS');

  // ---- R1 Q1: directed to Alpha; Alpha wrong -> pass to Bravo -> Bravo right (50%).
  let winner;
  let qs = next(host, 'question-started');
  host.emit('next-question');
  let q = await qs;
  assert.equal(q.question.format, 'DIRECTED');
  assert.equal(q.question.turn.participantId, A.id);

  const notYours = next(C.socket, 'error');
  C.socket.emit('submit-answer', { questionId: q.question.id, answer: 'b' });
  assert.match((await notYours).message, /Not your turn/);

  let passed = next(host, 'turn-passed');
  A.socket.emit('submit-answer', { questionId: q.question.id, answer: 'a' });
  const p = await passed;
  assert.equal(p.turn.participantId, B.id);
  assert.equal(p.turn.attempt, 2);
  assert.equal(p.turn.points, 5);

  let results = next(host, 'show-results');
  const bRes = next(B.socket, 'answer-received');
  B.socket.emit('submit-answer', { questionId: q.question.id, answer: 'b' });
  assert.deepEqual([(await bRes).isCorrect, (await bRes).points], [true, 5]);
  assert.deepEqual((await results).correctNames, ['Bravo']);

  // ---- R1 Q2: rotation -> Bravo; typed Kannada answer matched leniently.
  qs = next(host, 'question-started');
  host.emit('next-question');
  q = await qs;
  assert.equal(q.question.turn.participantId, B.id);
  results = next(host, 'show-results');
  B.socket.emit('submit-answer', { questionId: q.question.id, answer: ' ಕುವೆಂಪು ' });
  await results;

  // ---- Round 1 ends: summary + topper (Bravo 15).
  const ended = next(host, 'round-ended');
  host.emit('next-question');
  const r1 = await ended;
  assert.equal(r1.mode, 'TEAMS');
  assert.deepEqual(r1.summary.toppers, [B.id]);
  assert.equal(r1.elimination, null);

  // ---- R2 rapid fire: directed to Alpha (rotation restarts), no pass, -5.
  qs = next(host, 'question-started');
  host.emit('next-question', { force: true });
  q = await qs;
  assert.equal(q.question.turn.participantId, A.id);
  results = next(host, 'show-results');
  A.socket.emit('submit-answer', { questionId: q.question.id, answer: 'No' });
  await results; // no pass in this round

  // ---- Round 2 ends with elimination: Alpha (-5) is the candidate.
  const ended2 = next(host, 'round-ended');
  host.emit('next-question');
  const r2 = await ended2;
  assert.deepEqual(r2.elimination.candidates, [A.id]);
  const out = next(A.socket, 'group-eliminated');
  host.emit('eliminate-group', { participantIds: [A.id] });
  assert.deepEqual((await out).groups.map((g) => g.name), ['Alpha']);
  const lb = await prisma.participant.findUnique({ where: { id: A.id } });
  assert.equal(lb.eliminatedRound, 2);

  // ---- R3 buzzer round: Charlie buzzes, host marks correct (+20); eliminated Alpha can't buzz.
  qs = next(host, 'question-started');
  host.emit('next-question', { force: true });
  q = await qs;
  assert.equal(q.question.format, 'BUZZER');
  const bOpen = await next(C.socket, 'buzzer-activated', 8000);
  const aBlocked = next(A.socket, 'error');
  A.socket.emit('buzzer-press', { questionId: q.question.id, roundId: bOpen.roundId, reactionMs: 150 });
  assert.match((await aBlocked).message, /eliminated/);
  winner = next(host, 'buzzer-winner');
  C.socket.emit('buzzer-press', { questionId: q.question.id, roundId: bOpen.roundId, reactionMs: 250 });
  assert.equal((await winner).winner.participantId, C.id);
  results = next(host, 'show-results');
  host.emit('mark-buzzer-correct', { questionId: q.question.id, participantId: C.id });
  assert.deepEqual((await results).correctNames, ['Charlie']);

  // ---- R4 clue round: Bravo buzzes wrong (-5, locked out), reveal clue 2, Charlie right (+20).
  const ended3 = next(host, 'round-ended');
  host.emit('next-question');
  await ended3;
  qs = next(host, 'question-started');
  host.emit('next-question', { force: true });
  q = await qs;
  assert.equal(q.question.format, 'CLUE');
  assert.deepEqual(q.question.clues, ['clue one']);   // later clues are not leaked
  assert.equal(q.question.pointsNow, 30);

  const opened = await next(B.socket, 'buzzer-activated', 6000);
  winner = next(host, 'buzzer-winner');
  B.socket.emit('buzzer-press', { questionId: q.question.id, roundId: opened.roundId, reactionMs: 250 });
  assert.equal((await winner).winner.participantId, B.id);

  const reopened = next(host, 'clue-reopened');
  host.emit('mark-turn', { questionId: q.question.id, isCorrect: false });
  assert.deepEqual((await reopened).lockedOut, [B.id]);

  const revealed = next(host, 'clue-revealed');
  host.emit('reveal-clue', { questionId: q.question.id });
  const rv = await revealed;
  assert.deepEqual([rv.revealed, rv.pointsNow, rv.clues.length], [2, 20, 2]);

  const opened2 = await next(C.socket, 'buzzer-activated', 6000);
  const blocked = next(B.socket, 'error');
  B.socket.emit('buzzer-press', { questionId: q.question.id, roundId: opened2.roundId, reactionMs: 200 });
  assert.match((await blocked).message, /locked out/);
  winner = next(host, 'buzzer-winner');
  C.socket.emit('buzzer-press', { questionId: q.question.id, roundId: opened2.roundId, reactionMs: 300 });
  assert.equal((await winner).winner.participantId, C.id);
  results = next(host, 'show-results');
  host.emit('mark-turn', { questionId: q.question.id, isCorrect: true });
  assert.equal((await results).clues.length, 3);

  const groups = await prisma.participant.findMany({ where: { sessionId: made.sessionId } });
  const score = Object.fromEntries(groups.map((g) => [g.name, g.score]));
  assert.deepEqual(score, { Alpha: -5, Bravo: 10, Charlie: 40 });

  // Eliminated group cannot answer.
  const elimErr = next(A.socket, 'error');
  A.socket.emit('submit-answer', { questionId: q.question.id, answer: 'x' });
  assert.match((await elimErr).message, /eliminated/);
});
