import { SOCKET_EVENTS } from '../shared/constants.js';
import { calculateRankings } from '../shared/utils.js';
import {
  FORMATS, roundConfig, answersMatch, directedPoints, cluePointsFor,
  CompetitionState, roundSummary, eliminationCandidates
} from './competition.js';

/**
 * Socket glue for competition (team) mode. server.js calls the hooks below
 * from its existing handlers; everything is a no-op for CLASSIC quizzes.
 */
export function createCompetition({ io, prisma, getBuzzerManager, startBuzzerRound, activeSessions }) {
  const sessions = new Map(); // sessionId -> { mode, settings, state, timer, roundTypes, lastRoundEnded }

  async function load(sessionId) {
    let c = sessions.get(sessionId);
    if (c) return c;
    const s = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { quiz: { select: { mode: true, roundSettings: true } }, questions: { select: { question: { select: { round: true, type: true } } } } }
    });
    const roundTypes = new Map();
    for (const { question } of s?.questions || []) {
      if (!roundTypes.has(question.round)) roundTypes.set(question.round, []);
      roundTypes.get(question.round).push(question.type);
    }
    c = {
      mode: s?.quiz?.mode === 'TEAMS' ? 'TEAMS' : 'CLASSIC',
      settings: Array.isArray(s?.quiz?.roundSettings) ? s.quiz.roundSettings : [],
      roundTypes,
      state: new CompetitionState(),
      timer: null,
      lastRoundEnded: null
    };
    sessions.set(sessionId, c);
    return c;
  }

  const cfgFor = (c, round) => roundConfig(c.settings, round, c.roundTypes.get(round) || []);
  const clearTimer = (c) => { if (c?.timer) { clearTimeout(c.timer); c.timer = null; } };

  function socketsOf(sessionId, participantId) {
    return [...io.sockets.sockets.values()].filter((s) => s.data.sessionId === sessionId && s.data.participantId === participantId);
  }

  async function groupsWithAnswers(sessionId) {
    return prisma.participant.findMany({
      where: { sessionId },
      include: { answers: { include: { question: { select: { round: true } } } } },
      orderBy: { joinedAt: 'asc' }
    });
  }

  async function emitLeaderboard(sessionId, sessionCode) {
    const participants = await prisma.participant.findMany({ where: { sessionId }, include: { answers: true } });
    io.to(sessionCode).emit(SOCKET_EVENTS.LEADERBOARD_UPDATE, { leaderboard: calculateRankings(participants) });
  }

  // One scored answer per group per question; a repeat is ignored.
  async function recordAnswer({ participantId, questionId, answer, isCorrect, points }) {
    try {
      await prisma.$transaction([
        prisma.answer.create({ data: { participantId, questionId, answer: String(answer ?? ''), isCorrect, points } }),
        prisma.participant.update({ where: { id: participantId }, data: { score: { increment: points } } })
      ]);
      return true;
    } catch (e) {
      if (e.code === 'P2002') return false;
      throw e;
    }
  }

  async function revealResults(sessionId, sessionCode, question) {
    const c = sessions.get(sessionId);
    clearTimer(c);
    c?.state.finish();
    const answers = await prisma.answer.findMany({ where: { questionId: question.id, participant: { sessionId } }, include: { participant: { select: { name: true } } } });
    const correct = answers.filter((a) => a.isCorrect).map((a) => a.participant.name);
    const wrong = answers.filter((a) => !a.isCorrect).map((a) => a.participant.name);
    io.to(sessionCode).emit(SOCKET_EVENTS.SHOW_RESULTS, {
      correctAnswer: question.correctAnswer,
      correctCount: correct.length,
      incorrectCount: wrong.length,
      correctNames: correct,
      incorrectNames: wrong,
      totalAnswers: answers.length,
      correctPercentage: answers.length ? Math.round((correct.length / answers.length) * 100) : 0,
      clues: question.type === 'CLUE' ? question.clues : undefined
    });
  }

  function updateCache(sessionCode, patch) {
    const cur = activeSessions.get(sessionCode);
    if (cur?.currentQuestion) activeSessions.set(sessionCode, { ...cur, currentQuestion: { ...cur.currentQuestion, ...patch.question }, ...patch.extra });
  }

  // ---- DIRECTED turn resolution -----------------------------------------
  async function startTurnTimer(c, sessionId, sessionCode, question, seconds) {
    clearTimer(c);
    const qid = question.id;
    c.timer = setTimeout(() => {
      c.timer = null;
      if (c.state.current?.questionId === qid && !c.state.current.done) {
        resolveTurn({ sessionId, sessionCode, question, isCorrect: false, timedOut: true }).catch((e) => console.error('[Competition] timeout:', e.message));
      }
    }, seconds * 1000);
  }

  async function resolveTurn({ sessionId, sessionCode, question, isCorrect, answer, timedOut = false }) {
    const c = sessions.get(sessionId);
    const turn = c?.state.turn();
    if (!turn || c.state.current.done) return;
    clearTimer(c);
    const cfg = c.state.current.cfg;
    const points = timedOut ? 0 : directedPoints({ attempt: turn.attempt, isCorrect, points: question.points, negativePoints: question.negativePoints, passPercent: cfg.passPercent });
    if (!timedOut) {
      await recordAnswer({ participantId: turn.participantId, questionId: question.id, answer, isCorrect, points });
    }
    for (const s of socketsOf(sessionId, turn.participantId)) {
      s.emit(SOCKET_EVENTS.ANSWER_RECEIVED, { isCorrect, points, correctAnswer: isCorrect ? question.correctAnswer : undefined, timedOut });
    }
    io.to(sessionCode).emit(SOCKET_EVENTS.TURN_RESULT, { questionId: question.id, participantId: turn.participantId, name: turn.name, attempt: turn.attempt, isCorrect, points, timedOut });
    await emitLeaderboard(sessionId, sessionCode);

    if (isCorrect) return revealResults(sessionId, sessionCode, question);
    const next = c.state.pass();
    if (!next) return revealResults(sessionId, sessionCode, question);

    const seconds = cfg.passTimeLimit || Math.max(5, Math.ceil((question.timeLimit || 20) / 2));
    const startTime = Date.now();
    const passPoints = directedPoints({ attempt: next.attempt, isCorrect: true, points: question.points, passPercent: cfg.passPercent });
    io.to(sessionCode).emit(SOCKET_EVENTS.TURN_PASSED, { questionId: question.id, turn: { ...next, points: passPoints }, timeLimit: seconds, startTime });
    updateCache(sessionCode, { question: { turn: { ...next, points: passPoints }, timeLimit: seconds, readingTime: 0 }, extra: { startTime } });
    startTurnTimer(c, sessionId, sessionCode, question, seconds);
  }

  // ---- hooks called from server.js ---------------------------------------
  return {
    async mode(sessionId) { return (await load(sessionId)).mode; },

    /** Next question chosen: add competition info to the payload, start turn/clue state. */
    async onQuestionStart({ sessionId, sessionCode, question, questionData }) {
      const c = await load(sessionId);
      clearTimer(c);
      c.state.clear();
      questionData.mode = c.mode;
      if (c.mode !== 'TEAMS') return { buzzer: null };
      const cfg = cfgFor(c, question.round);
      questionData.format = cfg.format;
      questionData.roundName = cfg.name;
      questionData.category = question.category || null;

      if (cfg.format === FORMATS.DIRECTED) {
        const groups = (await prisma.participant.findMany({ where: { sessionId, eliminatedAt: null }, orderBy: { joinedAt: 'asc' }, select: { id: true, name: true } }));
        const turn = c.state.startDirected(question, groups, cfg);
        if (turn) {
          turn.points = question.points;
          questionData.turn = turn;
          startTurnTimer(c, sessionId, sessionCode, question, (question.timeLimit || 30) + (question.readingTime || 0));
        }
        return { buzzer: false };
      }
      if (cfg.format === FORMATS.CLUE) {
        const clue = c.state.startClue(question, cfg);
        questionData.clues = (question.clues || []).slice(0, 1);
        questionData.cluesTotal = clue.total;
        questionData.cluePoints = (question.clues || []).map((_, i) => cluePointsFor(question, i + 1));
        questionData.pointsNow = cluePointsFor(question, 1);
        return { buzzer: true };
      }
      return { buzzer: null }; // BUZZER / ALL: default behaviour
    },

    /** Returns true when the answer was handled here (directed turn). */
    async onSubmitAnswer(socket, data) {
      const { sessionId, sessionCode, participantId } = socket.data;
      const c = await load(sessionId);
      const cur = c.state.current;
      if (c.mode !== 'TEAMS' || !cur || cur.format !== FORMATS.DIRECTED || cur.questionId !== data?.questionId) return false;
      if (cur.done) { socket.emit(SOCKET_EVENTS.ERROR, { message: 'This question is over' }); return true; }
      if (cur.target.id !== participantId) { socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not your turn' }); return true; }
      const question = await prisma.question.findUnique({ where: { id: cur.questionId } });
      const isCorrect = (question.options?.length ? data.answer === question.correctAnswer : false) || answersMatch(data.answer, question.correctAnswer);
      await resolveTurn({ sessionId, sessionCode, question, isCorrect, answer: data.answer });
      return true;
    },

    /** Host pressed "Show answer": stop any running turn. */
    async onShowResults(sessionId) {
      const c = await load(sessionId);
      clearTimer(c);
      c.state.finish();
    },

    isClueInPlay(sessionId) {
      const c = sessions.get(sessionId);
      return Boolean(c && c.mode === 'TEAMS' && c.state.current?.format === FORMATS.CLUE && !c.state.current.done);
    },

    /** Sync version for the buzzer hot path (uses already-loaded state). */
    isBuzzBlockedSync(sessionId, participantId, socket) {
      if (socket?.data?.eliminated) return true;
      const c = sessions.get(sessionId);
      return Boolean(c && c.mode === 'TEAMS' && c.state.isLockedOut(participantId));
    },

    /** Eliminated or locked-out groups cannot buzz. */
    async isBuzzBlocked(sessionId, participantId, socket) {
      if (socket?.data?.eliminated) return true;
      const c = await load(sessionId);
      return c.mode === 'TEAMS' && c.state.isLockedOut(participantId);
    },

    /** Extra payload for ROUND_ENDED: round scores, toppers, elimination. */
    async onRoundEnded(sessionId, round) {
      const c = await load(sessionId);
      if (c.mode !== 'TEAMS') return {};
      const cfg = cfgFor(c, round);
      c.lastRoundEnded = round;
      const groups = await groupsWithAnswers(sessionId);
      const summary = roundSummary(groups, round);
      const already = groups.filter((g) => g.eliminatedRound === round).map((g) => g.id);
      const remaining = Math.max(0, cfg.eliminate - already.length);
      const elim = remaining > 0 ? eliminationCandidates(groups, remaining) : { candidates: [], tied: [] };
      return {
        mode: 'TEAMS',
        roundName: cfg.name,
        summary,
        elimination: cfg.eliminate > 0 ? { count: cfg.eliminate, done: already, remaining, ...elim } : null
      };
    },

    /** Final standings for the end screen. */
    async finalSummary(sessionId) {
      const c = await load(sessionId);
      if (c.mode !== 'TEAMS') return null;
      const groups = await groupsWithAnswers(sessionId);
      const rounds = [...c.roundTypes.keys()].sort((a, b) => a - b);
      return {
        rounds: rounds.map((r) => ({ round: r, name: cfgFor(c, r).name, toppers: roundSummary(groups, r).toppers })),
        eliminated: groups.filter((g) => g.eliminatedAt).map((g) => ({ id: g.id, name: g.name, round: g.eliminatedRound }))
      };
    },

    /** Host-only competition controls. */
    register(socket) {
      const hostOnly = (fn) => async (data = {}) => {
        if (socket.data.role !== 'host') { socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can do that' }); return; }
        try { await fn(data); } catch (e) { console.error('[Competition]', e); socket.emit(SOCKET_EVENTS.ERROR, { message: e.message || 'Competition action failed' }); }
      };

      // Host marks the current directed turn (oral answers) or the clue-round buzz winner.
      socket.on(SOCKET_EVENTS.MARK_TURN, hostOnly(async ({ questionId, isCorrect }) => {
        const { sessionId, sessionCode } = socket.data;
        const c = await load(sessionId);
        const cur = c.state.current;
        if (!cur || cur.questionId !== questionId || cur.done) throw new Error('Nothing to mark');
        const question = await prisma.question.findUnique({ where: { id: questionId } });

        if (cur.format === FORMATS.DIRECTED) {
          return resolveTurn({ sessionId, sessionCode, question, isCorrect: Boolean(isCorrect), answer: isCorrect ? question.correctAnswer : 'Marked wrong by host' });
        }
        if (cur.format === FORMATS.CLUE) {
          const bm = getBuzzerManager(sessionId);
          const winner = bm.firstBuzzer?.participantId;
          if (!winner) throw new Error('Nobody has buzzed yet');
          const points = isCorrect ? cluePointsFor(question, cur.revealed) : -Math.abs(question.negativePoints || 0);
          await recordAnswer({ participantId: winner, questionId, answer: isCorrect ? question.correctAnswer : 'Marked wrong by host', isCorrect: Boolean(isCorrect), points });
          bm.markAnswered();
          for (const s of socketsOf(sessionId, winner)) s.emit(SOCKET_EVENTS.ANSWER_RECEIVED, { isCorrect: Boolean(isCorrect), points });
          io.to(sessionCode).emit(SOCKET_EVENTS.TURN_RESULT, { questionId, participantId: winner, name: bm.firstBuzzer.participantName, isCorrect: Boolean(isCorrect), points, clue: cur.revealed });
          await emitLeaderboard(sessionId, sessionCode);
          if (isCorrect) return revealResults(sessionId, sessionCode, question);

          // Wrong: that group is out of this question; reopen the buzzer for the rest.
          c.state.lockOut(winner);
          const active = await prisma.participant.findMany({ where: { sessionId, eliminatedAt: null }, select: { id: true } });
          const left = active.filter((g) => !c.state.isLockedOut(g.id));
          if (!left.length) return revealResults(sessionId, sessionCode, question);
          io.to(sessionCode).emit(SOCKET_EVENTS.CLUE_REOPENED, { questionId, lockedOut: [...cur.lockedOut] });
          startBuzzerRound({ sessionId, sessionCode, questionId, readingTimeSec: 0, tenantId: null });
          return;
        }
        throw new Error('Use the buzzer marking buttons for this round');
      }));

      // Host reveals the next clue (points drop).
      socket.on(SOCKET_EVENTS.REVEAL_CLUE, hostOnly(async ({ questionId }) => {
        const { sessionId, sessionCode } = socket.data;
        const c = await load(sessionId);
        if (c.state.current?.questionId !== questionId) throw new Error('That question is not in play');
        const r = c.state.revealClue();
        if (!r) return;
        const question = await prisma.question.findUnique({ where: { id: questionId } });
        const payload = { questionId, revealed: r.revealed, total: r.total, clues: (question.clues || []).slice(0, r.revealed), pointsNow: cluePointsFor(question, r.revealed) };
        io.to(sessionCode).emit(SOCKET_EVENTS.CLUE_REVEALED, payload);
        updateCache(sessionCode, { question: { clues: payload.clues, pointsNow: payload.pointsNow } });
      }));

      // Host confirms elimination at the end of a round.
      socket.on(SOCKET_EVENTS.ELIMINATE_GROUP, hostOnly(async ({ participantIds }) => {
        const { sessionId, sessionCode } = socket.data;
        const c = await load(sessionId);
        const ids = Array.isArray(participantIds) ? participantIds : [];
        if (!ids.length) throw new Error('Pick a group to eliminate');
        const round = c.lastRoundEnded;
        const groups = await prisma.participant.findMany({ where: { sessionId, id: { in: ids }, eliminatedAt: null } });
        const activeCount = await prisma.participant.count({ where: { sessionId, eliminatedAt: null } });
        if (activeCount - groups.length < 1) throw new Error('At least one group must stay in');
        await prisma.participant.updateMany({ where: { id: { in: groups.map((g) => g.id) } }, data: { eliminatedAt: new Date(), eliminatedRound: round } });
        for (const g of groups) for (const s of socketsOf(sessionId, g.id)) s.data.eliminated = true;
        io.to(sessionCode).emit(SOCKET_EVENTS.GROUP_ELIMINATED, { round, groups: groups.map((g) => ({ id: g.id, name: g.name })) });
        await emitLeaderboard(sessionId, sessionCode);
      }));
    },

    forget(sessionId) { const c = sessions.get(sessionId); clearTimer(c); sessions.delete(sessionId); },
    invalidate(sessionId) { this.forget(sessionId); }
  };
}
