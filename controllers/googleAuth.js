import { OAuth2Client } from 'google-auth-library';

/**
 * Standalone Google sign-in (Phase 3).
 *
 * Teachers signing up WITHOUT a host app (JDV/Classo) can authenticate with
 * Google. The browser uses Google Identity Services to obtain an ID token
 * (a JWT "credential"), POSTs it to /api/auth/google, and we verify it here:
 * signature against Google's keys, audience == our client id, issuer, expiry.
 *
 * GOOGLE_CLIENT_ID is the OAuth 2.0 Web client id. It's required for Google
 * login to work; if unset, Google login is simply disabled (not a crash).
 */

export class GoogleAuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GoogleAuthError';
    this.status = status; // 401 = bad credential, 500 = not configured
  }
}

let _client = null;
function clientFor(clientId) {
  if (!_client) _client = new OAuth2Client(clientId);
  return _client;
}

/**
 * Verify a Google ID token and return a normalized profile.
 *
 * @param {string} credential  The Google ID token (JWT) from the browser.
 * @param {string} clientId    Our GOOGLE_CLIENT_ID (also the expected audience).
 * @param {object} [opts]
 * @param {function} [opts.verify]  Test seam: (credential, clientId) => payload.
 *                                  When omitted, google-auth-library verifies for real.
 * @returns {{ sub: string, email: string|null, name: string|null, emailVerified: boolean }}
 * @throws {GoogleAuthError}
 */
export async function verifyGoogleToken(credential, clientId, { verify } = {}) {
  if (!clientId) {
    throw new GoogleAuthError(500, 'Google login is not configured');
  }
  if (!credential) {
    throw new GoogleAuthError(401, 'Google credential is required');
  }

  let payload;
  try {
    if (verify) {
      payload = await verify(credential, clientId);
    } else {
      const ticket = await clientFor(clientId).verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    }
  } catch (err) {
    throw new GoogleAuthError(401, 'Invalid Google credential');
  }

  if (!payload || !payload.sub) {
    throw new GoogleAuthError(401, 'Google credential missing subject');
  }
  // Google sets email_verified=false only for unverified emails; treat missing as verified.
  if (payload.email && payload.email_verified === false) {
    throw new GoogleAuthError(401, 'Google email is not verified');
  }

  return {
    sub: payload.sub,
    email: payload.email || null,
    name: payload.name || null,
    emailVerified: payload.email_verified !== false
  };
}
