/**
 * Buzzer audit trail (Postgres via Prisma). Fire-and-forget from the socket
 * handlers: called AFTER the winner is announced so the database never adds
 * latency to judging. Failures are logged, never thrown into the game flow.
 */

const toInt = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

/** Map one BuzzerManager log entry to a BuzzerPress row. */
export function toAuditRow(entry, { sessionId, questionId, tenantId = null }) {
  return {
    sessionId,
    questionId,
    roundId: entry.roundId,
    participantId: entry.participantId,
    participantName: entry.participantName ?? null,
    claimedMs: toInt(entry.claimedMs ?? entry.reactionMs),
    observedMs: toInt(entry.observedMs),
    rttMs: toInt(entry.rttMs),
    creditMs: toInt(entry.creditMs),
    effectiveMs: toInt(entry.effectiveMs),
    flags: Array.isArray(entry.flags) ? entry.flags : [],
    outcome: entry.outcome || 'LOST',
    tenantId
  };
}

export function createBuzzerAudit(prisma, { logger = console } = {}) {
  return {
    async record(entries, ctx) {
      if (!entries?.length) return 0;
      try {
        const { count } = await prisma.buzzerPress.createMany({
          data: entries.map((e) => toAuditRow(e, ctx))
        });
        return count;
      } catch (err) {
        logger.error('[BuzzerAudit] failed to record presses:', err.message);
        return 0;
      }
    },

    /** Host override: old winner -> OVERRIDDEN, new winner -> WON. */
    async markOverride({ roundId, previousId, newId }) {
      try {
        await prisma.$transaction([
          prisma.buzzerPress.updateMany({
            where: { roundId, participantId: previousId, outcome: 'WON' },
            data: { outcome: 'OVERRIDDEN' }
          }),
          prisma.buzzerPress.updateMany({
            where: { roundId, participantId: newId },
            data: { outcome: 'WON' }
          })
        ]);
      } catch (err) {
        logger.error('[BuzzerAudit] failed to record override:', err.message);
      }
    },

    /** Presses for a session (newest first), for review/tuning. */
    async listForSession(sessionId, { questionId } = {}) {
      return prisma.buzzerPress.findMany({
        where: { sessionId, ...(questionId ? { questionId } : {}) },
        orderBy: [{ createdAt: 'desc' }]
      });
    }
  };
}
