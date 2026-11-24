import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

// LIVE end-to-end test of fair buzzer judging. Boots the real server, joins
// three simulated phones with artificial network latency, and checks that the
// fastest *finger* wins — not the fastest network — that a forged reaction
// time is clamped, that early taps are false starts, that the host can
// re-award, and that every press lands in the BuzzerPress audit table.
// Skips (does not fail) when the dev Postgres from .env is unreachable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3991;
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = 'fair-buzzer-test-secret';

const prisma = new PrismaClient();
let ready = false;
let srv = null;
const made = { userId: null, sessionId: null, questionIds: [], code: null };
const sockets = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return true; } catch {}
    await sleep(250);
  }
  return false;
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

function nextEvent(socket, event, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

/** A phone with simulated one-way network delays (ms). */
async function phone(name, { down = 0, up = 0 } = {}) {
  const { socket, data } = await join({ code: made.code, name, role: 'student' });
  socket.on('latency-ping', (ack) => setTimeout(() => ack && ack(), down + up));
  return {
    id: data.participant.id,
    socket,
    /** On the next OPEN: after `down`, the phone paints + acks (ack travels `up`), then fn(data). */
    onOpen(fn) {
      socket.once('buzzer-activated', (d, ack) => setTimeout(() => {
        setTimeout(() => ack && ack(), up);
        fn(d);
      }, down));
    },
    onArmed(fn) {
      socket.once('buzzer-armed', (d) => setTimeout(() => fn(d), down));
    },
    press(payload) {
      setTimeout(() => socket.emit('buzzer-press', payload), up);
    }
  };
}

before(async () => {
  try {
    await prisma.$connect();
    srv = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), JWT_SECRET },
      stdio: ['ignore', 'ignore', 'inherit']
    });
    if (!(await waitUp())) throw new Error('server did not start');

    const user = await prisma.user.create({ data: { email: `fair-${Date.now()}@buzztest.local`, authProvider: 'EMAIL' } });
    made.userId = user.id;
    const qs = [];
    for (let i = 1; i <= 2; i++) {
      qs.push(await prisma.question.create({
        data: { text: `Fair buzz ${i}`, type: 'ORAL_BUZZER', options: [], correctAnswer: 'x', ownerId: user.id, readingTime: 0, optionImages: [] }
      }));
    }
    made.questionIds = qs.map((q) => q.id);
    made.code = 'FBZ-' + Math.floor(100 + Math.random() * 900);
    const session = await prisma.session.create({
      data: {
        code: made.code,
        hostId: user.id,
        questions: { create: qs.map((q, i) => ({ questionId: q.id, order: i })) }
      }
    });
    made.sessionId = session.id;
    ready = true;
  } catch (err) {
    console.error('[fair-buzzer-live] setup skipped:', err.message);
    ready = false;
  }
});

after(async () => {
  for (const s of sockets) s.close();
  try {
    if (made.sessionId) {
      await prisma.participant.deleteMany({ where: { sessionId: made.sessionId } });
      await prisma.session.deleteMany({ where: { id: made.sessionId } }); // cascades SessionQuestion + BuzzerPress
    }
    await prisma.question.deleteMany({ where: { id: { in: made.questionIds } } });
    if (made.userId) await prisma.user.deleteMany({ where: { id: made.userId } });
  } catch {}
  await prisma.$disconnect();
  if (srv) srv.kill();
  await sleep(200);
});

test('fair buzzer end-to-end: finger beats network, cheats clamped, false starts, override, audit', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');

  const token = jwt.sign({ id: made.userId, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
  const { socket: host } = await join({ code: made.code, role: 'host', token });

  const fastNet = await phone('FastNet', { down: 10, up: 10 });   // great Wi-Fi
  const slowNet = await phone('SlowNet', { down: 200, up: 200 }); // bad 3G, 400ms RTT
  const cheat = await phone('Cheat', { down: 10, up: 10 });       // modified client
  await sleep(2600); // let the server collect a couple of ping samples per phone

  // ---- Round 1: slow network, faster finger -------------------------------
  // FastNet reacts in 260ms, SlowNet in 180ms. By arrival order FastNet would
  // win by ~320ms; fairly, SlowNet wins by ~80ms.
  fastNet.onOpen((d) => setTimeout(() => fastNet.press({ roundId: d.roundId, questionId: d.questionId, reactionMs: 260 }), 260));
  slowNet.onOpen((d) => setTimeout(() => slowNet.press({ roundId: d.roundId, questionId: d.questionId, reactionMs: 180 }), 180));

  const winner1P = nextEvent(host, 'buzzer-winner');
  host.emit('next-question');
  const r1 = await winner1P;

  assert.equal(r1.winner.participantId, slowNet.id, `winner should be SlowNet: ${JSON.stringify(r1.ranking)}`);
  const slowRank = r1.ranking.find((r) => r.participantId === slowNet.id);
  const fastRank = r1.ranking.find((r) => r.participantId === fastNet.id);
  assert.ok(Math.abs(slowRank.reactionMs - 180) <= 40, `slow ${slowRank.reactionMs}`);
  assert.ok(Math.abs(fastRank.reactionMs - 260) <= 40, `fast ${fastRank.reactionMs}`);
  assert.ok(r1.fairness.marginMs > 0);

  // Host re-awards to FastNet.
  const overrideP = nextEvent(host, 'buzzer-winner');
  host.emit('buzzer-override', { questionId: r1.questionId, participantId: fastNet.id });
  const o = await overrideP;
  assert.equal(o.winner.participantId, fastNet.id);
  assert.equal(o.fairness.overridden, true);

  await sleep(500); // audit + win counters are written off the hot path
  const parts = await prisma.participant.findMany({ where: { sessionId: made.sessionId } });
  const wins = Object.fromEntries(parts.map((p) => [p.id, p.buzzerWins]));
  assert.equal(wins[fastNet.id], 1);
  assert.equal(wins[slowNet.id], 0);
  const audit1 = await prisma.buzzerPress.findMany({ where: { roundId: r1.roundId } });
  const outcome = Object.fromEntries(audit1.map((a) => [a.participantId, a.outcome]));
  assert.equal(outcome[slowNet.id], 'OVERRIDDEN');
  assert.equal(outcome[fastNet.id], 'WON');
  assert.ok(audit1.every((a) => a.rttMs != null && a.observedMs != null));

  // ---- Round 2: false start + forged reaction time -------------------------
  const falseStartP = nextEvent(slowNet.socket, 'buzzer-false-start');
  slowNet.onArmed((d) => slowNet.press({ roundId: d.roundId, questionId: d.questionId, falseStart: true }));
  fastNet.onOpen((d) => setTimeout(() => fastNet.press({ roundId: d.roundId, questionId: d.questionId, reactionMs: 300 }), 300));
  // Cheat really takes 450ms but claims 110ms.
  cheat.onOpen((d) => setTimeout(() => cheat.press({ roundId: d.roundId, questionId: d.questionId, reactionMs: 110 }), 450));

  const winner2P = nextEvent(host, 'buzzer-winner');
  host.emit('next-question');
  const r2 = await winner2P;
  await falseStartP;

  assert.equal(r2.winner.participantId, fastNet.id, JSON.stringify(r2.ranking));
  const cheatRank = r2.ranking.find((r) => r.participantId === cheat.id);
  assert.ok(cheatRank.flags.includes('CLAMPED'), JSON.stringify(cheatRank));
  assert.ok(cheatRank.reactionMs >= 400, `cheat effective ${cheatRank.reactionMs}`);
  assert.equal(r2.ranking.some((r) => r.participantId === slowNet.id), false);
  assert.equal(r2.falseStarts, 1);

  await sleep(500);
  const audit2 = await prisma.buzzerPress.findMany({ where: { roundId: r2.roundId } });
  const fs = audit2.find((a) => a.participantId === slowNet.id);
  assert.equal(fs.outcome, 'REJECTED');
  assert.deepEqual(fs.flags, ['FALSE_START']);

  // Audit endpoint is owner-only.
  const res = await fetch(`${BASE}/api/sessions/${made.sessionId}/buzzer-presses`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.presses.length >= 5);
  const anon = await fetch(`${BASE}/api/sessions/${made.sessionId}/buzzer-presses`);
  assert.ok(anon.status === 401 || anon.status === 403);
});
