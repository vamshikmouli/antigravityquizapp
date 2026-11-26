import { randomUUID } from 'node:crypto';
import { TIME_LIMITS } from '../shared/constants.js';
import { FLAGS, judgePress, rankPresses, botSuspicion } from './fairBuzzer.js';

/**
 * Per-session buzzer round state.
 *
 * Phases: idle -> armed (get ready; tapping = false start) -> open (collecting)
 *         -> decided (winner locked). deactivate() returns to idle.
 *
 * Judging is done in memory: Node runs one event at a time, so this is
 * race-free on a single instance without locks. The audit trail goes to
 * Postgres afterwards, off the hot path (see buzzerAudit.js).
 */
export class BuzzerManager {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.reactionHistory = new Map(); // participantId -> effective ms (session-wide, for bot heuristic)
    this.timers = new Set();
    this.answerTimeout = null;
    this.persistChain = Promise.resolve();
    this._resetRound();
    this.phase = 'idle';
  }

  /**
   * Run DB writes for this session strictly in order (win counters, audit
   * rows, overrides) without ever blocking judging. Errors are logged.
   */
  enqueuePersist(fn) {
    this.persistChain = this.persistChain
      .then(fn)
      .catch((err) => console.error('[Buzzer] persist failed:', err?.message || err));
    return this.persistChain;
  }

  _resetRound() {
    this.roundId = null;
    this.questionId = null;
    this.openedAt = null;
    this.sent = new Map();       // participantId -> sentAt
    this.acks = new Map();       // participantId -> ackAt
    this.presses = new Map();    // participantId -> judged press (valid ones)
    this.lockedOut = new Map();  // participantId -> reason (false starts)
    this.log = [];               // every press attempt, for the audit
    this.firstValidAt = null;
    this.firstBuzzer = null;
    this.ranking = [];
    this.marginMs = null;
    this.answered = false;
    this.overridden = false;
    this.tried = new Set();      // participants who already had their turn (answered wrong / timed out)
  }

  // ---- compatibility with older call sites ----
  get active() { return this.phase === 'open'; }
  get locked() { return this.phase === 'decided'; }

  /** Run fn after ms; cancelled automatically by deactivate()/arm(). */
  schedule(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  /** Start a new round for a question. Returns its roundId. */
  arm(questionId) {
    this.clearTimers();
    this.clearAnswerTimeout();
    this._resetRound();
    this.roundId = randomUUID();
    this.questionId = questionId;
    this.phase = 'armed';
    return this.roundId;
  }

  /** Open the buzzer. Returns false if the round changed meanwhile. */
  open(roundId, now = Date.now()) {
    if (this.phase !== 'armed' || roundId !== this.roundId) return false;
    this.phase = 'open';
    this.openedAt = now;
    return true;
  }

  recordSent(participantId, sentAt = Date.now()) {
    this.sent.set(participantId, sentAt);
  }

  recordAck(participantId, roundId, ackAt = Date.now()) {
    if (roundId !== this.roundId || !this.sent.has(participantId) || this.acks.has(participantId)) return;
    this.acks.set(participantId, ackAt);
  }

  /**
   * Handle a press. Returns { status, judged?, firstValid? } where status is
   *   'ignored'     – no round / wrong round / duplicate / not open
   *   'false_start' – pressed while armed, self-reported, or too fast (locked out)
   *   'accepted'    – counted; firstValid=true for the first one (start the window)
   *   'queued'      – arrived after the winner was decided: joins the line (next chance if the winner is wrong)
   *   'late'        – arrived after the winner was decided but not counted (rejected)
   */
  press({ participantId, participantName, roundId, reactionMs, falseStart, arrivedAt = Date.now(), stats }) {
    const base = { participantId, participantName, roundId, arrivedAt, reactionMs: reactionMs ?? null };

    if (!this.roundId || roundId !== this.roundId || this.phase === 'idle') {
      return { status: 'ignored', reason: 'NO_ROUND' };
    }
    if (this.lockedOut.has(participantId) || this.presses.has(participantId)) {
      return { status: 'ignored', reason: 'DUPLICATE' };
    }

    if (this.phase === 'armed' || falseStart === true) {
      this.lockedOut.set(participantId, FLAGS.FALSE_START);
      this.log.push({ ...base, flags: [FLAGS.FALSE_START], outcome: 'REJECTED' });
      return { status: 'false_start', reason: FLAGS.FALSE_START };
    }

    if (this.phase === 'decided') {
      // The buzzer stays open for everyone: a later press joins the line.
      const judged = this._judge(participantId, reactionMs, arrivedAt, stats);
      if (judged.rejected) {
        this.log.push({ ...base, ...judged, outcome: 'LATE' });
        return { status: 'late', judged };
      }
      const entry = { ...base, ...judged };
      this.presses.set(participantId, entry);
      this.ranking.push(entry);
      this.log.push({ ...entry, outcome: 'QUEUED' });
      return { status: 'queued', judged, position: this.ranking.length };
    }

    // phase === 'open'
    const judged = this._judge(participantId, reactionMs, arrivedAt, stats);
    if (judged.rejected) {
      this.lockedOut.set(participantId, judged.rejected);
      this.log.push({ ...base, ...judged, outcome: 'REJECTED' });
      return { status: 'false_start', reason: judged.rejected, judged };
    }

    const history = this.reactionHistory.get(participantId) || [];
    history.push(judged.effectiveMs);
    if (history.length > 20) history.shift();
    this.reactionHistory.set(participantId, history);
    if (botSuspicion(history)) judged.flags.push(FLAGS.BOT_PATTERN);

    const entry = { ...base, ...judged };
    this.presses.set(participantId, entry);
    this.log.push(entry);
    const firstValid = this.firstValidAt == null;
    if (firstValid) this.firstValidAt = arrivedAt;
    return { status: 'accepted', judged, firstValid };
  }

  _judge(participantId, reactionMs, arrivedAt, stats) {
    return judgePress({
      reactionMs,
      sentAt: this.sent.get(participantId),
      ackAt: this.acks.get(participantId),
      arrivedAt,
      stats
    });
  }

  /** True when every expected player has either pressed or been locked out. */
  everyoneDone(expectedIds) {
    if (!expectedIds?.length) return false;
    return expectedIds.every((id) => this.presses.has(id) || this.lockedOut.has(id));
  }

  /** Close collection and pick the winner. Returns null if nothing valid. */
  decide() {
    if (this.phase !== 'open') return null;
    const ranking = rankPresses([...this.presses.values()]);
    if (!ranking.length) return null;
    this.clearTimers();
    this.phase = 'decided';
    this.ranking = ranking;
    const [w, second] = ranking;
    this.marginMs = second ? second.effectiveMs - w.effectiveMs : null;
    this.firstBuzzer = {
      participantId: w.participantId,
      participantName: w.participantName,
      timestamp: w.arrivedAt
    };
    for (const e of this.log) {
      if (e.outcome == null) e.outcome = e.participantId === w.participantId ? 'WON' : 'LOST';
    }
    return this.result();
  }

  /**
   * The current group answered wrong (or ran out of time): give the turn to
   * the next group in line, fastest first. Returns the new result, or null
   * when nobody is left in line.
   */
  nextInLine(wrongId) {
    if (this.phase !== 'decided') return null;
    if (wrongId) this.tried.add(wrongId);
    const next = this.ranking.find((p) => !this.tried.has(p.participantId) && p.participantId !== this.firstBuzzer?.participantId);
    if (!next) return null;
    this.firstBuzzer = { participantId: next.participantId, participantName: next.participantName, timestamp: next.arrivedAt };
    this.answered = false;
    this.clearAnswerTimeout();
    return { ...this.result(), nextInLine: true };
  }

  /** Host re-awards the buzz to another valid presser of this round. */
  override(participantId) {
    if (this.phase !== 'decided' || this.answered) return { ok: false, reason: 'NOT_OVERRIDABLE' };
    const target = this.presses.get(participantId);
    if (!target) return { ok: false, reason: 'NOT_A_PRESSER' };
    const previous = this.firstBuzzer?.participantId;
    if (previous === participantId) return { ok: false, reason: 'ALREADY_WINNER' };
    this.firstBuzzer = {
      participantId: target.participantId,
      participantName: target.participantName,
      timestamp: target.arrivedAt
    };
    this.overridden = true;
    return { ok: true, previous, result: this.result() };
  }

  /** Public summary of the decided round (safe to broadcast). */
  result() {
    const winnerId = this.firstBuzzer?.participantId;
    const w = this.presses.get(winnerId);
    return {
      roundId: this.roundId,
      questionId: this.questionId,
      winner: this.firstBuzzer,
      fairness: w ? {
        reactionMs: w.effectiveMs,
        marginMs: this.overridden ? null : this.marginMs,
        compensatedMs: w.creditMs,
        flags: w.flags,
        overridden: this.overridden
      } : null,
      ranking: this.ranking.slice(0, 10).map((p) => ({
        participantId: p.participantId,
        participantName: p.participantName,
        reactionMs: p.effectiveMs,
        flags: p.flags
      })),
      // The line: everyone who buzzed, fastest first; who is answering, who already tried.
      queue: this.ranking.map((p) => ({
        participantId: p.participantId,
        participantName: p.participantName,
        reactionMs: p.effectiveMs,
        current: p.participantId === winnerId,
        tried: this.tried.has(p.participantId)
      })),
      falseStarts: this.lockedOut.size
    };
  }

  markAnswered() {
    this.answered = true;
    this.clearAnswerTimeout();
  }

  /** Back to idle: cancels pending open/window timers and the answer timeout. */
  deactivate() {
    this.clearTimers();
    this.clearAnswerTimeout();
    this._resetRound();
    this.phase = 'idle';
  }

  reset() {
    this.deactivate();
  }

  setAnswerTimeout(callback, timeoutMs = TIME_LIMITS.BUZZER_ANSWER * 1000) {
    this.clearAnswerTimeout();
    this.answerTimeout = setTimeout(() => {
      this.answerTimeout = null;
      callback();
    }, timeoutMs);
  }

  clearAnswerTimeout() {
    if (this.answerTimeout) {
      clearTimeout(this.answerTimeout);
      this.answerTimeout = null;
    }
  }

  getState() {
    return {
      phase: this.phase,
      active: this.active,
      locked: this.locked,
      roundId: this.roundId,
      firstBuzzer: this.firstBuzzer,
      totalPresses: this.presses.size
    };
  }

  /** Every press attempt this round (for the audit log). */
  getAllPresses() {
    return [...this.log];
  }
}

const buzzerManagers = new Map();

export function getBuzzerManager(sessionId) {
  if (!buzzerManagers.has(sessionId)) {
    buzzerManagers.set(sessionId, new BuzzerManager(sessionId));
  }
  return buzzerManagers.get(sessionId);
}

export function removeBuzzerManager(sessionId) {
  const manager = buzzerManagers.get(sessionId);
  if (manager) {
    manager.deactivate();
    buzzerManagers.delete(sessionId);
  }
}

export function clearAllBuzzerManagers() {
  buzzerManagers.forEach((manager) => manager.deactivate());
  buzzerManagers.clear();
}
