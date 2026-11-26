import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAIRNESS, FLAGS, rttStats, pushSample, latencyCredit, judgePress,
  collectionWindowMs, rankPresses, botSuspicion, randomArmDelay
} from '../controllers/fairBuzzer.js';
import { BuzzerManager } from '../controllers/buzzerController.js';

// A simulated player: network one-way delays, phone render time, real reaction.
function simulate({ down, up, render = 20, reaction, sentAt = 1000, claim }) {
  const shownAt = sentAt + down + render;
  const ackAt = shownAt + up;                // phone acks OPEN right after painting
  const tapAt = shownAt + reaction;
  const arrivedAt = tapAt + up;
  return {
    sentAt, ackAt, arrivedAt,
    reactionMs: claim === undefined ? reaction : claim,
    stats: rttStats(Array(10).fill(down + up))
  };
}

test('rttStats: min/median/p90 and empty', () => {
  assert.deepEqual(rttStats([]), { count: 0, min: null, median: null, p90: null });
  const s = rttStats([50, 10, 40, 20, 30, 100, 60, 70, 80, 90]);
  assert.equal(s.min, 10);
  assert.equal(s.median, 50);
  assert.equal(s.p90, 90);
});

test('pushSample keeps a bounded rolling window and ignores junk', () => {
  const a = [];
  for (let i = 0; i < 20; i++) pushSample(a, i, 5);
  assert.deepEqual(a, [15, 16, 17, 18, 19]);
  pushSample(a, NaN, 5);
  pushSample(a, -1, 5);
  assert.equal(a.length, 5);
});

test('honest player keeps their claimed reaction (no clamp)', () => {
  const p = simulate({ down: 40, up: 40, reaction: 250 });
  const j = judgePress(p);
  assert.equal(j.effectiveMs, 250);
  assert.ok(!j.flags.includes(FLAGS.CLAMPED));
  assert.equal(j.rejected, null);
});

test('fast finger on a slow network beats slow finger on a fast network', () => {
  const slowNet = judgePress(simulate({ down: 250, up: 250, render: 80, reaction: 200 }));
  const fastNet = judgePress(simulate({ down: 15, up: 15, render: 10, reaction: 260 }));
  // By arrival order the fast network would have won by ~470ms.
  assert.ok(simulate({ down: 15, up: 15, render: 10, reaction: 260 }).arrivedAt <
            simulate({ down: 250, up: 250, render: 80, reaction: 200 }).arrivedAt);
  const [winner] = rankPresses([
    { ...fastNet, participantId: 'fast-net', arrivedAt: 1 },
    { ...slowNet, participantId: 'slow-net', arrivedAt: 2 }
  ]);
  assert.equal(winner.participantId, 'slow-net');
});

test('slow phone render (within the allowance) is not held against the player', () => {
  const j = judgePress(simulate({ down: 30, up: 30, render: 120, reaction: 230 }));
  assert.equal(j.effectiveMs, 230);
});

test('render beyond the allowance costs only the excess', () => {
  // ack = 30+180+30 = 240 > p90(60)+150 -> credit capped at 210, penalty 30ms
  const j = judgePress(simulate({ down: 30, up: 30, render: 180, reaction: 230 }));
  assert.equal(j.effectiveMs, 260);
  assert.ok(j.flags.includes(FLAGS.LAG_SPIKE));
});

test('a forged tiny reaction time is clamped up to the server floor', () => {
  // Really took 300ms, claims 120ms.
  const j = judgePress(simulate({ down: 40, up: 40, reaction: 300, claim: 120 }));
  assert.ok(j.flags.includes(FLAGS.CLAMPED));
  assert.ok(j.effectiveMs >= 295 && j.effectiveMs <= 305, `effective ${j.effectiveMs}`);
});

test('delaying the OPEN ack to earn latency credit is capped and flagged', () => {
  const p = simulate({ down: 40, up: 40, reaction: 300, claim: 120 });
  p.ackAt += 600; // cheater holds the ack back
  const j = judgePress(p);
  assert.ok(j.flags.includes(FLAGS.LAG_SPIKE));
  // credit capped at p90 (80) + allowance (150) = 230
  assert.equal(j.creditMs, 80 + FAIRNESS.RENDER_ALLOWANCE_MS);
  // gain is bounded: effective >= real reaction - (allowance - real render)
  assert.ok(j.effectiveMs >= 300 - FAIRNESS.RENDER_ALLOWANCE_MS);
});

test('sub-human reaction is rejected as TOO_FAST (bot / anticipation)', () => {
  const j = judgePress(simulate({ down: 30, up: 30, reaction: 60 }));
  assert.equal(j.rejected, FLAGS.TOO_FAST);
});

test('old client without a reaction time falls back to the server estimate', () => {
  const j = judgePress(simulate({ down: 40, up: 40, reaction: 280, claim: null }));
  assert.ok(j.flags.includes(FLAGS.NO_CLIENT_TIME));
  assert.ok(Math.abs(j.effectiveMs - 280) <= 25);
});

test('missing ack uses ping p90; no latency info gives no credit', () => {
  assert.deepEqual(latencyCredit({ rttOpen: null, stats: rttStats([50, 60, 70]) }),
    { creditMs: 70, flags: [FLAGS.NO_ACK] });
  assert.deepEqual(latencyCredit({ rttOpen: null, stats: rttStats([]) }),
    { creditMs: 0, flags: [FLAGS.NO_RTT] });
  assert.equal(latencyCredit({ rttOpen: 5000, stats: rttStats([]) }).creditMs, FAIRNESS.MAX_CREDIT_MS);
});

test('collection window follows the slowest player, within bounds', () => {
  assert.equal(collectionWindowMs([]), FAIRNESS.WINDOW_MIN_MS);
  assert.equal(collectionWindowMs([rttStats([200]), rttStats([30])]), 250);
  assert.equal(collectionWindowMs([rttStats([2000])]), FAIRNESS.WINDOW_MAX_MS);
});

test('near-ties go to the earlier arrival', () => {
  const r = rankPresses([
    { participantId: 'a', effectiveMs: 205, arrivedAt: 10 },
    { participantId: 'b', effectiveMs: 200, arrivedAt: 20 },
    { participantId: 'c', effectiveMs: 150, arrivedAt: 30 }
  ]);
  assert.deepEqual(r.map((p) => p.participantId), ['c', 'a', 'b']);
});

test('bot heuristic: fast + uniform is flagged, human variance is not', () => {
  assert.equal(botSuspicion([140, 142, 141, 139, 143]), true);
  assert.equal(botSuspicion([180, 260, 210, 320, 240]), false);
  assert.equal(botSuspicion([140, 141]), false);
});

test('random arm delay stays within bounds', () => {
  assert.equal(randomArmDelay(() => 0), FAIRNESS.ARM_MIN_MS);
  assert.equal(randomArmDelay(() => 1), FAIRNESS.ARM_MAX_MS);
});

// ---------------- BuzzerManager round state machine ----------------

function openRound() {
  const m = new BuzzerManager('s1');
  const roundId = m.arm('q1');
  return { m, roundId };
}

test('pressing while armed is a false start and locks that player out', () => {
  const { m, roundId } = openRound();
  assert.equal(m.press({ participantId: 'p1', roundId, reactionMs: 200 }).status, 'false_start');
  m.open(roundId, 1000);
  assert.equal(m.press({ participantId: 'p1', roundId, reactionMs: 200 }).status, 'ignored');
  m.deactivate();
});

test('wrong/stale roundId and duplicates are ignored', () => {
  const { m, roundId } = openRound();
  m.open(roundId, 1000);
  assert.equal(m.press({ participantId: 'p1', roundId: 'old', reactionMs: 200 }).status, 'ignored');
  m.recordSent('p1', 1000);
  assert.equal(m.press({ participantId: 'p1', roundId, reactionMs: 200, arrivedAt: 1300 }).status, 'accepted');
  assert.equal(m.press({ participantId: 'p1', roundId, reactionMs: 150, arrivedAt: 1310 }).status, 'ignored');
  m.deactivate();
});

test('stale open() from a previous question does nothing', () => {
  const m = new BuzzerManager('s1');
  const first = m.arm('q1');
  m.arm('q2');
  assert.equal(m.open(first), false);
  assert.equal(m.phase, 'armed');
  m.deactivate();
});

test('full round: later-arriving faster finger wins; later press joins the line; override', () => {
  const { m, roundId } = openRound();
  m.open(roundId, 1000);
  const fast = simulate({ down: 15, up: 15, render: 10, reaction: 260 });
  const slow = simulate({ down: 250, up: 250, render: 80, reaction: 200 });
  for (const [id, p] of [['fastNet', fast], ['slowNet', slow]]) {
    m.recordSent(id, p.sentAt);
    m.recordAck(id, roundId, p.ackAt);
  }
  const a = m.press({ participantId: 'fastNet', participantName: 'A', roundId, ...fast });
  assert.equal(a.firstValid, true);
  const b = m.press({ participantId: 'slowNet', participantName: 'B', roundId, ...slow });
  assert.equal(b.firstValid, false);

  const res = m.decide();
  assert.equal(res.winner.participantId, 'slowNet');
  assert.equal(res.fairness.marginMs, 60);
  assert.equal(m.locked, true);
  // The buzzer stays open: a press after the decision joins the line
  const q = m.press({ participantId: 'p3', participantName: 'C', roundId, reactionMs: 300 });
  assert.equal(q.status, 'queued');
  assert.equal(q.position, 3);
  assert.deepEqual(m.getAllPresses().map((e) => e.outcome), ['LOST', 'WON', 'QUEUED']);
  assert.deepEqual(m.result().queue.map((e) => [e.participantId, e.current]), [['slowNet', true], ['fastNet', false], ['p3', false]]);

  assert.equal(m.override('nobody').ok, false);
  const o = m.override('fastNet');
  assert.equal(o.ok, true);
  assert.equal(o.previous, 'slowNet');
  assert.equal(o.result.winner.participantId, 'fastNet');
  assert.equal(o.result.fairness.overridden, true);
  m.markAnswered();
  assert.equal(m.override('slowNet').ok, false);
  m.deactivate();
});

test('wrong answer passes the question down the buzz line, fastest first', () => {
  const { m, roundId } = openRound();
  m.open(roundId, 1000);
  m.press({ participantId: 'A', participantName: 'A', roundId, reactionMs: 250 });
  m.press({ participantId: 'B', participantName: 'B', roundId, reactionMs: 400 });
  assert.equal(m.decide().winner.participantId, 'A');
  m.press({ participantId: 'C', participantName: 'C', roundId, reactionMs: 600 });
  const n1 = m.nextInLine('A');
  assert.equal(n1.winner.participantId, 'B');
  assert.equal(n1.nextInLine, true);
  assert.deepEqual(n1.queue.map((e) => [e.participantId, e.tried, e.current]), [['A', true, false], ['B', false, true], ['C', false, false]]);
  assert.equal(m.nextInLine('B').winner.participantId, 'C');
  assert.equal(m.nextInLine('C'), null, 'nobody left in line');
  m.deactivate();
});

test('everyoneDone counts presses and lockouts', () => {
  const { m, roundId } = openRound();
  m.press({ participantId: 'early', roundId });   // false start while armed
  m.open(roundId, 1000);
  m.recordSent('p1', 1000);
  m.press({ participantId: 'p1', roundId, reactionMs: 250, arrivedAt: 1300 });
  assert.equal(m.everyoneDone(['early', 'p1']), true);
  assert.equal(m.everyoneDone(['early', 'p1', 'p2']), false);
  m.deactivate();
});

test('deactivate cancels scheduled timers', async () => {
  const m = new BuzzerManager('s1');
  let fired = false;
  m.schedule(() => { fired = true; }, 20);
  m.deactivate();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(fired, false);
});
