import jwt from 'jsonwebtoken';

// Maps the trusted `source` of an SSO request to its signing secret (env var name)
// and the authProvider recorded on the resulting quiz-app user.
export const SSO_SOURCES = {
  jdv: { secretEnv: 'QUIZ_SSO_SECRET_JDV', authProvider: 'SSO_JDV' },
  classo: { secretEnv: 'QUIZ_SSO_SECRET_CLASSO', authProvider: 'SSO_CLASSO' }
};

// Maximum accepted lifetime of an inbound SSO token (iat → exp), plus a little
// clock-skew tolerance. Host apps must mint short-lived tokens (<= ~5 min).
export const SSO_MAX_TOKEN_AGE_SECONDS = 5 * 60;
export const SSO_CLOCK_SKEW_SECONDS = 30;

/**
 * Error with an attached HTTP status so the route can translate it directly.
 * status 401 = client / token problem; status 500 = server misconfiguration.
 */
export class SsoError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'SsoError';
    this.status = status;
  }
}

/**
 * Pure (no DB, no network) verification of an inbound SSO token.
 *
 * Validates the source, loads the matching shared secret from `env`, verifies the
 * HS256 signature + expiry + max-age, and enforces our claim requirements
 * (role=host, bounded lifetime, tenantId + sub present).
 *
 * @param {string} token   The HS256 JWT minted by the host app.
 * @param {string} source  'jdv' | 'classo'.
 * @param {object} [opts]
 * @param {object} [opts.env]  Environment map to read the secret from (default process.env).
 * @returns {{ claims: object, authProvider: string }}
 * @throws {SsoError} on any invalid/expired/bad-source token, or 500 if misconfigured.
 */
export function verifySsoToken(token, source, { env = process.env } = {}) {
  if (!token || !source) {
    throw new SsoError(401, 'SSO token and source are required');
  }

  const sourceConfig = SSO_SOURCES[source];
  if (!sourceConfig) {
    throw new SsoError(401, 'Unknown SSO source');
  }

  const ssoSecret = env[sourceConfig.secretEnv];
  if (!ssoSecret) {
    // Otherwise-valid source, but the server isn't configured for it. Not a client error.
    throw new SsoError(500, 'SSO is not configured for this source');
  }

  let claims;
  try {
    claims = jwt.verify(token, ssoSecret, {
      algorithms: ['HS256'],
      maxAge: SSO_MAX_TOKEN_AGE_SECONDS + SSO_CLOCK_SKEW_SECONDS
    });
  } catch (err) {
    throw new SsoError(401, 'Invalid or expired SSO token');
  }

  // Defence in depth: reject tokens claiming an excessively long lifetime even if
  // still within it.
  if (typeof claims.iat === 'number' && typeof claims.exp === 'number') {
    if (claims.exp - claims.iat > SSO_MAX_TOKEN_AGE_SECONDS + SSO_CLOCK_SKEW_SECONDS) {
      throw new SsoError(401, 'SSO token lifetime exceeds allowed window');
    }
  }

  if (claims.role !== 'host') {
    throw new SsoError(401, 'SSO token role must be host');
  }

  if (!claims.tenantId || !claims.sub) {
    throw new SsoError(401, 'SSO token missing tenantId or sub');
  }

  return { claims, authProvider: sourceConfig.authProvider };
}
