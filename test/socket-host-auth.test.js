import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

// LIVE integration test for the socket host-role authorization added in Phase 1
// and extended in Phase 2. It boots the real server and drives it with a
// socket.io client. It needs the dev Postgres from .env to be reachable; if it
// isn't, the whole suite skips rather than failing (keeps `npm test` green in a
// DB-less environment).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3990;
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = 'socket-test-secret';

const prisma = new PrismaClient();
let ready = false;
let srv = null;
const made = { sessionId: null, hostId: null, strangerId: null, code: null };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return true; } catch {}
    await sleep(250);
  }
  return false;
}

// Connect, emit join-session, resolve with the FIRST of session-joined / error.
function joinOnce(payload, { keepOpen = false } = {}) {
  return new Promise((resolve) => {
    const socket = ioClient(BASE, { transports: ['websocket', 'polling'], reconnection: false });
    let settled = false;
    const finish = (event, data) => {
      if (settled) return;
      settled = true;
      if (keepOpen && event === 'session-joined') return resolve({ event, data, socket });
      socket.close();
      resolve({ event, data });
    };
    socket.on('connect', () => socket.emit('join-session', payload));
    socket.once('session-joined', (data) => finish('session-joined', data));
    socket.once('error', (data) => finish('error', data));
    setTimeout(() => finish('timeout', null), 6000);
  });
}

before(async () => {
  try {
    await prisma.$connect();
    // Boot the server with test secrets on our port.
    srv = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), JWT_SECRET, QUIZ_SSO_SECRET_JDV: 'x' },
      stdio: ['ignore', 'ignore', 'inherit']
    });
    if (!(await waitUp())) throw new Error('server did not start');

    // Seed a host user + a stranger + a WAITING session owned by the host.
    const host = await prisma.user.create({ data: { email: `host-${Date.now()}@sktest.local`, authProvider: 'EMAIL' } });
    const stranger = await prisma.user.create({ data: { email: `stranger-${Date.now()}@sktest.local`, authProvider: 'EMAIL' } });
    const code = 'SKT-' + Math.floor(100 + Math.random() * 900);
    const session = await prisma.session.create({ data: { code, hostId: host.id } });
    made.sessionId = session.id; made.hostId = host.id; made.strangerId = stranger.id; made.code = code;
    ready = true;
  } catch (err) {
    console.error('[socket-host-auth] setup skipped:', err.message);
    ready = false;
  }
});

after(async () => {
  try {
    if (made.sessionId) {
      await prisma.participant.deleteMany({ where: { sessionId: made.sessionId } });
      await prisma.session.deleteMany({ where: { id: made.sessionId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [made.hostId, made.strangerId].filter(Boolean) } } });
  } catch {}
  await prisma.$disconnect();
  if (srv) srv.kill();
  await sleep(200);
});

const ownerToken = () => jwt.sign({ id: made.hostId, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });
const strangerToken = () => jwt.sign({ id: made.strangerId, tenantId: null, schoolId: null }, JWT_SECRET, { expiresIn: '1h' });

test('host role WITHOUT a token is rejected', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const r = await joinOnce({ code: made.code, role: 'host' });
  assert.equal(r.event, 'error', JSON.stringify(r));
});

test('host role with an INVALID token is rejected', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const r = await joinOnce({ code: made.code, role: 'host', token: 'not-a-jwt' });
  assert.equal(r.event, 'error');
});

test('host role with a valid NON-OWNER token is rejected', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const r = await joinOnce({ code: made.code, role: 'host', token: strangerToken() });
  assert.equal(r.event, 'error');
  assert.match(r.data?.message || '', /own this session/i);
});

test('display role WITHOUT a token joins view-only and cannot control the quiz', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  // A TV in a signed-out browser connects with just the code...
  const r = await joinOnce({ code: made.code, role: 'display' }, { keepOpen: true });
  assert.equal(r.event, 'session-joined', JSON.stringify({ event: r.event, data: r.data }));
  // ...but host controls are refused.
  const reply = await new Promise((resolve) => {
    r.socket.once('error', (d) => resolve(d?.message || ''));
    r.socket.once('start-quiz', () => resolve('STARTED'));
    r.socket.emit('start-quiz');
    setTimeout(() => resolve('timeout'), 4000);
  });
  r.socket.close();
  assert.match(reply, /only host/i);
  const s = await prisma.session.findUnique({ where: { id: made.sessionId } });
  assert.equal(s.status, 'WAITING');
});

test('display role in a browser signed in to another account still joins view-only', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const r = await joinOnce({ code: made.code, role: 'display', token: strangerToken() });
  assert.equal(r.event, 'session-joined', JSON.stringify(r));
});

test('student role WITHOUT a token joins anonymously', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const r = await joinOnce({ code: made.code, role: 'student', name: 'Anon Student' });
  assert.equal(r.event, 'session-joined', JSON.stringify(r));
});

test('host role with the valid OWNER token joins, and host controls are honored', async (t) => {
  if (!ready) return t.skip('server/DB unavailable');
  const r = await joinOnce({ code: made.code, role: 'host', token: ownerToken() }, { keepOpen: true });
  assert.equal(r.event, 'session-joined', JSON.stringify({ event: r.event, data: r.data }));

  // Positive control: an authenticated host's control event is honored (not the
  // "only host can..." rejection). START_QUIZ broadcasts 'start-quiz' to the room.
  const control = await new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    r.socket.once('start-quiz', () => fin({ ok: true }));
    r.socket.once('error', (d) => fin({ ok: false, message: d?.message }));
    r.socket.emit('start-quiz');
    setTimeout(() => fin({ ok: false, message: 'timeout' }), 5000);
  });
  r.socket.close();
  assert.ok(control.ok, `expected start-quiz to be honored, got: ${JSON.stringify(control)}`);
});
