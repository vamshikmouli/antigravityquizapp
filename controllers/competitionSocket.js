import { SOCKET_EVENTS } from '../shared/constants.js';
import { calculateRankings } from '../shared/utils.js';
import {
  FORMATS, roundConfig, answersMatch, directedPoints, cluePointsFor,
  CompetitionState, roundSummary, eliminationCandidates, planDirectedRound, eliminationAllowance
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
      select: { quiz: { select: { mode: true, roundSettings: true } }, questions: { orderBy: { order: 'asc' }, select: { question: { select: { id: true, round: true, type: true, category: true } } } } }
    });
    const roundTypes = new Map();
    const roundQuestions = new Map(); // round -> [{ id, category }] in play order
    for (const { question } of s?.questions || []) {
      if (!roundTypes.has(question.round)) { roundTypes.set(question.round, []); roundQuestions.set(question.round, []); }
      roundTypes.get(question.round).push(question.type);
      roundQuestions.get(question.round).push({ id: question.id, category: question.category });
    }
    c = {
      mode: s?.quiz?.mode === 'TEAMS' ? 'TEAMS' : 'CLASSIC',
      settings: Array.isArray(s?.quiz?.roundSettings) ? s.quiz.roundSettings : [],
      roundTypes,
      roundQuestions,
      state: new CompetitionState(),
      timer: null,
      lastRoundEnded: null,
      roundGroups: new Map(), // round -> groups playing it (fixed when the round starts)
      skipped: new Set()      // question ids passed over so groups get equal turns
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

  const activeCount = (sessionId) => prisma.participant.count({ where: { sessionId, eliminatedAt: null } });

  /** Groups playing a DIRECTED round, fixed at its first question. */
  async function groupsForRound(c, sessionId, round) {
    if (!c.roundGroups.has(round)) c.roundGroups.set(round, await activeCount(sessionId));
    return c.roundGroups.get(round);
  }

  /** Which questions of a directed round are played (see planDirectedRound). */
  function roundPlan(c, round, groups) {
    const p = planDirectedRound(c.roundQuestions.get(round) || [], groups);
    return { groups, total: p.total, playing: p.playing, perGroup: p.perGroup, bySubject: p.bySubject, subjects: p.subjects, ids: p.ids };
  }

  async function namesByResult(sessionId, questionId) {
    const answers = await prisma.answer.findMany({ where: { questionId, participant: { sessionId } }, include: { participant: { select: { name: true } } } });
    return {
      correctNames: answers.filter((a) => a.isCorrect).map((a) => a.participant.name),
      incorrectNames: answers.filter((a) => !a.isCorrect).map((a) => a.participant.name)
    };
  }

  async function revealResults(sessionId, sessionCode, question) {
    const c = sessions.get(sessionId);
    if (c) c.currentRevealed = true;
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

  /** Questions already shown in this session, in order, with the current one flagged. */
  async function playedQuestions(sessionId) {
    const s = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { currentQuestionIndex: true, questions: { orderBy: { order: 'asc' }, select: { question: { select: { id: true, text: true, round: true, type: true, points: true, negativePoints: true, correctAnswer: true } } } } }
    });
    const n = Math.min(s?.currentQuestionIndex || 0, s?.questions.length || 0);
    const skipped = sessions.get(sessionId)?.skipped || new Set();
    const shown = (s?.questions || []).slice(0, n).map((x, i) => ({ ...x.question, number: i + 1 })).filter((q) => !skipped.has(q.id));
    return shown.map((q, i) => ({ ...q, isCurrent: i === shown.length - 1 }));
  }

  // ---- hooks called from server.js ---------------------------------------
  const this_ = {
    async mode(sessionId) { return (await load(sessionId)).mode; },

    /** Next question chosen: add competition info to the payload, start turn/clue state. */
    async onQuestionStart({ sessionId, sessionCode, question, questionData }) {
      const c = await load(sessionId);
      clearTimer(c);
      c.state.clear();
      c.currentRevealed = false;
      questionData.mode = c.mode;
      const cfg = cfgFor(c, question.round);
      // A clue question always goes clue by clue (any mode, any round format):
      // showing every clue at once would give the answer away.
      const isClue = question.type === 'CLUE';
      if (c.mode === 'TEAMS') {
        questionData.format = isClue ? FORMATS.CLUE : cfg.format;
        questionData.roundName = cfg.name;
        questionData.category = question.category || null;
      }
      if (isClue) {
        const clue = c.state.startClue(question, cfg);
        questionData.clues = (question.clues || []).slice(0, 1);
        questionData.cluesTotal = clue.total;
        questionData.cluePoints = (question.clues || []).map((_, i) => cluePointsFor(question, i + 1));
        questionData.pointsNow = cluePointsFor(question, 1);
        return { buzzer: true };
      }
      if (c.mode !== 'TEAMS') return { buzzer: null };

      if (cfg.format === FORMATS.DIRECTED) {
        const groups = (await prisma.participant.findMany({ where: { sessionId, eliminatedAt: null }, orderBy: { joinedAt: 'asc' }, select: { id: true, name: true } }));
        const { ids, ...plan } = roundPlan(c, question.round, await groupsForRound(c, sessionId, question.round));
        questionData.roundPlan = plan;
        const turn = c.state.startDirected(question, groups, cfg);
        if (turn) {
          turn.points = question.points;
          questionData.turn = turn;
          startTurnTimer(c, sessionId, sessionCode, question, (question.timeLimit || 30) + (question.readingTime || 0));
        }
        return { buzzer: false };
      }
      return { buzzer: null }; // BUZZER / ALL: default behaviour
    },

    /**
     * Index of the next question to play. In a DIRECTED round every group gets
     * the same number of turns — one per subject when the questions have
     * subjects — and the questions that don't fit are skipped.
     */
    async nextPlayableIndex(sessionId, questions, index) {
      const c = await load(sessionId);
      if (c.mode !== 'TEAMS') return index;
      let i = index;
      while (i < questions.length) {
        const q = questions[i].question;
        if (cfgFor(c, q.round).format !== FORMATS.DIRECTED) return i;
        const { ids } = roundPlan(c, q.round, await groupsForRound(c, sessionId, q.round));
        if (ids.has(q.id)) return i;
        c.skipped.add(q.id);
        i += 1;
      }
      return i;
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
      c.currentRevealed = true;
      clearTimer(c);
      c.state.finish();
    },

    isClueInPlay(sessionId) {
      const c = sessions.get(sessionId);
      return Boolean(c && c.state.current?.format === FORMATS.CLUE && !c.state.current.done);
    },

    /** Sync version for the buzzer hot path (uses already-loaded state). */
    isBuzzBlockedSync(sessionId, participantId, socket) {
      if (socket?.data?.eliminated) return true;
      const c = sessions.get(sessionId);
      return Boolean(c && c.state.isLockedOut(participantId)); // only clue questions lock anyone out
    },

    /** Eliminated or locked-out groups cannot buzz. */
    async isBuzzBlocked(sessionId, participantId, socket) {
      if (socket?.data?.eliminated) return true;
      const c = await load(sessionId);
      return c.state.isLockedOut(participantId);
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
      const active = groups.filter((g) => !g.eliminatedAt).length;
      const wanted = Math.max(0, cfg.eliminate - already.length);
      // Formats are planned for a number of groups; with fewer, at least 2 stay in.
      const remaining = eliminationAllowance(active, wanted);
      const elim = remaining > 0 ? eliminationCandidates(groups, remaining) : { candidates: [], tied: [] };
      const count = already.length + remaining;
      return {
        mode: 'TEAMS',
        roundName: cfg.name,
        summary,
        elimination: count > 0 ? { count, done: already, remaining, ...elim } : null,
        eliminationSkipped: cfg.eliminate > 0 && remaining < wanted ? { requested: cfg.eliminate, groupsLeft: active } : null
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

      // Host opens "Fix marks": played questions and each group's mark for one of them.
      socket.on(SOCKET_EVENTS.GET_MARKS, async (data = {}, callback) => {
        const reply = typeof callback === 'function' ? callback : () => {};
        if (socket.data.role !== 'host') return reply({ error: 'Only the host can do that' });
        try {
          const { sessionId } = socket.data;
          const played = await playedQuestions(sessionId);
          if (!played.length) return reply({ questions: [], rows: [] });
          const q = played.find((x) => x.id === data.questionId) || played[played.length - 1];
          const groups = await prisma.participant.findMany({ where: { sessionId }, orderBy: { joinedAt: 'asc' }, include: { answers: { where: { questionId: q.id } } } });
          reply({
            questions: played.map(({ id, number, round, text }) => ({ id, number, round, text })),
            question: q,
            rows: groups.map((g) => ({
              participantId: g.id, name: g.name, eliminated: Boolean(g.eliminatedAt),
              answered: g.answers.length > 0, isCorrect: g.answers[0]?.isCorrect ?? null,
              points: g.answers[0]?.points ?? 0, answer: g.answers[0]?.answer ?? null
            }))
          });
        } catch (e) { console.error('[Competition] get-marks:', e); reply({ error: 'Could not load marks' }); }
      });

      // Host fixes a mark: set one group's result and points for a played question.
      socket.on(SOCKET_EVENTS.CORRECT_MARK, hostOnly(async ({ questionId, participantId, isCorrect, points }) => {
        const { sessionId, sessionCode } = socket.data;
        const q = (await playedQuestions(sessionId)).find((x) => x.id === questionId);
        if (!q) throw new Error('That question has not been played yet');
        const group = await prisma.participant.findFirst({ where: { id: participantId, sessionId } });
        if (!group) throw new Error('Group not found');
        const pts = Number.parseInt(points, 10);
        if (!Number.isFinite(pts) || Math.abs(pts) > 1000) throw new Error('Points must be a number between -1000 and 1000');

        const existing = await prisma.answer.findUnique({ where: { participantId_questionId: { participantId, questionId } } });
        const c = await load(sessionId);
        // Adding a mark for a group that has none would block its real answer,
        // so on the question in play that waits until the answer is shown.
        if (!existing && q.isCurrent && !c.currentRevealed) throw new Error('Show the answer first, then fix marks for this question');

        const delta = pts - (existing?.points ?? 0);
        await prisma.$transaction([
          existing
            ? prisma.answer.update({ where: { id: existing.id }, data: { isCorrect: Boolean(isCorrect), points: pts } })
            : prisma.answer.create({ data: { participantId, questionId, answer: 'Marked by host', isCorrect: Boolean(isCorrect), points: pts } }),
          prisma.participant.update({ where: { id: participantId }, data: { score: { increment: delta } } })
        ]);

        io.to(sessionCode).emit(SOCKET_EVENTS.MARKS_CORRECTED, {
          questionId, participantId, name: group.name, isCorrect: Boolean(isCorrect), points: pts, delta,
          ...(await namesByResult(sessionId, questionId))
        });
        await emitLeaderboard(sessionId, sessionCode);
        // Between rounds: refresh the round summary (and elimination candidates).
        if (c.mode === 'TEAMS' && c.lastRoundEnded === q.round) {
          io.to(sessionCode).emit(SOCKET_EVENTS.ROUND_SUMMARY_UPDATED, { round: q.round, ...(await this_.onRoundEnded(sessionId, q.round)) });
        }
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
  return this_;
}
