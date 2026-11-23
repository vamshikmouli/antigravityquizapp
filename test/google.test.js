import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyGoogleToken, GoogleAuthError } from '../controllers/googleAuth.js';

// DB-free unit tests for Google ID-token verification. The real signature check
// (google-auth-library -> Google's JWKS) needs a live token, so we inject a fake
// `verify` and test our contract around it: config, required fields, email
// verification, and error mapping.

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const okPayload = { sub: 'google-sub-123', email: 'teacher@example.com', email_verified: true, name: 'Teacher' };
const fakeVerify = (payload) => async () => payload;

async function expectError(fn, status) {
  try {
    await fn();
    assert.fail('expected GoogleAuthError');
  } catch (err) {
    assert.ok(err instanceof GoogleAuthError, `expected GoogleAuthError, got ${err?.name}: ${err?.message}`);
    assert.equal(err.status, status, `expected ${status}, got ${err.status} (${err.message})`);
  }
}

test('verifies a good credential and normalizes the profile', async () => {
  const profile = await verifyGoogleToken('tok', CLIENT_ID, { verify: fakeVerify(okPayload) });
  assert.deepEqual(profile, { sub: 'google-sub-123', email: 'teacher@example.com', name: 'Teacher', emailVerified: true });
});

test('treats missing email_verified as verified', async () => {
  const profile = await verifyGoogleToken('tok', CLIENT_ID, { verify: fakeVerify({ sub: 's1', email: 'a@b.com', name: 'A' }) });
  assert.equal(profile.emailVerified, true);
});

test('500 when GOOGLE_CLIENT_ID is not configured', async () => {
  await expectError(() => verifyGoogleToken('tok', '', { verify: fakeVerify(okPayload) }), 500);
});

test('401 when credential is missing', async () => {
  await expectError(() => verifyGoogleToken('', CLIENT_ID, { verify: fakeVerify(okPayload) }), 401);
});

test('401 when the verifier throws (bad signature / audience / expiry)', async () => {
  const throwing = async () => { throw new Error('bad token'); };
  await expectError(() => verifyGoogleToken('tok', CLIENT_ID, { verify: throwing }), 401);
});

test('401 when the payload has no sub', async () => {
  await expectError(() => verifyGoogleToken('tok', CLIENT_ID, { verify: fakeVerify({ email: 'a@b.com' }) }), 401);
});

test('401 when the email is explicitly unverified', async () => {
  await expectError(
    () => verifyGoogleToken('tok', CLIENT_ID, { verify: fakeVerify({ sub: 's', email: 'a@b.com', email_verified: false }) }),
    401
  );
});
