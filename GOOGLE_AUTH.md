# Standalone Google Sign-In (Phase 3)

Lets a teacher sign up / log in to the quiz app **directly with Google**, without a
host app (JDV/Classo) and without a separate password. This is for schools using the
app standalone. It is independent of the SSO flow in [SSO.md](SSO.md) and of the
existing email+password login.

## How it works

1. The TV/host login & register screens render Google's official **Sign in with Google**
   button (Google Identity Services), shown only when the server reports Google is
   configured.
2. Google returns an **ID token** (a JWT "credential") to the browser.
3. The browser POSTs it to `POST /api/auth/google`.
4. The server verifies the token (signature against Google's keys, audience == our
   client id, issuer, expiry) and finds-or-creates the user, then returns a normal
   quiz-app session JWT — the same shape `authenticateToken` consumes.

The host console is opened in its own tab; nothing is iframed.

## Configuration

| Env var            | Purpose                                                                 |
|--------------------|-------------------------------------------------------------------------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 **Web application** client id from Google Cloud Console. Used both to render the button (served via `/api/auth/config`) and as the expected audience when verifying tokens. |

- If `GOOGLE_CLIENT_ID` is unset, Google login is **disabled**: `/api/auth/config`
  returns `googleEnabled:false`, the button is hidden, and `POST /api/auth/google`
  returns `500`. No client secret is needed (the browser uses the ID-token flow; the
  server verifies against Google's public keys).
- In Google Cloud Console, add the quiz app's origin(s) to the client's **Authorized
  JavaScript origins** (e.g. `http://localhost:3000`, your production origin).

## Endpoints

### `GET /api/auth/config`
Public. Tells the frontend what to show.
```json
{ "googleEnabled": true, "googleClientId": "xxxx.apps.googleusercontent.com" }
```

### `POST /api/auth/google`
```json
{ "credential": "<Google ID token>" }
```
**200** →
```json
{
  "token": "<quiz-app session JWT>",
  "user": { "id": "...", "email": "...", "name": "...", "tenantId": "...", "schoolId": null, "authProvider": "GOOGLE" }
}
```
**Failures:** `401` (missing/invalid/expired credential, wrong audience, unverified
email, missing subject); `500` (`GOOGLE_CLIENT_ID` not configured, or an unexpected
server error).

## User identity & tenancy

Users are matched in this order:
1. **Returning Google user** — by Google `sub` (stored as `externalId`, `authProvider=GOOGLE`); keeps their existing tenant.
2. **Existing account with the same verified email** — the Google identity is linked to it; an existing EMAIL account keeps its provider so its password still works.
3. **Brand-new standalone signup** — created with its **own `tenantId`** (a fresh UUID), per the Phase 2 strict-per-teacher isolation model. `schoolId` is left null.

Because each standalone signup gets its own tenant, its quizzes/questions/sessions are
isolated by the Phase 2 scoping exactly like SSO tenants.

## Out of scope (future)

- Phone-number (SMS OTP) login and email verification / password reset — not built in
  this pass.
