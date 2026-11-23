import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerScope, hostScope, tenantStamp, sessionClaims } from '../controllers/scope.js';

// Pure unit tests for the multi-tenant scoping helpers (Phase 2). The subtle part
// is the undefined-vs-null distinction: a token that carries no tenant claim
// (undefined) must fall back to owner-only scoping, while a present null claim
// (EMAIL user) must actively filter to null-tenant rows.

test('ownerScope: SSO user filters by ownerId AND tenantId', () => {
  assert.deepEqual(
    ownerScope({ id: 'u1', tenantId: 'T', schoolId: 'S' }),
    { ownerId: 'u1', tenantId: 'T' }
  );
});

test('ownerScope: EMAIL user (tenantId null) filters by ownerId AND tenantId:null', () => {
  assert.deepEqual(
    ownerScope({ id: 'u1', tenantId: null }),
    { ownerId: 'u1', tenantId: null }
  );
});

test('ownerScope: legacy token (no tenant claim) falls back to owner-only', () => {
  assert.deepEqual(ownerScope({ id: 'u1' }), { ownerId: 'u1' });
});

test('hostScope mirrors ownerScope but keys on hostId', () => {
  assert.deepEqual(hostScope({ id: 'u1', tenantId: 'T' }), { hostId: 'u1', tenantId: 'T' });
  assert.deepEqual(hostScope({ id: 'u1', tenantId: null }), { hostId: 'u1', tenantId: null });
  assert.deepEqual(hostScope({ id: 'u1' }), { hostId: 'u1' });
});

test('tenantStamp: coerces missing tenant/school to null', () => {
  assert.deepEqual(tenantStamp({ id: 'u1', tenantId: 'T', schoolId: 'S' }), { tenantId: 'T', schoolId: 'S' });
  assert.deepEqual(tenantStamp({ id: 'u1' }), { tenantId: null, schoolId: null });
});

test('sessionClaims: embeds id + tenant context (null when absent)', () => {
  assert.deepEqual(
    sessionClaims({ id: 'u1', tenantId: 'T', schoolId: 'S', email: 'x@y.z' }),
    { id: 'u1', tenantId: 'T', schoolId: 'S' }
  );
  assert.deepEqual(sessionClaims({ id: 'u1' }), { id: 'u1', tenantId: null, schoolId: null });
});
