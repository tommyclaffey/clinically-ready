#!/usr/bin/env node
// Adds sections to a live course WITHOUT touching what's already there (unlike import-course --replace):
// new sections and their steps, section-quiz pools, the documents as downloads, tools and agreements placed on
// steps, then puts every section in the order given in extras.json. Safe to run twice: anything already
// present (same section title, same question, same file title, same tool or agreement name) is skipped.
//
//   COA_PASSWORD=… node scripts/add-sections.mjs --base https://… --email owner@… [--dir content/the-well] [--docs ~/Desktop/app] [--dry]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = (opt('base', 'http://127.0.0.1:4500') || '').replace(/\/+$/, '');
const EMAIL = opt('email');
const DIR = path.resolve(opt('dir', 'content/the-well'));
const DOCS = opt('docs') ? path.resolve(opt('docs')) : null;
const PASSWORD = process.env.COA_PASSWORD;

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const course = read(path.join(DIR, 'course.json'));
const extras = read(path.join(DIR, 'extras.json'));
const sectionFile = (key) => path.join(DIR, 'sections', key === 'HB' ? 'handbook.json' : `${key}.json`);
const sections = Object.fromEntries(extras.order.map((k) => [k, read(sectionFile(k))]));
const poolOf = (key) => {
  const own = sections[key].sectionQuiz;
  if (own?.questions?.length) return own;
  const f = path.join(DIR, 'pools', `${key}.json`);
  return fs.existsSync(f) ? read(f).sectionQuiz : null;
};

const doc = (key, suffix = '') => {
  const d = course.docs?.[key];
  return d ? { label: suffix ? `${d.label}, ${suffix}` : d.label, url: d.url } : null;
};
const pagesLabel = (p) => (p ? (/[–-]/.test(p) ? `pp. ${p}` : `p. ${p}`) : '');
const partLabel = (s) => (s.number === '00' ? 'Start Here' : /^\d+$/.test(s.number) ? `Part ${s.number}` : '');

/** A step's page, in the order staff read it. Extra blocks (files, tools, paperwork) go before the quick check. */
function blocksFor(section, l, extra = []) {
  const docKey = section.doc ?? 'manual';
  const related = new Set([docKey, ...(l.related ?? [])]);
  const links = [...related]
    .map((k) => (k === docKey ? doc(k, docKey === 'manual' ? pagesLabel(l.pages) : '') : doc(k)))
    .filter(Boolean);
  const out = [];
  if (section.video !== false && docKey === 'manual') out.push({ type: 'video', url: '', transcript: '' });
  if (l.overview) out.push({ type: 'p', text: l.overview });
  if (l.takeaways?.length) out.push({ type: 'takeaways', items: l.takeaways });
  out.push(...(l.content ?? []));
  if (links.length) out.push({ type: 'links', items: links });
  out.push(...extra);
  if (l.quiz?.length) out.push({ type: 'quiz' });
  return out;
}

const newKeys = () => extras.order;
const lessonCount = newKeys().reduce((n, k) => n + (sections[k].lessons?.length ?? 0), 0);
console.log(`${extras.order.length} sections in the plan, ${lessonCount} steps in their files.`);
for (const k of extras.order) {
  const s = sections[k];
  const pool = poolOf(k);
  console.log(`  ${k.padEnd(3)} ${s.title} · ${s.subtitle}  (${s.lessons?.length ?? 0} steps, pool ${pool?.questions?.length ?? 0}${extras.importQuickChecks?.includes(k) ? ' + quick checks' : ''})`);
}
if (flag('dry')) process.exit(0);
if (!EMAIL || !PASSWORD) {
  console.error('Need --email and the COA_PASSWORD env var.');
  process.exit(1);
}

// ---- talk to the server ----
let cookie = '';
async function call(method, url, body, { raw, type } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'X-COA': '1', Origin: BASE, ...(raw ? { 'Content-Type': type } : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = /coa_session=[^;]+/.exec(set)?.[0] ?? cookie;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${data.error ?? 'error'}`);
  return data;
}
await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
let content = await call('GET', '/api/admin/content');
const findWeek = (s) => content.weeks.find((w) => same(w.title, s.title) && same(w.subtitle, s.subtitle));

// Tools and agreements first, so steps can point at them.
let apps = await call('GET', '/api/apps');
for (const a of extras.apps ?? []) {
  if (apps.some((x) => same(x.name, a.name))) continue;
  apps = (await call('POST', '/api/admin/apps', a)).apps;
  console.log(`+ tool: ${a.name}`);
}
const formIds = {};
let forms = (await call('GET', '/api/admin/forms')).forms;
for (const f of extras.forms ?? []) {
  const body = fs.readFileSync(path.join(DIR, f.bodyFile), 'utf8').trim();
  let existing = forms.find((x) => same(x.title, f.title));
  if (!existing) {
    const id = (await call('POST', '/api/admin/forms', { kind: f.kind, title: f.title, body, required: f.required !== false })).id;
    forms = (await call('GET', '/api/admin/forms')).forms;
    existing = forms.find((x) => x.id === id);
    console.log(`+ agreement: ${f.title}`);
  }
  formIds[f.title] = existing.id;
}

// Extra blocks per step: tools and agreements named in extras.json.
const pick = (list, s, i) => list.filter((x) => x.section === s && (x.lesson === i || (x.lesson === -1 && i === sections[s].lessons.length - 1) || (x.lessonMatch && new RegExp(x.lessonMatch, 'i').test(sections[s].lessons[i].title))));
function extraBlocks(key, i) {
  const out = [];
  for (const f of pick(extras.files ?? [], key, i)) out.push({ type: 'files', _file: f.title });
  for (const a of pick(extras.appBlocks ?? [], key, i)) {
    const app = apps.find((x) => same(x.name, a.app));
    if (app) out.push({ type: 'app', appId: app.id });
  }
  for (const f of pick(extras.forms ?? [], key, i)) out.push({ type: 'form', formId: formIds[f.title] });
  // One downloads block is enough.
  return out.filter((b, j) => b.type !== 'files' || out.findIndex((x) => x.type === 'files') === j).map(({ _file, ...b }) => b);
}

// New sections and their steps.
const lessonIds = {};
for (const key of extras.order) {
  const s = sections[key];
  if (findWeek(s)) continue;
  const docKey = s.doc ?? 'manual';
  const weekLink = docKey === 'manual' ? doc('manual', [partLabel(s), pagesLabel(s.pages)].filter(Boolean).join(', ')) : doc(docKey);
  const weekId = (await call('POST', '/api/admin/weeks', { title: s.title, subtitle: s.subtitle, links: weekLink ? [weekLink] : [] })).id;
  lessonIds[key] = [];
  for (const [i, l] of s.lessons.entries()) {
    const body = {
      weekId, title: l.title, label: l.label, presenter: docKey === 'handbook' ? 'Employee Handbook' : 'Clinical Onboarding Manual',
      durationMin: l.durationMin, overview: l.overview, takeaways: l.takeaways, notify: false,
      blocks: blocksFor(s, l, extraBlocks(key, i)),
    };
    const id = (await call('POST', '/api/admin/lessons', body)).id;
    if (l.quiz?.length) await call('PUT', `/api/admin/lessons/${id}/quiz`, { quiz: l.quiz });
    lessonIds[key].push(id);
  }
  console.log(`+ ${s.title} · ${s.subtitle}: ${s.lessons.length} steps`);
}
content = await call('GET', '/api/admin/content');

// Documents as downloads (library, and on the step named in extras.json).
if (DOCS) {
  for (const f of extras.files ?? []) {
    if (content.resources.some((r) => same(r.title, f.title))) continue;
    const week = f.section ? findWeek(sections[f.section]) : null;
    const lesson = week && f.lesson !== undefined ? week.lessons[f.lesson === -1 ? week.lessons.length - 1 : f.lesson] : null;
    const bytes = fs.readFileSync(path.join(DOCS, f.src));
    const q = new URLSearchParams({ title: f.title, category: f.category ?? 'Resource', lessonId: lesson ? String(lesson.id) : '', filename: path.basename(f.src) });
    await call('POST', `/api/admin/resources?${q}`, undefined, { raw: bytes, type: 'application/pdf' });
    console.log(`+ file: ${f.title}${lesson ? ` (on “${lesson.title}”)` : ' (library)'}`);
  }
}

// Section quizzes: pool, then settings.
for (const key of extras.order) {
  const week = findWeek(sections[key]);
  if (!week) continue;
  const pool = poolOf(key);
  let quiz = await call('GET', `/api/admin/sections/${week.id}/quiz`);
  let added = 0;
  for (const qn of pool?.questions ?? []) {
    if (quiz.questions.some((x) => same(x.prompt, qn.prompt))) continue;
    quiz = await call('POST', `/api/admin/sections/${week.id}/questions`, qn);
    added += 1;
  }
  if (extras.importQuickChecks?.includes(key)) added += (await call('POST', `/api/admin/sections/${week.id}/questions/import`)).added;
  const settings = { enabled: extras.quizzesOn !== false, drawCount: pool?.drawCount ?? 5, passPercent: pool?.passPercent ?? 80 };
  quiz = await call('PUT', `/api/admin/sections/${week.id}/quiz`, settings);
  console.log(`  quiz ${key.padEnd(3)} pool ${quiz.settings.poolSize} (+${added}), ${quiz.settings.drawCount} per try, pass ${quiz.settings.passPercent}%, ${quiz.settings.active ? 'on' : 'off'}`);
}

// Order: the plan's sections first, in order; anything else keeps its place after them.
const planned = extras.order.map((k) => findWeek(sections[k])).filter(Boolean);
const rest = content.weeks.filter((w) => !planned.includes(w));
await call('PUT', '/api/admin/outline', { sections: [...planned, ...rest].map((w) => ({ id: w.id, lessonIds: w.lessons.map((l) => l.id) })) });
console.log(`Order: ${[...planned, ...rest].map((w) => w.subtitle || w.title).join(' → ')}`);

await call('POST', '/api/auth/logout');
console.log('Done.');
