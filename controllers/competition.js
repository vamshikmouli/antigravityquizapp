/**
 * Competition (team) mode — pure logic, no I/O.
 *
 * One phone per group. Each round has a FORMAT:
 *   DIRECTED – each question goes to one group in rotation; on a wrong answer
 *              or timeout it can PASS to the next group for reduced points.
 *   ALL      – every group answers every question (classic behaviour).
 *   BUZZER   – any group buzzes (fair buzzer); host marks the oral answer.
 *   CLUE     – clues are revealed one by one, any group buzzes; fewer clues
 *              = more points; a wrong buzz costs points and locks that group
 *              out of the question.
 * A round can end with ELIMINATION of the lowest group(s).
 */

export const FORMATS = Object.freeze({ DIRECTED: 'DIRECTED', ALL: 'ALL', BUZZER: 'BUZZER', CLUE: 'CLUE' });
const FORMAT_SET = new Set(Object.values(FORMATS));

const int = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/** Best-guess format for a round from its question types. */
export function inferFormat(types = []) {
  if (types.length && types.every((t) => t === 'CLUE')) return FORMATS.CLUE;
  if (types.length && types.every((t) => t === 'BUZZER' || t === 'ORAL_BUZZER')) return FORMATS.BUZZER;
  return FORMATS.DIRECTED;
}

/** Settings for one round, with defaults filled in. */
export function roundConfig(settings, round, questionTypes = []) {
  const raw = (Array.isArray(settings) ? settings : []).find((r) => Number(r?.round) === Number(round)) || {};
  const format = FORMAT_SET.has(raw.format) ? raw.format : inferFormat(questionTypes);
  return {
    round: Number(round),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : `Round ${round}`,
    format,
    passOnWrong: format === FORMATS.DIRECTED ? raw.passOnWrong !== false : false,
    passPercent: clamp(int(raw.passPercent, 50), 0, 100),
    passTimeLimit: raw.passTimeLimit == null ? null : clamp(int(raw.passTimeLimit, 10), 3, 300),
    eliminate: clamp(int(raw.eliminate, 0), 0, 10)
  };
}

/** Validate a settings array coming from the host UI. */
export function normalizeRoundSettings(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw.slice(0, 50)) {
    const round = int(r?.round, NaN);
    if (!Number.isFinite(round) || round < 1 || seen.has(round)) continue;
    seen.add(round);
    const c = roundConfig([{ ...r, round }], round);
    out.push({ ...c, format: FORMAT_SET.has(r.format) ? r.format : c.format });
  }
  return out.sort((a, b) => a.round - b.round);
}

/** Lenient answer match for typed answers (case/space/punctuation-insensitive). */
export function answersMatch(given, correct) {
  const norm = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s.,!?'"`’]+/g, ' ').trim();
  return norm(given) !== '' && norm(given) === norm(correct);
}

/** Points for a directed attempt. attempt 1 = the group it was asked to. */
export function directedPoints({ attempt, isCorrect, points = 0, negativePoints = 0, passPercent = 50 }) {
  if (attempt <= 1) return isCorrect ? points : -Math.abs(negativePoints);
  return isCorrect ? Math.round((points * passPercent) / 100) : 0;
}

/** Points available after `revealed` clues (1-based). */
export function cluePointsFor(question, revealed) {
  const list = Array.isArray(question?.cluePoints) ? question.cluePoints.filter((n) => Number.isFinite(n)) : [];
  const n = Math.max(1, (question?.clues || []).length || list.length || 3);
  const r = clamp(revealed, 1, n);
  if (list[r - 1] != null) return list[r - 1];
  // Fallback: evenly decreasing from question.points.
  const top = question?.points || 30;
  return Math.max(1, Math.round((top * (n - r + 1)) / n));
}

/**
 * Per-session competition state (in memory, like the buzzer manager).
 */
export class CompetitionState {
  constructor() {
    this.turnCounter = new Map(); // round -> how many directed questions started
    this.current = null;          // the question in play
  }

  /**
   * Start a DIRECTED question. `groups` = active groups in a stable order
   * (join order). Returns the turn { target, attempt, order }.
   */
  startDirected(question, groups, cfg) {
    if (!groups.length) { this.current = null; return null; }
    const n = this.turnCounter.get(cfg.round) || 0;
    this.turnCounter.set(cfg.round, n + 1);
    const start = n % groups.length;
    const order = [...groups.slice(start), ...groups.slice(0, start)].map((g) => ({ id: g.id, name: g.name }));
    this.current = {
      format: FORMATS.DIRECTED,
      questionId: question.id,
      round: cfg.round,
      cfg,
      order,
      attempt: 1,
      target: order[0],
      tried: new Set([order[0].id]),
      done: false
    };
    return this.turn();
  }

  turn() {
    const c = this.current;
    if (!c || c.format !== FORMATS.DIRECTED) return null;
    return { participantId: c.target.id, name: c.target.name, attempt: c.attempt, isPass: c.attempt > 1, order: c.order.map((g) => g.name) };
  }

  /** Move a DIRECTED question to the next untried group, or null when nobody is left. */
  pass() {
    const c = this.current;
    if (!c || c.done || !c.cfg.passOnWrong) return null;
    const next = c.order.find((g) => !c.tried.has(g.id));
    if (!next) return null;
    c.tried.add(next.id);
    c.attempt += 1;
    c.target = next;
    return this.turn();
  }

  /** Start a CLUE question. */
  startClue(question, cfg) {
    this.current = {
      format: FORMATS.CLUE, questionId: question.id, round: cfg.round, cfg,
      revealed: 1, total: Math.max(1, (question.clues || []).length), lockedOut: new Set(), done: false
    };
    return { revealed: 1, total: this.current.total };
  }

  revealClue() {
    const c = this.current;
    if (!c || c.format !== FORMATS.CLUE || c.done) return null;
    if (c.revealed < c.total) c.revealed += 1;
    return { revealed: c.revealed, total: c.total };
  }

  /** Track groups that may not buzz this question (wrong clue/buzzer answer). */
  lockOut(participantId) {
    if (!this.current) this.current = { lockedOut: new Set() };
    if (!this.current.lockedOut) this.current.lockedOut = new Set();
    this.current.lockedOut.add(participantId);
  }

  isLockedOut(participantId) {
    return Boolean(this.current?.lockedOut?.has(participantId));
  }

  finish() { if (this.current) this.current.done = true; }
  clear() { this.current = null; }
}

/**
 * Round summary: per-group points in `round`, totals, the round topper(s).
 * groups: [{ id, name, score, eliminatedAt, eliminatedRound, answers: [{ points, question: { round } }] }]
 */
export function roundSummary(groups, round) {
  const rows = groups.map((g) => ({
    id: g.id,
    name: g.name,
    roundPoints: (g.answers || []).filter((a) => (a.question?.round ?? a.round) === round).reduce((s, a) => s + (a.points || 0), 0),
    total: g.score || 0,
    eliminated: Boolean(g.eliminatedAt),
    eliminatedRound: g.eliminatedRound ?? null
  }));
  const active = rows.filter((r) => !r.eliminated || r.eliminatedRound === round);
  const best = active.length ? Math.max(...active.map((r) => r.roundPoints)) : 0;
  const toppers = active.filter((r) => r.roundPoints === best && best > 0).map((r) => r.id);
  rows.sort((a, b) => (a.eliminated - b.eliminated) || (b.total - a.total) || (b.roundPoints - a.roundPoints));
  return { round, rows, toppers };
}

/**
 * Who should go out: the `count` lowest totals among active groups.
 * Returns { candidates: [ids], tied: [ids] } — `tied` lists groups level with
 * the cut-off that the host must choose between.
 */
export function eliminationCandidates(groups, count = 1) {
  const active = groups.filter((g) => !g.eliminatedAt).sort((a, b) => (a.score || 0) - (b.score || 0));
  if (count <= 0 || active.length <= 1) return { candidates: [], tied: [] };
  const k = Math.min(count, active.length - 1);
  const cutoff = active[k - 1].score || 0;
  const below = active.filter((g) => (g.score || 0) < cutoff).map((g) => g.id);
  const atCut = active.filter((g) => (g.score || 0) === cutoff).map((g) => g.id);
  if (below.length + atCut.length <= k) return { candidates: [...below, ...atCut], tied: [] };
  return { candidates: below, tied: atCut, needed: k - below.length };
}

/** Rank groups: active first by score, then eliminated by latest-out first. */
export function rankGroups(groups) {
  const sorted = [...groups].sort((a, b) => {
    const ae = a.eliminatedAt ? 1 : 0;
    const be = b.eliminatedAt ? 1 : 0;
    if (ae !== be) return ae - be;
    if (ae && be && (b.eliminatedRound || 0) !== (a.eliminatedRound || 0)) return (b.eliminatedRound || 0) - (a.eliminatedRound || 0);
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.buzzerWins || 0) !== (a.buzzerWins || 0)) return (b.buzzerWins || 0) - (a.buzzerWins || 0);
    return new Date(a.joinedAt) - new Date(b.joinedAt);
  });
  return sorted.map((g, i) => ({ ...g, rank: i + 1, eliminated: Boolean(g.eliminatedAt) }));
}
