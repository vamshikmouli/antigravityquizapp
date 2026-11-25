# Deploying

The app is **one long-running Node server** that serves both apps (`/display` for the
host/TV, `/` for phones), the REST API and the Socket.IO games. Game state (buzzer
rounds, turns) lives in that server's memory, so run **one instance** on a host that
keeps WebSockets open, such as **Render** (current production: `jnanaquizapp.onrender.com`).

Vercel is not suitable for this server: it runs code as short-lived functions, so it
can't keep WebSockets open or hold game state in memory.

## Render service settings

| Setting | Value |
|---|---|
| Runtime | Node |
| Branch | `main` |
| Auto-Deploy | Yes (deploys every merge to `main`) |
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

`npm run build` generates the Prisma client and **applies pending database migrations**
(`scripts/migrate-on-deploy.mjs`, only on Render). It then builds both front-ends. If a
migration fails, the build fails and Render keeps serving the previous deploy.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Production Postgres connection string |
| `JWT_SECRET` | **yes** | Long random string. The server refuses to start without it |
| `NODE_ENV` | recommended | `production` |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | for AI | At least one enables "Generate with AI" |
| `AI_PROVIDER` | optional | `groq` or `gemini` default |
| `GROQ_MODEL` / `GEMINI_MODEL` | optional | Model overrides |
| `GOOGLE_CLIENT_ID` | optional | Google sign-in. Add the Render URL to the OAuth client's authorized JavaScript origins |
| `QUIZ_SSO_SECRET_JDV` / `QUIZ_SSO_SECRET_CLASSO` | optional | Only if those host apps use SSO |
| `FRONTEND_URL` | optional | Extra allowed CORS origin, e.g. a custom domain |

`PORT` is set by Render automatically.

## Uploaded files

Images and music uploaded through the app are stored in `uploads/` on the server's disk.
On Render's free and starter plans that disk is **wiped on every deploy and restart**.
Either attach a Render persistent disk mounted at `/opt/render/project/src/uploads`, or use
picture links (the "Image URL" column in the import template) instead of uploads.

## After deploying

1. Open `https://<your-app>.onrender.com/api/health`. It should return `{"status":"ok"}`.
2. Sign in at `/display`, create a quiz, and launch it. Join from a phone at `/`.
3. In a group competition, play one round end to end before the event.
