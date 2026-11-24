/**
 * Fair buzzer judging — pure functions, no I/O, no timers.
 *
 * The problem: "who pressed first" only exists on the phone, and anything the
 * phone reports can be forged. Judging by server arrival is unforgeable but
 * lets the network pick the winner. So:
 *
 *   1. The phone measures its own reaction time: performance.now() when the
 *      open buzzer was painted -> pointerdown event.timeStamp. Network latency
 *      and slow rendering are not in that number.
 *   2. The server cross-checks it. It knows when it sent OPEN to that socket
 *      (sentAt), when the phone acked it after painting (ackAt) and when the
 *      press arrived (arrivedAt):
 *
 *        observed = arrivedAt - sentAt          (down + render + reaction + up)
 *        credit   = ackAt - sentAt, capped      (down + render + up)
 *        floor    = observed - credit           (~ the real reaction)
 *        effective = max(claimed, floor)
 *
 *      An honest claim sits at ~floor and is kept. A lie below floor is
 *      ignored. Inflating the credit (delaying acks) is capped against the
 *      player's own rolling ping RTT, so a cheater gains at most a few tens of
 *      milliseconds — and gets flagged.
 *   3. The server waits a short collection window after the first valid press
 *      (sized to the slowest player's RTT) so a fast finger on a slow network
 *      still gets counted, then the lowest effective time wins.
 */

export const FAIRNESS = Object.freeze({
  HUMAN_FLOOR_MS: 100,     // below this is anticipation/automation (athletics false-start rule)
  RENDER_ALLOWANCE_MS: 150, // how far the OPEN ack may exceed ping p90 (render + jitter) before capping
  MAX_CREDIT_MS: 800,      // never credit more latency than this, whatever the phone says
  WINDOW_MIN_MS: 150,      // collection window bounds
  WINDOW_MAX_MS: 600,
  WINDOW_PAD_MS: 50,
  TIE_MS: 10,              // effective times this close are a tie -> earlier arrival wins
  ARM_MIN_MS: 600,         // random "get ready" hold before the buzzer opens
  ARM_MAX_MS: 2500,
  RTT_SAMPLES: 15,         // rolling ping history per socket
  BOT_MIN_SAMPLES: 5,      // bot heuristic: many very fast, very consistent reactions
  BOT_MEAN_MS: 180,
  BOT_STDDEV_MS: 15
});

export const FLAGS = Object.freeze({
  CLAMPED: 'CLAMPED',               // claimed faster than physically possible -> raised to floor
  NO_CLIENT_TIME: 'NO_CLIENT_TIME', // phone sent no reaction time (old client) -> server estimate used
  NO_ACK: 'NO_ACK',                 // phone never acked OPEN -> ping RTT used
  NO_RTT: 'NO_RTT',                 // no latency info at all -> no credit given
  LAG_SPIKE: 'LAG_SPIKE',           // OPEN ack much slower than usual -> credit capped
  TOO_FAST: 'TOO_FAST',             // under the human floor -> rejected as a false start
  FALSE_START: 'FALSE_START',       // pressed before the buzzer opened
  BOT_PATTERN: 'BOT_PATTERN'        // consistently inhumanly fast + uniform
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

/** Summary of a socket's recent round-trip samples (ms). */
export function rttStats(samples = []) {
  const s = samples.filter((v) => isNum(v) && v >= 0).sort((a, b) => a - b);
  if (!s.length) return { count: 0, min: null, median: null, p90: null };
  return { count: s.length, min: s[0], median: quantile(s, 0.5), p90: quantile(s, 0.9) };
}

/** Push a sample onto a bounded rolling history (mutates + returns the array). */
export function pushSample(samples, value, max = FAIRNESS.RTT_SAMPLES) {
  if (!isNum(value) || value < 0) return samples;
  samples.push(value);
  while (samples.length > max) samples.shift();
  return samples;
}

/**
 * How much latency (down + render + up) we credit for this press.
 * rttOpen is the OPEN ack round trip; stats are the socket's ping stats.
 */
export function latencyCredit({ rttOpen, stats = rttStats() }, F = FAIRNESS) {
  const flags = [];
  let credit;
  if (isNum(rttOpen) && rttOpen >= 0) {
    credit = rttOpen;
    if (isNum(stats.p90)) {
      const cap = stats.p90 + F.RENDER_ALLOWANCE_MS;
      if (credit > cap) {
        credit = cap;
        flags.push(FLAGS.LAG_SPIKE);
      }
    }
  } else if (isNum(stats.p90)) {
    credit = stats.p90;
    flags.push(FLAGS.NO_ACK);
  } else {
    credit = 0;
    flags.push(FLAGS.NO_RTT);
  }
  return { creditMs: Math.max(0, Math.min(credit, F.MAX_CREDIT_MS)), flags };
}

/**
 * Judge one press. Returns the numbers we keep for the audit log plus
 * `rejected` (a FLAGS value) when the press must not count.
 */
export function judgePress({ reactionMs, sentAt, ackAt, arrivedAt, stats }, F = FAIRNESS) {
  const observedMs = isNum(sentAt) && isNum(arrivedAt) ? Math.max(0, arrivedAt - sentAt) : null;
  const rttOpen = isNum(sentAt) && isNum(ackAt) ? Math.max(0, ackAt - sentAt) : null;
  const { creditMs, flags } = latencyCredit({ rttOpen, stats }, F);
  const floorMs = observedMs == null ? null : Math.max(0, observedMs - creditMs);

  const claimed = isNum(reactionMs) && reactionMs >= 0 ? reactionMs : null;
  let effectiveMs;
  if (claimed == null) {
    flags.push(FLAGS.NO_CLIENT_TIME);
    effectiveMs = floorMs ?? Number.MAX_SAFE_INTEGER;
  } else if (floorMs != null && claimed < floorMs) {
    flags.push(FLAGS.CLAMPED);
    effectiveMs = floorMs;
  } else {
    effectiveMs = claimed;
  }

  // Anticipation / automation: a reaction faster than humanly possible is a
  // false start. Judge on the *effective* time so a clamped liar who really
  // was that fast is also caught, but a slow-network honest player is not.
  let rejected = null;
  if (effectiveMs < F.HUMAN_FLOOR_MS) {
    rejected = FLAGS.TOO_FAST;
    flags.push(FLAGS.TOO_FAST);
  }

  return {
    claimedMs: claimed,
    observedMs,
    rttMs: rttOpen,
    creditMs,
    floorMs,
    effectiveMs: Math.round(effectiveMs),
    flags,
    rejected
  };
}

/**
 * How long to keep collecting after the first valid press: long enough for the
 * slowest connected player's press to arrive, within fixed bounds.
 */
export function collectionWindowMs(statsList = [], F = FAIRNESS) {
  const worst = statsList.reduce((m, s) => (isNum(s?.p90) && s.p90 > m ? s.p90 : m), 0);
  return Math.round(Math.min(F.WINDOW_MAX_MS, Math.max(F.WINDOW_MIN_MS, worst + F.WINDOW_PAD_MS)));
}

/** Order valid presses: lowest effective time; near-ties go to the earlier arrival. */
export function rankPresses(presses, F = FAIRNESS) {
  return [...presses].sort((a, b) => {
    const d = a.effectiveMs - b.effectiveMs;
    if (Math.abs(d) <= F.TIE_MS) return a.arrivedAt - b.arrivedAt;
    return d;
  });
}

/** Heuristic: is this run of a player's effective reaction times bot-like? */
export function botSuspicion(history = [], F = FAIRNESS) {
  const h = history.filter(isNum);
  if (h.length < F.BOT_MIN_SAMPLES) return false;
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const variance = h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length;
  return mean < F.BOT_MEAN_MS && Math.sqrt(variance) < F.BOT_STDDEV_MS;
}

/** Random "get ready" hold so nobody can count down to the open. */
export function randomArmDelay(rng = Math.random, F = FAIRNESS) {
  return Math.round(F.ARM_MIN_MS + rng() * (F.ARM_MAX_MS - F.ARM_MIN_MS));
}
