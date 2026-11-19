/**
 * Multi-tenant scoping helpers (Phase 2).
 *
 * The product model is STRICT PER-TEACHER ownership: every quiz/question/session
 * belongs to a single owner and only that owner can see or change it. Tenant is a
 * hard isolation boundary layered ON TOP of ownership as defense-in-depth — if an
 * ownerId filter is ever missed, the tenant filter still contains the blast radius
 * to a single tenant.
 *
 * `req.user` comes from the session JWT, which (Phase 2) carries { id, tenantId,
 * schoolId }. tenantId/schoolId are null for standalone EMAIL users and set for
 * SSO users. Tokens issued before Phase 2 won't carry the claim at all
 * (undefined) — in that case we fall back to owner-only scoping so we never hide
 * a user's own rows.
 */

/**
 * Prisma `where` fragment selecting rows owned by this user, scoped to their tenant.
 * Ownership is the primary authorization; tenant is added only when the token
 * actually carries a tenant claim.
 */
export function ownerScope(user) {
  const where = { ownerId: user.id };
  if (user.tenantId !== undefined) {
    where.tenantId = user.tenantId; // may be null (EMAIL user) — matches null-tenant rows
  }
  return where;
}

/**
 * Same as ownerScope but for Sessions, which key ownership on `hostId`.
 */
export function hostScope(user) {
  const where = { hostId: user.id };
  if (user.tenantId !== undefined) {
    where.tenantId = user.tenantId;
  }
  return where;
}

/**
 * Prisma `data` fragment stamping tenant/school onto a newly created resource,
 * denormalized from the creating user.
 */
export function tenantStamp(user) {
  return {
    tenantId: user.tenantId ?? null,
    schoolId: user.schoolId ?? null
  };
}

/**
 * The claims we embed in a quiz-app session JWT, derived from a user record.
 * Keep in sync with what authenticateToken exposes as req.user.
 */
export function sessionClaims(user) {
  return {
    id: user.id,
    tenantId: user.tenantId ?? null,
    schoolId: user.schoolId ?? null
  };
}
