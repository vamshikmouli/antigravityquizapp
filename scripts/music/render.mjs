// Renders the original default music (scripts/music/composer.js) to WAV files in
// public/music/ using a headless Chromium browser's Web Audio OfflineAudioContext.
//
//   node scripts/music/render.mjs            (uses Edge or Chrome; set BROWSER=path to override)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, 'public', 'music');
const TRACKS = ['QUESTION', 'OPTIONS', 'ANSWER', 'ROUND_RESULTS', 'FINAL_RESULTS'];
const candidates = [process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) { console.error('No Chrome/Edge found. Set BROWSER=/path/to/chrome'); process.exit(1); }

const port = 9450 + Math.floor(Math.random() * 40);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-music-'));
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} if (!target) await sleep(250); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result.result.value;
};

await evaluate(fs.readFileSync(path.join(here, 'composer.js'), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
for (const name of TRACKS) {
  const t0 = Date.now();
  const r = await evaluate(`renderTrack(${JSON.stringify(name)})`);
  const file = path.join(outDir, `${name.toLowerCase()}.wav`);
  fs.writeFileSync(file, Buffer.from(r.wav, 'base64'));
  console.log(`${name.padEnd(14)} ${r.seconds.toFixed(1)}s  ${(fs.statSync(file).size / 1024).toFixed(0)} KB  RMS ${r.rmsDb} dBFS  loop-seam ${r.seam}  (${Date.now() - t0} ms)`);
}
ws.close(); proc.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
