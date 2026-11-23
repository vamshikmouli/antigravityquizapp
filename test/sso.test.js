import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { verifySsoToken, SsoError, SSO_MAX_TOKEN_AGE_SECONDS } from '../controllers/ssoAuth.js';

// DB-free unit tests for the SSO token verification contract. These exercise the
// signature / source / role / lifetime / required-claim rules without a database
// or a running server, so they are fast and CI-safe.

const JDV_SECRET = 'test-jdv-secret';
const env = { QUIZ_SSO_SECRET_JDV: JDV_SECRET }; // QUIZ_SSO_SECRET_CLASSO intentionally absent

const baseClaims = () => ({
  iss: 'jdv',
  tenantId: 'tenant-1',
  schoolId: 'school-1',
  sub: 'ext-user-1',
  name: 'Test Host',
  email: 'host@example.com',
  role: 'host'
});

const sign = (claims, secret = JDV_SECRET, opts = { algorithm: 'HS256', expiresIn: '3m' }) =>
  jwt.sign(claims, secret, opts);

function expectSsoError(fn, status) {
  try {
    fn();
    assert.fail('expected verifySsoToken to throw');
  } catch (err) {
    assert.ok(err instanceof SsoError, `expected SsoError, got ${err?.name}: ${err?.message}`);
    assert.equal(err.status, status, `expected status ${status}, got ${err.status} (${err.message})`);
  }
}

test('accepts a valid jdv token and returns claims + authProvider', () => {
  const token = sign(baseClaims());
  const { claims, authProvider } = verifySsoToken(token, 'jdv', { env });
  assert.equal(authProvider, 'SSO_JDV');
  assert.equal(claims.tenantId, 'tenant-1');
  assert.equal(claims.sub, 'ext-user-1');
  assert.equal(claims.role, 'host');
});

test('rejects missing token or source (401)', () => {
  expectSsoError(() => verifySsoToken('', 'jdv', { env }), 401);
  expectSsoError(() => verifySsoToken(sign(baseClaims()), '', { env }), 401);
});

test('rejects an unknown source (401)', () => {
  expectSsoError(() => verifySsoToken(sign(baseClaims()), 'bogus', { env }), 401);
});

test('returns 500 when the source secret is not configured', () => {
  // classo secret is absent from `env`.
  const token = sign(baseClaims(), 'whatever');
  expectSsoError(() => verifySsoToken(token, 'classo', { env }), 500);
});

test('rejects a bad signature (401)', () => {
  const token = sign(baseClaims(), 'wrong-secret');
  expectSsoError(() => verifySsoToken(token, 'jdv', { env }), 401);
});

test('rejects a non-HS256 algorithm (401)', () => {
  // "none" alg token must not be accepted.
  const token = jwt.sign(baseClaims(), null, { algorithm: 'none' });
  expectSsoError(() => verifySsoToken(token, 'jdv', { env }), 401);
});

test('rejects an expired token (401)', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = sign({ ...baseClaims(), iat: now - 600, exp: now - 300 }, JDV_SECRET, { algorithm: 'HS256' });
  expectSsoError(() => verifySsoToken(token, 'jdv', { env }), 401);
});

test('rejects a token whose lifetime exceeds the allowed window (401)', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = sign({ ...baseClaims(), iat: now, exp: now + SSO_MAX_TOKEN_AGE_SECONDS + 3600 }, JDV_SECRET, { algorithm: 'HS256' });
  expectSsoError(() => verifySsoToken(token, 'jdv', { env }), 401);
});

test('rejects role != host (401)', () => {
  expectSsoError(() => verifySsoToken(sign({ ...baseClaims(), role: 'student' }), 'jdv', { env }), 401);
});

test('rejects missing tenantId or sub (401)', () => {
  const { tenantId, ...noTenant } = baseClaims();
  const { sub, ...noSub } = baseClaims();
  expectSsoError(() => verifySsoToken(sign(noTenant), 'jdv', { env }), 401);
  expectSsoError(() => verifySsoToken(sign(noSub), 'jdv', { env }), 401);
});

test('accepts a token without an email (email is optional)', () => {
  const { email, ...noEmail } = baseClaims();
  const { claims } = verifySsoToken(sign(noEmail), 'jdv', { env });
  assert.equal(claims.email, undefined);
});
