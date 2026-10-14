// `npm run seed`: wipes data/ and seeds The Well (SPEC §7). All content is PLACEHOLDER —
// Dr. Claffey supplies the real lessons. Exported seed(dataDir) is used by the tests too.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashPassword } from './auth.mjs';
import { openDb, tx } from './db.mjs';
import { storeFile } from './routes/files.mjs';
import { makeDocx, makePdf, makeZipKit } from './seed-files.mjs';

export const SEED_PASSWORD = 'welcome-to-the-well';
const ASSETS = 'https://raw.githubusercontent.com/tommyclaffey/thewell-assets/main/real';
const POSTER = `${ASSETS}/angela-room-wide.jpg`;
const PRESENTER = 'Dr. Angela Claffey';
const KB = 1024;
const MB = 1024 * 1024;

const USERS = [
  { key: 'angela', email: 'angela@thewell.test', name: 'Dr. Angela Claffey', title: 'Clinical supervisor', role: 'owner' },
  { key: 'office', email: 'office@thewell.test', name: 'Office manager', title: 'Scheduling, payroll and keys', role: 'admin' },
  { key: 'jordan', email: 'jordan@thewell.test', name: 'Jordan Lee', title: 'Associate clinician', role: 'clinician' },
];

const transcript = (title) =>
  `[Placeholder transcript for "${title}". Dr. Claffey will supply the recorded lesson and its transcript.]`;

const WEEKS = [
  {
    title: 'Week 1',
    subtitle: 'Foundations',
    lessons: [
      {
        key: 'welcome',
        title: 'Welcome from Dr. Claffey',
        label: 'WELCOME',
        min: 6,
        overview: 'A short welcome from Dr. Claffey: who we are, who we serve, and what your first three weeks look like.',
        takeaways: [
          'Onboarding runs over three weeks, one lesson at a time.',
          'Your supervisor is your first call for any question.',
          'Finish the checklist before you see your first client.',
        ],
      },
      {
        key: 'story',
        title: 'Our story and mission',
        label: 'OUR STORY',
        min: 11,
        overview: 'How The Well started, why we exist, and the kind of care we want every client to receive.',
        takeaways: [
          'We exist to offer excellent care with room for faith.',
          'Every client is treated with dignity, whatever they believe.',
          'Our values shape scheduling, documentation and care alike.',
        ],
      },
      {
        key: 'hipaa',
        title: 'HIPAA and client privacy',
        label: 'PRIVACY AND COMPLIANCE',
        min: 22,
        overview: 'What HIPAA asks of you day to day: what you can share, with whom, and how we store and send client information.',
        takeaways: [
          'Never confirm or deny that someone is a client without written consent.',
          'Use only the EHR and approved channels for client information.',
          'Report a possible privacy breach to the office the same day.',
        ],
        quiz: [
          {
            prompt: "A client's spouse calls to ask whether she made it to her appointment today. What do you say?",
            options: [
              "Confirm it, since they're family.",
              "Say you can't confirm or deny who is a client without written consent.",
              'Take a message and tell the client her spouse called.',
            ],
            correct: 1,
            explanation: 'Without a signed release you cannot confirm that anyone is a client, even to family.',
          },
        ],
      },
      {
        key: 'faith',
        title: 'Faith-integrated care: our model',
        label: 'FAITH-INTEGRATED CARE',
        min: 18,
        updatedAt: '2026-09-15T12:00:00.000Z',
        overview:
          'Faith is part of how many of our clients make sense of their lives, and it can be part of their healing. This lesson walks through how The Well brings faith into the room when a client invites it, how we document that consent, and how we hold back when a client would rather keep therapy secular.',
        takeaways: [
          'The client sets the pace. Faith comes in only when they invite it.',
          'Consent for spiritual care is written into intake, and revisited when goals change.',
          'Evidence-based treatment always leads. Faith supports it, never replaces it.',
        ],
        quiz: [
          {
            prompt: 'A new client tells you she wants to keep faith out of her sessions. What do you do?',
            options: [
              'Respect it, note it in her file, and keep sessions secular unless she raises it.',
              'Gently introduce scripture anyway, since it is part of our model.',
              'Refer her to a secular practice.',
            ],
            correct: 0,
            explanation:
              'The client sets the pace. Record her preference and keep sessions secular unless she invites faith in later.',
          },
        ],
      },
    ],
  },
  {
    title: 'Week 2',
    subtitle: 'Intake and informed consent',
    lessons: [
      {
        key: 'intake',
        title: 'Intake and informed consent',
        label: 'INTAKE',
        min: 14,
        overview: 'Walking a new client through intake: the packet, informed consent, and the conversations that set expectations.',
        takeaways: [
          'Consent is signed before the first session begins.',
          'Explain limits of confidentiality in plain language.',
          'Record spiritual-care preferences at intake.',
        ],
      },
      {
        key: 'notes',
        title: 'Documentation and session notes',
        label: 'DOCUMENTATION',
        min: 20,
        overview: 'How we write session notes: the template, what belongs in the record, and when notes are due.',
        takeaways: [
          'Notes are due within 24 hours of the session.',
          'Write what happened and the plan, not your impressions of the person.',
          'Use the practice templates so notes are consistent.',
        ],
      },
      {
        key: 'crisis',
        title: 'Crisis and safety protocol',
        label: 'SAFETY',
        min: 16,
        overview: 'What to do when a client is at risk: assessment, safety planning, who to call, and how to document it.',
        takeaways: [
          'Safety comes before the session plan.',
          'Call your supervisor during or right after any crisis session.',
          'Document the assessment and the safety plan the same day.',
        ],
        quiz: [
          {
            prompt: 'A client tells you she has thought about ending her life. What comes first?',
            options: [
              'Finish the planned session, then follow up next week.',
              'Assess risk using the safety protocol and stay with her until a plan is in place.',
              'Call her emergency contact right away.',
            ],
            correct: 1,
            explanation: 'Assess risk with the protocol first. The assessment decides who else needs to be involved.',
          },
        ],
      },
    ],
  },
  {
    title: 'Week 3',
    subtitle: 'Your first clients',
    lessons: [
      {
        key: 'supervision',
        title: 'Supervision and case consultation',
        label: 'SUPERVISION',
        min: 12,
        overview: 'How supervision works at The Well: when we meet, what to bring, and how to ask for a case consultation.',
        takeaways: [
          'Supervision is weekly and protected time.',
          'Bring questions, not just updates.',
          'Ask for a consultation early, not after a session goes badly.',
        ],
      },
      {
        key: 'billing',
        title: 'Insurance, billing and scheduling',
        label: 'OPERATIONS',
        min: 15,
        overview: 'The business side: how scheduling works, what insurance we take, and how billing and payroll run.',
        takeaways: [
          'The office handles scheduling changes and insurance questions.',
          'Close every session in the EHR so billing can run.',
          'Payroll runs on the 1st and 15th.',
        ],
      },
    ],
  },
];

const RESOURCES = [
  { title: 'Clinician handbook', ext: 'pdf', size: 2.4 * MB, lesson: null },
  { title: 'Informed consent template', ext: 'docx', size: 84 * KB, lesson: 'intake' },
  { title: 'New client intake packet', ext: 'pdf', size: 1.1 * MB, lesson: 'intake' },
  { title: 'Crisis and safety protocol', ext: 'pdf', size: 96 * KB, lesson: 'crisis', category: 'Policy' },
  { title: 'Session note templates', ext: 'docx', size: 61 * KB, lesson: 'notes' },
  { title: 'Brand kit and email signature', ext: 'zip', size: 6.8 * MB, lesson: null },
  { title: 'Faith-integration framework', ext: 'pdf', size: 1.1 * MB, lesson: 'faith' },
  { title: 'Consent language for spiritual care', ext: 'docx', size: 42 * KB, lesson: 'faith' },
  { title: 'Reflection worksheet', ext: 'pdf', size: 120 * KB, lesson: 'faith' },
];

const CHECKLIST = [
  ['Sign your employment agreement', 'The office will send it for e-signature.'],
  ['Upload license and liability insurance', 'Send copies to the office, not this app.'],
  ['Set up your EHR login', 'The office creates your account; set your password on day one.'],
  ['Shadow a session with your supervisor', 'Book a time with Dr. Claffey in your first week.'],
  ['Read the clinician handbook', 'It is in the resource library.'],
];

function placeholderFile(r) {
  const lines = ['PLACEHOLDER document for The Well demo practice.', 'Dr. Claffey will supply the real file.'];
  const target = Math.round(r.size);
  if (r.ext === 'pdf') return makePdf(r.title, lines, target);
  if (r.ext === 'docx') return makeDocx(r.title, lines, target);
  if (r.ext === 'zip') return makeZipKit(`${r.title}\n\n${lines.join('\n')}\n`, target);
  return Buffer.from(`${r.title}\n${lines.join('\n')}\n`);
}

/**
 * Seeds The Well. `wipe` (default) deletes dataDir first — local dev and tests only.
 * Production uses seedIfEmpty() with a private password instead.
 */
export async function seed(dataDir, { password = SEED_PASSWORD, wipe = true } = {}) {
  if (wipe) fs.rmSync(dataDir, { recursive: true, force: true });
  const db = openDb(dataDir);
  const hashes = await Promise.all(USERS.map(() => hashPassword(password)));
  const t = new Date().toISOString();
  const ids = { users: {}, lessons: {}, checklist: [] };
  const insert = (table, row) => {
    const keys = Object.keys(row);
    const sql = `INSERT INTO ${table}(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
    return Number(db.prepare(sql).run(...Object.values(row)).lastInsertRowid);
  };

  tx(db, () => {
    const pid = insert('practices', {
      name: 'The Well',
      slug: 'the-well',
      brand_color: '#22688A',
      logo_url: `${ASSETS}/the-well-logo.png`,
      terms: JSON.stringify({
        portal: 'Clinician portal',
        member: 'clinician',
        members: 'clinicians',
        lead: 'supervisor',
        org: 'practice',
        checklist: 'Before your first client',
        onboarding: 'Clinical onboarding',
      }),
      welcome_quote: '“Come to me, all you who are weary and burdened, and I will give you rest.”',
      welcome_quote_ref: 'MATTHEW 11:28',
      client_messaging: JSON.stringify({ label: 'SimplePractice', url: 'https://secure.simplepractice.com' }),
      welcome_photo_url: `${ASSETS}/the-well-hero-shaded.jpg`,
      created_at: t,
    });
    ids.practice = pid;
    USERS.forEach((u, i) => {
      ids.users[u.key] = insert('users', {
        practice_id: pid, email: u.email, name: u.name, title: u.title, role: u.role,
        password_hash: hashes[i], active: 1, created_at: t,
      });
    });
    WEEKS.forEach((w, wi) => {
      const weekId = insert('weeks', { practice_id: pid, position: wi + 1, title: w.title, subtitle: w.subtitle });
      w.lessons.forEach((l, li) => {
        const lessonId = insert('lessons', {
          practice_id: pid, week_id: weekId, position: li + 1, title: l.title, label: l.label,
          presenter: PRESENTER, duration_min: l.min, video_url: '', poster_url: POSTER,
          overview: l.overview, takeaways: JSON.stringify(l.takeaways), transcript: transcript(l.title),
          updated_at: l.updatedAt || t,
        });
        ids.lessons[l.key] = lessonId;
        for (const qq of l.quiz || []) {
          insert('quiz_questions', {
            practice_id: pid, lesson_id: lessonId, prompt: qq.prompt, options: JSON.stringify(qq.options),
            correct_index: qq.correct, explanation: qq.explanation,
          });
        }
      });
    });
    for (const r of RESOURCES) {
      const bytes = placeholderFile(r);
      insert('resources', {
        practice_id: pid, lesson_id: r.lesson ? ids.lessons[r.lesson] : null, category: r.category || 'Resource',
        title: r.title, file_type: r.ext.toUpperCase(), size_bytes: bytes.length,
        stored_name: storeFile(dataDir, pid, r.ext, bytes), created_at: t,
      });
    }
    CHECKLIST.forEach(([title, detail], i) => {
      ids.checklist.push(insert('checklist_items', { practice_id: pid, position: i + 1, title, detail }));
    });

    // Jordan: 3 of 9 complete, lesson 4 started at 7:12, checklist 2 of 5.
    const jordan = ids.users.jordan;
    for (const key of ['welcome', 'story', 'hipaa']) {
      insert('lesson_progress', {
        user_id: jordan, lesson_id: ids.lessons[key], practice_id: pid, status: 'complete',
        position_sec: 0, quiz_correct: key === 'hipaa' ? 1 : null, completed_at: t,
      });
    }
    insert('lesson_progress', {
      user_id: jordan, lesson_id: ids.lessons.faith, practice_id: pid, status: 'started', position_sec: 432,
    });
    for (const itemId of ids.checklist.slice(0, 2)) {
      insert('checklist_done', { user_id: jordan, item_id: itemId, practice_id: pid, done_at: t });
    }
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(t, jordan);
  });
  db.close();
  return { ...ids, logins: USERS.map((u) => ({ email: u.email, role: u.role })), password };
}

/** Seeds only a brand-new database, never wipes. Returns null if data already exists. */
export async function seedIfEmpty(dataDir, password) {
  if (!password || password.length < 12 || password === SEED_PASSWORD) {
    throw new Error('seedIfEmpty needs SEED_PASSWORD: 12+ characters, and not the public demo password.');
  }
  const db = openDb(dataDir);
  const n = db.prepare('SELECT COUNT(*) AS n FROM practices').get().n;
  db.close();
  if (n > 0) return null;
  return seed(dataDir, { password, wipe: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  if (process.argv.includes('--if-empty')) {
    if (!process.env.SEED_PASSWORD) {
      console.log('SEED_PASSWORD not set — seed skipped.');
      process.exit(0);
    }
    // Production first boot: `node server/seed.mjs --if-empty` (password from SEED_PASSWORD, never printed).
    const out = await seedIfEmpty(dataDir, process.env.SEED_PASSWORD);
    console.log(out ? `Seeded The Well into ${dataDir} (first boot).` : 'Data already present — seed skipped.');
    process.exit(0);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to wipe and re-seed in production. Use --if-empty.');
    process.exit(1);
  }
  const out = await seed(dataDir);
  console.log(`Seeded The Well (placeholder content) into ${dataDir}\n`);
  for (const l of out.logins) console.log(`  ${l.email.padEnd(22)} ${l.role}`);
  console.log(`\n  Password for all: ${out.password}`);
}
