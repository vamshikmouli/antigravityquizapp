# Quiz App — SSO Token Contract (Phase 1)

This document defines the trust contract that lets the **JDV** (Jnana Deepika School ERP)
and **Classo** (multi-tenant school SaaS) apps drop a teacher straight into the quiz host
console **without a second login**.

The host apps mint a short-lived signed token, open the quiz app's TV/host console with that
token in the URL, and the quiz app exchanges it for its own session JWT. The JDV/Classo "Quiz"
button and the token minting live in those repos; this document is the spec they implement to.

---

## 1. Entry URL

Open the host/TV console in its own browser tab (projector-friendly — it is **not** iframed):

```
https://<quiz-host>/display/?sso=<SSO_TOKEN>&source=<jdv|classo>
```

- `<quiz-host>` — wherever the quiz app is deployed (its own subdomain in a later phase).
- `/display/` — the TV/host single-page app (base path `/display`).
- `sso` — the signed SSO token described below.
- `source` — which host app minted the token: `jdv` or `classo`. Selects the verifying secret.

On load the TV app POSTs the token to `/api/auth/sso`, stores the returned quiz-app session
token in `localStorage` (key `token`) exactly where a normal login stores it, strips `sso` and
`source` from the URL (so a refresh/bookmark can't replay the single-use token), and skips the
login screen. If the token is missing or invalid, the app falls back to the normal login screen.

---

## 2. The SSO token

- **Algorithm:** HS256 (HMAC-SHA256).
- **Signing secret:** the shared secret for the source (see §3). Must be identical on both sides.
- **Lifetime:** short — **≤ ~5 minutes** (`exp - iat`). The quiz app rejects tokens whose `iat`
  is older than ~5 min (+30s skew) *and* tokens that claim a total lifetime longer than that
  window. Mint a fresh token each time the teacher clicks "Quiz".

### Claims

| Claim      | Required | Notes                                                                 |
|------------|----------|-----------------------------------------------------------------------|
| `iss`      | yes      | Issuer identifier for the host app (informational).                   |
| `tenantId` | yes      | Tenant the user belongs to (e.g. a Classo tenant; a fixed value for JDV). Part of the quiz-app user identity. |
| `schoolId` | yes      | School within the tenant.                                             |
| `sub`      | yes      | The user's id **in the host system**. Stored as `externalId`. Identity key together with `tenantId`. |
| `name`     | yes      | Display name for the teacher/host.                                    |
| `email`    | optional | If omitted, the quiz app synthesizes a stable placeholder email.      |
| `role`     | yes      | Must be exactly `"host"`. Any other value is rejected (401).          |
| `iat`      | yes      | Issued-at (standard JWT, seconds).                                    |
| `exp`      | yes      | Expiry (standard JWT, seconds). Keep within ~5 min of `iat`.          |

### Identity & upsert

The quiz app UPSERTs a `User` keyed by the compound unique **`(tenantId, externalId=sub)`**:

- First visit → creates the user with `authProvider = SSO_JDV` or `SSO_CLASSO`.
- Return visits → updates `name`, `schoolId`, and `email` (if provided).

So the same `(tenantId, sub)` always maps to the same quiz-app user and owns its quizzes/sessions.

### Example payload

```json
{
  "iss": "classo",
  "tenantId": "tenant_abc123",
  "schoolId": "school_42",
  "sub": "teacher_98765",
  "name": "Ramesh Kumar",
  "email": "ramesh@school42.example",
  "role": "host",
  "iat": 1700000000,
  "exp": 1700000240
}
```

### Minting example (Node, host app side)

```js
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  {
    iss: 'classo',
    tenantId: tenant.id,
    schoolId: school.id,
    sub: user.id,
    name: user.name,
    email: user.email,          // optional
    role: 'host',
  },
  process.env.QUIZ_SSO_SECRET_CLASSO,   // the shared secret for this source
  { algorithm: 'HS256', expiresIn: '3m' }
);

const url = `https://quiz.example.com/display/?sso=${encodeURIComponent(token)}&source=classo`;
```

---

## 3. Environment secrets

Set on the **quiz app** server. Each host app uses the matching value to sign.

| Env var                  | Used for                                             |
|--------------------------|------------------------------------------------------|
| `JWT_SECRET`             | Signing the quiz app's own session JWTs. **Required — the server refuses to boot without it.** |
| `QUIZ_SSO_SECRET_JDV`    | Verifying SSO tokens where `source=jdv`.             |
| `QUIZ_SSO_SECRET_CLASSO` | Verifying SSO tokens where `source=classo`.          |

The SSO secrets are **not** required at boot — a missing one only fails requests for that source
(`500 SSO is not configured for this source`). Use long, random, per-environment values and keep
them out of source control.

---

## 4. `POST /api/auth/sso`

**Request**

```json
{ "token": "<SSO_TOKEN>", "source": "jdv" }   // source ∈ { "jdv", "classo" }
```

**Success — `200`**

```json
{
  "token": "<quiz-app session JWT>",
  "user": {
    "id": "…",
    "email": "…",
    "name": "…",
    "tenantId": "…",
    "schoolId": "…",
    "authProvider": "SSO_JDV"
  }
}
```

The returned `token` is a normal quiz-app session JWT (`jwt.sign({ id: user.id }, JWT_SECRET)`),
identical in shape to the one `/api/auth/login` returns and consumed by the `authenticateToken`
middleware and by the host socket handshake.

**Failures**

| Status | When                                                                        |
|--------|-----------------------------------------------------------------------------|
| `401`  | Missing token/source, unknown `source`, bad signature, expired, lifetime too long, `role !== "host"`, or missing `tenantId`/`sub`. |
| `500`  | The matching `QUIZ_SSO_SECRET_*` is not configured on the server.           |

---

## 5. How the session token is used afterwards

- **REST:** sent as `Authorization: Bearer <token>`. Host-only routes (create/delete session,
  analytics read/export) require it *and* verify the caller owns the session.
- **Sockets:** the TV app includes `token` in the `join-session` payload for `host`/`display`
  roles. The server verifies the JWT and confirms `decoded.id === session.hostId` before granting
  the host role. Students join anonymously (no token).

---

## 6. Out of scope for Phase 1 (defined here only for context)

- Multi-tenant **query scoping** (filtering quizzes/questions/sessions by `tenantId`/`schoolId`).
  Phase 1 adds the fields and the identity; it does **not** yet scope queries by them.
- Standalone **Google / phone / email** login for other schools (Phase 3).
- Deployment specifics (own PM2 process, nginx `wss`, subdomain).
