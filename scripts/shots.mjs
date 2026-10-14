// Visual + layout + contrast check for every screen at the 4 breakpoints.
// Needs a running server (npm start or npm run dev) and Google Chrome.
//   node scripts/shots.mjs [baseUrl] [outDir]
// Prints, per screen and width: horizontal overflow (px) and contrast failures.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4510';
const OUT = process.argv[3] ?? '/tmp/coa-shots';
const PROBE = readFileSync(new URL('./contrast-probe.js', import.meta.url), 'utf8');
const WIDTHS = (process.env.WIDTHS ?? '1440,1025,700,390').split(',').map(Number);
const AS = process.env.AS ?? 'jordan@thewell.test';
const SCREENS = (process.env.SCREENS ?? '/,/onboarding,/lesson/4,/resources,/team,/support').split(',');
mkdirSync(OUT, { recursive: true });

const port = 9471 + Math.floor(Math.random() * 100);
const profile = `/tmp/coa-shot-${process.pid}`;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
  await sleep(200);
}
if (ws.readyState !== 1) await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');

// Sign in once (unless AS=none, for the public pages); the cookie carries across navigations.
await send('Page.navigate', { url: BASE + '/signin' }); await sleep(1500);
const login = AS === 'none' ? 'skipped' : await evalJs(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-COA':'1'},body:JSON.stringify({email:${JSON.stringify(AS)},password:${JSON.stringify(process.env.PW ?? 'welcome-to-the-well')}})}).then(r=>r.status)`);
console.log('login', AS, login);

const report = [];
for (const w of WIDTHS) {
  const mobile = w < 700;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile });
  for (const path of SCREENS) {
    await send('Page.navigate', { url: BASE + path }); await sleep(1800);
    // CLICK='.selector' clicks something first (e.g. to open a menu) before measuring.
    if (process.env.CLICK) { await evalJs(`document.querySelector(${JSON.stringify(process.env.CLICK)})?.click()`); await sleep(500); }
    const overflow = await evalJs('document.documentElement.scrollWidth - window.innerWidth');
    const fails = await evalJs(`(()=>{${PROBE}})()`);
    const h = await evalJs('Math.ceil(document.documentElement.scrollHeight)');
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(h, 6000), deviceScaleFactor: 1, mobile });
    await sleep(400);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const name = `${(path.replace(/\//g, '_') || '_home').replace(/^_$/, '_home')}-${w}.png`;
    writeFileSync(`${OUT}/${name}`, Buffer.from(shot.result.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile });
    report.push({ w, path, overflow, contrastFails: Array.isArray(fails) ? fails.length : fails, sample: Array.isArray(fails) ? fails.slice(0, 3) : undefined });
  }
}
for (const r of report) console.log(JSON.stringify(r));
chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
