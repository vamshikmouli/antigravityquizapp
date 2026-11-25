// Applies pending Prisma migrations during the build on the production host.
//
// Runs only when deploying (Render sets RENDER=true; set DEPLOY_MIGRATE=1 on any
// other host). Local and Vercel builds skip it. If a migration fails the build
// fails, so the host keeps serving the previous working deploy.
import { spawnSync } from 'node:child_process';

const onDeployHost = process.env.RENDER === 'true' || process.env.DEPLOY_MIGRATE === '1';
if (!onDeployHost) {
  console.log('[migrate] Not a deploy build (RENDER / DEPLOY_MIGRATE unset) - skipping prisma migrate deploy.');
  process.exit(0);
}
console.log('[migrate] Applying pending migrations...');
const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
