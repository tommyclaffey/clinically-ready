#!/usr/bin/env node
// Loads a practice's course (positions, checklists, sections, lessons, quizzes, links) through the admin API,
// so every validation and the practice-isolation rules apply exactly as if an owner typed it in.
//
//   node scripts/import-course.mjs --base https://… --email owner@… --dir content/the-well [--replace] [--replace-files] [--dry]
//   Password: COA_PASSWORD env var (never a flag, so it doesn't end up in shell history).
//
// --replace        delete the practice's existing sections, lessons, checklist and positions first
// --replace-files  also delete existing uploaded files (resources)
// --dry            validate the content and print what would happen, without touching the server
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
const PASSWORD = process.env.COA_PASSWORD;

const course = JSON.parse(fs.readFileSync(path.join(DIR, 'course.json'), 'utf8'));
const sectionFiles = fs
  .readdirSync(path.join(DIR, 'sections'))
  .filter((f) => /^\d\d\.json$/.test(f))
  .sort();
const sections = sectionFiles.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, 'sections', f), 'utf8')));

const doc = (key, suffix = '') => {
  const d = course.docs?.[key];
  return d ? { label: suffix ? `${d.label}, ${suffix}` : d.label, url: d.url } : null;
};
const pagesLabel = (p) => (p ? (/[–-]/.test(p) ? `pp. ${p}` : `p. ${p}`) : '');

// ---- build the plan (pure, so --dry can show it) ----
const plan = {
  positions: course.positions ?? [],
  checklist: [],
  weeks: sections.map((s, i) => ({
    title: s.title,
    subtitle: s.subtitle,
    position: i + 1,
    links: [doc('manual', [s.number === '00' ? 'Start Here' : `Part ${s.number}`, pagesLabel(s.pages)].filter(Boolean).join(', '))].filter(Boolean),
    lessons: s.lessons.map((l, j) => {
      const related = new Set(['manual', ...(l.related ?? [])]);
      const links = [...related]
        .map((k) => (k === 'manual' ? doc('manual', pagesLabel(l.pages)) : doc(k)))
        .filter(Boolean);
      return {
        title: l.title,
        label: l.label,
        presenter: 'Clinical Onboarding Manual',
        durationMin: l.durationMin,
        overview: l.overview,
        takeaways: l.takeaways,
        content: l.content,
        links,
        position: j + 1,
        quiz: l.quiz ?? [],
      };
    }),
  })),
};
for (const [pos, items] of Object.entries(course.checklists ?? {})) {
  const list = typeof items === 'string' && items.startsWith('same-as:') ? course.checklists[items.slice(8)] : items;
  list.forEach((it, i) => plan.checklist.push({ ...it, positionName: pos, position: i + 1 }));
}

const lessonCount = plan.weeks.reduce((n, w) => n + w.lessons.length, 0);
console.log(`${course.name}: ${plan.weeks.length} sections, ${lessonCount} lessons, ${plan.positions.length} positions, ${plan.checklist.length} checklist items`);
for (const w of plan.weeks) console.log(`  ${w.title} · ${w.subtitle} (${w.lessons.length})`);
if (flag('dry')) process.exit(0);

if (!EMAIL || !PASSWORD) {
  console.error('Need --email and the COA_PASSWORD env var.');
  process.exit(1);
}

// ---- talk to the server ----
let cookie = '';
async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-COA': '1',
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = /coa_session=[^;]+/.exec(set)?.[0] ?? cookie;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${data.error ?? 'error'}`);
  return data;
}

await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
const before = await call('GET', '/api/admin/content');

if (flag('replace')) {
  for (const w of before.weeks) await call('DELETE', `/api/admin/weeks/${w.id}`);
  for (const c of before.checklist) await call('DELETE', `/api/admin/checklist/${c.id}`);
  for (const p of before.positions ?? []) await call('DELETE', `/api/admin/positions/${p.id}`);
  console.log(`Removed ${before.weeks.length} sections, ${before.checklist.length} checklist items, ${(before.positions ?? []).length} positions.`);
}
if (flag('replace-files')) {
  for (const r of before.resources) await call('DELETE', `/api/admin/resources/${r.id}`);
  console.log(`Removed ${before.resources.length} files.`);
}

const positionIds = {};
for (const name of plan.positions) positionIds[name] = (await call('POST', '/api/admin/positions', { name })).id;

for (const c of plan.checklist) {
  await call('POST', '/api/admin/checklist', {
    title: c.title,
    detail: c.detail ?? '',
    section: c.section ?? '',
    positionId: c.positionName ? positionIds[c.positionName] : null,
    position: c.position,
  });
}

for (const w of plan.weeks) {
  const weekId = (await call('POST', '/api/admin/weeks', { title: w.title, subtitle: w.subtitle, position: w.position, links: w.links })).id;
  for (const l of w.lessons) {
    const { quiz, ...fields } = l;
    const id = (await call('POST', '/api/admin/lessons', { ...fields, weekId, notify: false })).id;
    if (quiz.length) await call('PUT', `/api/admin/lessons/${id}/quiz`, { quiz });
  }
  process.stdout.write(`  ✓ ${w.title}\n`);
}

await call('POST', '/api/auth/logout');
console.log('Done.');
