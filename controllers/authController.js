import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
// JWT_SECRET must be set in the environment. server.js refuses to boot if it is unset,
// so there is deliberately no insecure fallback here.
const JWT_SECRET = process.env.JWT_SECRET;

// Maps the trusted `source` of an SSO request to its signing secret and the
// authProvider recorded on the resulting quiz-app user.
const SSO_SOURCES = {
  jdv: { secretEnv: 'QUIZ_SSO_SECRET_JDV', authProvider: 'SSO_JDV' },
  classo: { secretEnv: 'QUIZ_SSO_SECRET_CLASSO', authProvider: 'SSO_CLASSO' }
};

// Maximum accepted lifetime of an inbound SSO token (iat → exp), with a little
// clock-skew tolerance. Host apps must mint short-lived tokens (<= ~5 min).
const SSO_MAX_TOKEN_AGE_SECONDS = 5 * 60;
const SSO_CLOCK_SKEW_SECONDS = 30;

/**
 * Register a new user
 */
export async function register(req, res) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name
      }
    });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Login user
 */
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

/**
 * SSO login from a trusted host app (JDV / Classo).
 *
 * Body: { token, source }  where source ∈ { 'jdv', 'classo' }
 *
 * The `token` is an HS256 JWT minted by the host app and signed with the
 * secret shared with this quiz app (QUIZ_SSO_SECRET_JDV / QUIZ_SSO_SECRET_CLASSO).
 * Expected claims:
 *   { iss, tenantId, schoolId, sub, name, email?, role:'host', iat, exp }
 * with a short lifetime (<= ~5 min).
 *
 * On success we UPSERT a quiz-app User keyed by (tenantId, externalId=sub) and
 * return a quiz-app session JWT in the SAME shape authenticateToken consumes
 * today (jwt.sign({ id: user.id }, JWT_SECRET)).
 *
 * Any invalid / expired / bad-source token → 401.
 */
export async function ssoLogin(req, res) {
  try {
    const { token, source } = req.body || {};

    if (!token || !source) {
      return res.status(401).json({ error: 'SSO token and source are required' });
    }

    const sourceConfig = SSO_SOURCES[source];
    if (!sourceConfig) {
      // Unknown / untrusted source.
      return res.status(401).json({ error: 'Unknown SSO source' });
    }

    const ssoSecret = process.env[sourceConfig.secretEnv];
    if (!ssoSecret) {
      // Server is misconfigured for this (otherwise valid) source. This is not a
      // client error, so surface it as 500 rather than 401.
      console.error(`SSO error: ${sourceConfig.secretEnv} is not configured`);
      return res.status(500).json({ error: 'SSO is not configured for this source' });
    }

    // Verify signature + algorithm + expiry. `maxAge` additionally rejects tokens
    // whose iat is older than the allowed window, independent of a generous exp.
    let claims;
    try {
      claims = jwt.verify(token, ssoSecret, {
        algorithms: ['HS256'],
        maxAge: SSO_MAX_TOKEN_AGE_SECONDS + SSO_CLOCK_SKEW_SECONDS
      });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired SSO token' });
    }

    // Defence in depth: reject tokens that claim an excessively long lifetime even
    // if they are still within it.
    if (typeof claims.iat === 'number' && typeof claims.exp === 'number') {
      if (claims.exp - claims.iat > SSO_MAX_TOKEN_AGE_SECONDS + SSO_CLOCK_SKEW_SECONDS) {
        return res.status(401).json({ error: 'SSO token lifetime exceeds allowed window' });
      }
    }

    if (claims.role !== 'host') {
      return res.status(401).json({ error: 'SSO token role must be host' });
    }

    const tenantId = claims.tenantId;
    const externalId = claims.sub;
    if (!tenantId || !externalId) {
      return res.status(401).json({ error: 'SSO token missing tenantId or sub' });
    }

    const name = claims.name || null;
    const email = claims.email || null;
    const schoolId = claims.schoolId || null;

    // Upsert the quiz-app user for this SSO identity.
    const user = await prisma.user.upsert({
      where: { tenantId_externalId: { tenantId, externalId } },
      update: {
        name,
        schoolId,
        authProvider: sourceConfig.authProvider,
        ...(email ? { email } : {})
      },
      create: {
        tenantId,
        externalId,
        schoolId,
        name,
        authProvider: sourceConfig.authProvider,
        // Email must be unique & non-null in our schema; synthesize a stable
        // placeholder when the host app does not provide one.
        email: email || `${source}_${tenantId}_${externalId}@sso.local`
      }
    });

    // Issue a quiz-app session token identical in shape to login/register.
    const sessionToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        schoolId: user.schoolId,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    console.error('SSO login error:', error);
    return res.status(500).json({ error: 'SSO login failed' });
  }
}

/**
 * Get current user
 */
export async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
}
