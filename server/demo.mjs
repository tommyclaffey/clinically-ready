// The public demo. Every visitor gets their own copy of a sample practice, Cedar Grove Counseling, with a
// short course, a sample team at different stages, and two accounts: the practice owner and a new clinician.
// Nothing a visitor does can reach another visitor or a real practice. Copies are deleted after a day.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { now, tx } from './db.mjs';
import { DEMO_LIBRARY } from './demolib.mjs';

export const DEMO_HOURS = 24;
export const DEMO_NAME = 'Cedar Grove Counseling';
const POSTER = '/demo/poster.jpg';
const VIDEO = '/demo/welcome.mp4';

const q = (prompt, options, correct, explanation) => ({ prompt, options, correct, explanation });

// ---------------------------------------------------------------- sample course
// A fictional practice's own policies. Plain, generic onboarding: nothing here is legal or clinical advice.
const SECTIONS = [
  {
    title: 'Week 1',
    subtitle: 'First week',
    pool: [
      q('Where do you keep client notes at Cedar Grove?', ['In SimplePractice', 'In a shared Google Doc', 'In your email drafts', 'On paper in your bag'], 0, 'Everything clinical lives in SimplePractice.'),
      q('Who do you ask when you are unsure about a clinical decision?', ['Your supervisor', 'A friend outside work', 'The client', 'Nobody: guess'], 0, 'Your supervisor is your first call for anything clinical.'),
      q('When do you sign the confidentiality agreement?', ['In your first week, before seeing clients', 'After your first month', 'Only if asked', 'At your yearly review'], 0, 'It comes first, before any client contact.'),
      q('Which is the right place for a quick team question?', ['Slack', 'A client’s chart', 'A text to a client', 'The waiting room'], 0, 'Team chat goes in Slack, never in a chart.'),
      q('What do you do if you can’t sign in to SimplePractice?', ['Ask the office to resend your invite', 'Use a colleague’s login', 'Make a new account', 'Wait a week'], 0, 'Never share logins. The office resends your invite.'),
      q('What should you do in your first week?', ['Meet your supervisor and set up your accounts', 'Take on a full caseload', 'Rewrite the intake forms', 'Skip the onboarding'], 0, 'Week 1 is set-up, people and paperwork.'),
    ],
    lessons: [
      {
        title: 'Welcome to Cedar Grove',
        label: 'WEEK 1 · WELCOME',
        min: 4,
        video: VIDEO,
        overview: 'A short hello from the team, and how this onboarding works: one step at a time, each with a short video, the reading, and a quick check.',
        takeaways: ['Each step has a short video, the reading and a quick check.', 'Each section ends with a quiz you pass to move on.', 'Your supervisor is your first call for anything clinical.'],
        content: [
          { type: 'h', text: 'How this works' },
          { type: 'steps', items: ['Watch the short video.', 'Read the step and look over the takeaways.', 'Answer the quick check.', 'Mark it complete and move to the next step.'] },
          { type: 'h', text: 'This week' },
          { type: 'checklist', items: ['Meet your supervisor', 'Set up SimplePractice and Zoom', 'Sign your confidentiality agreement', 'Finish Week 1 and pass its quiz'] },
        ],
        quiz: q('What unlocks the next section?', ['Passing the section quiz', 'Waiting 1 week', 'Asking the office', 'Nothing: everything is open'], 0, 'Each section ends with a quiz. Pass it to open the next one.'),
      },
      {
        title: 'Set up your accounts',
        label: 'WEEK 1 · SET-UP',
        min: 5,
        video: '',
        overview: 'The 2 apps you’ll use every day: SimplePractice for client records and Zoom for telehealth. Set both up before your first session.',
        takeaways: ['SimplePractice holds client records, notes and your calendar.', 'Zoom is for telehealth sessions.', 'Never share a login. Ask the office to resend an invite instead.'],
        content: [
          { type: 'h', text: 'Do this today' },
          { type: 'steps', items: ['Accept your SimplePractice invite from your work email.', 'Turn on 2-step verification.', 'Download Zoom on your work computer.', 'Book a 10-minute test call with your supervisor.'] },
          { type: 'callout', text: 'Client details never go in Slack, email or texts. Anything clinical stays in SimplePractice.' },
        ],
        apps: ['SimplePractice', 'Zoom'],
        quiz: q('A colleague offers their SimplePractice login while yours is being set up. What do you do?', ['Use it just for today', 'Decline and ask the office to resend your invite', 'Use it but don’t write notes', 'Share yours with them later'], 1, 'Logins are never shared. The office resends your invite.'),
      },
      {
        title: 'Sign your agreements',
        label: 'WEEK 1 · PAPERWORK',
        min: 3,
        video: null,
        overview: 'Before you see clients, read and sign the confidentiality agreement. It takes 2 minutes, and a copy is kept with your record.',
        takeaways: ['Sign it before any client contact.', 'You sign by typing your full name.', 'A copy is kept with your record.'],
        content: [
          { type: 'p', text: 'Read it through, tick the box, and type your full name to sign. If anything is unclear, ask your supervisor before you sign.' },
        ],
        form: true,
        quiz: q('How do you sign an agreement in the app?', ['Print it and post it', 'Tick the box and type your full name', 'Email the office', 'You don’t need to'], 1, 'Tick the consent box, then type your full name.'),
      },
    ],
  },
  {
    title: 'Week 2',
    subtitle: 'Clinical basics',
    pool: [
      q('What must every note at Cedar Grove show?', ['What you did, what you saw, and the plan', 'Only the date', 'Your personal opinion of the client', 'The client’s full life story'], 0, 'Every note shows what you assessed, what you did and the plan.'),
      q('When should notes be finished?', ['The same day as the session', 'At the end of the month', 'Whenever you have time', 'Only when audited'], 0, 'Cedar Grove’s policy: notes are done the same day.'),
      q('A client mentions they have thought about ending their life. What comes first?', ['Assess their safety now and call your supervisor', 'Note it for next week', 'End the session early', 'Change the subject'], 0, 'Safety first: assess now, then consult your supervisor the same day.'),
      q('What do you confirm at the start of every telehealth session?', ['Where the client is right now', 'Their internet speed', 'Their camera brand', 'Nothing'], 0, 'Location matters for safety. Confirm it every time.'),
      q('A client asks you to text them about their symptoms. What do you do?', ['Use secure messaging in SimplePractice instead', 'Text them from your phone', 'Email the details', 'Post in Slack'], 0, 'Personal health details go through secure messaging only.'),
      q('Who do you tell after any safety concern?', ['Your supervisor, the same day', 'No one', 'Only the client’s family', 'The front desk next week'], 0, 'Every safety concern goes to your supervisor the same day.'),
    ],
    lessons: [
      {
        title: 'What every note shows',
        label: 'WEEK 2 · NOTES',
        min: 4,
        video: '',
        overview: 'Notes protect your clients and you. At Cedar Grove every note follows the same shape, and it’s finished the same day.',
        takeaways: ['Every note shows what you assessed, did and planned.', 'Write it the same day.', 'Write facts, not opinions.'],
        content: [
          { type: 'h', text: 'Every note shows' },
          { type: 'checklist', items: ['What the client reported', 'What you observed', 'What you did in session', 'The plan for next time'] },
          { type: 'callout', text: 'Finish every note the same day. Your supervisor signs it after you share it.' },
        ],
        quiz: q('Which belongs in a note?', ['“Client said she slept 4 hours a night this week.”', '“Client is being dramatic.”', '“I don’t like this client.”', 'Nothing about the session'], 0, 'Write what was said and seen, not judgements.'),
      },
      {
        title: 'Safety first: when to consult',
        label: 'WEEK 2 · SAFETY',
        min: 5,
        video: '',
        overview: 'When a client’s safety is in question, you never handle it alone. Follow the same 4 steps every time.',
        takeaways: ['Assess safety in the moment.', 'Call your supervisor the same day.', 'Write down what happened and what you did.'],
        content: [
          { type: 'h', text: 'Every time' },
          { type: 'steps', items: ['Stay calm and listen.', 'Assess the client’s safety right now.', 'Call your supervisor the same day.', 'Write down what happened and what you did.'] },
          { type: 'dodont', do: ['Ask directly and listen', 'Make a safety plan with the client', 'Consult your supervisor'], dont: ['Promise to keep it secret', 'Wait until next week', 'Handle it alone'] },
          { type: 'callout', text: 'In an emergency, call 911. The 988 Suicide & Crisis Lifeline is available by call or text.' },
        ],
        quiz: q('Your supervisor is unavailable after a safety concern. What do you do?', ['Call the backup supervisor on the contact list', 'Wait until tomorrow', 'Handle it alone', 'Skip writing it down'], 0, 'Never handle it alone: use the backup on your contact list.'),
      },
      {
        title: 'Telehealth basics',
        label: 'WEEK 2 · TELEHEALTH',
        min: 4,
        video: null,
        overview: 'Most sessions happen over Zoom. A few habits keep them private and safe.',
        takeaways: ['Confirm where the client is at the start.', 'Use a private room with a closed door.', 'Have a backup plan if the call drops.'],
        content: [
          { type: 'h', text: 'Before every session' },
          { type: 'checklist', items: ['Private room, door closed', 'Headphones on', 'Client’s phone number ready in case the call drops'] },
          { type: 'h', text: 'Say this at the start' },
          { type: 'quote', text: '“Before we start, can you tell me where you are right now, and whether you’re somewhere private?”' },
        ],
        quiz: q('The video call drops mid-session. What do you do?', ['Call the client back on the number in their chart', 'End the session and mark it a no-show', 'Wait for them to email', 'Text them from your personal phone'], 0, 'Have their number ready and call back.'),
      },
    ],
  },
  {
    title: 'Week 3',
    subtitle: 'Ready for your first client',
    pool: [
      q('What do you check the day before a first session?', ['That intake paperwork is done', 'The client’s social media', 'Nothing', 'The weather'], 0, 'Intake paperwork should be complete before session 1.'),
      q('What do you explain at the start of a first session?', ['Confidentiality and its limits', 'Your salary', 'Your weekend plans', 'Nothing'], 0, 'Every client hears how confidentiality works, and its limits.'),
      q('A client asks a billing question you can’t answer. Who helps?', ['The office', 'Another client', 'Nobody', 'Their employer'], 0, 'Billing questions go to the office.'),
      q('Where do clinical questions go?', ['Your supervisor', 'The office manager', 'Slack, with the client’s name', 'Nowhere'], 0, 'Clinical questions always go to your supervisor.'),
      q('How soon after the first session is the note done?', ['The same day', 'Within a month', 'Before the second session only', 'Never'], 0, 'Same-day notes, every time.'),
      q('Who do you call in an emergency during a session?', ['911', 'The office voicemail', 'Your family', 'No one'], 0, 'In an emergency, call 911, then your supervisor.'),
    ],
    lessons: [
      {
        title: 'Your first session',
        label: 'WEEK 3 · FIRST SESSION',
        min: 5,
        video: '',
        overview: 'Your first session sets the tone. Check the paperwork the day before, then cover the same points every time.',
        takeaways: ['Check intake paperwork the day before.', 'Explain confidentiality and its limits.', 'Write the note the same day.'],
        content: [
          { type: 'h', text: 'The day before' },
          { type: 'checklist', items: ['Intake paperwork is done', 'Your supervisor knows the time', 'Zoom link or room is booked'] },
          { type: 'h', text: 'In the session' },
          { type: 'quote', text: '“What you share here stays private, with a few exceptions, like if someone’s safety is at risk. I’ll always tell you if that comes up.”' },
        ],
        quiz: q('What do you cover with every new client?', ['Confidentiality and its limits', 'Your personal history', 'Other clients’ stories', 'Nothing in particular'], 0, 'Every client hears how confidentiality works, and its limits.'),
      },
      {
        title: 'Who to call',
        label: 'WEEK 3 · CONTACTS',
        min: 3,
        video: null,
        overview: 'Know who to call before you need them. Save these now.',
        takeaways: ['Clinical questions go to your supervisor.', 'Billing and scheduling go to the office.', 'Emergencies: 911 first, then your supervisor.'],
        content: [
          { type: 'h', text: 'Your contacts' },
          { type: 'list', items: ['Clinical questions: your supervisor', 'Backup supervisor: on the contact list in SimplePractice', 'Billing and scheduling: the office', 'Emergencies: 911, then your supervisor'] },
        ],
        links: [{ label: '988 Suicide & Crisis Lifeline', url: 'https://988lifeline.org' }],
        quiz: q('A client asks to change their appointment time. Who handles it?', ['The office', 'Your supervisor', 'Another client', 'Nobody'], 0, 'Scheduling goes to the office.'),
      },
    ],
  },
];

const AGREEMENT = 'This is a sample agreement for the demo.\n\nI will keep everything I learn about clients private, in and out of session. I will only access the records I need for my work, never share my login, and keep client details out of email, texts and team chat.\n\nIf I am unsure whether something can be shared, I will ask my supervisor first.';

const CHECKLIST = [
  ['Meet your supervisor', 'Book a 30-minute welcome meeting.'],
  ['SimplePractice account set up', 'With 2-step verification turned on.'],
  ['Zoom test call done', 'With your supervisor.'],
  ['Emergency contacts saved', 'Supervisor, backup and the office.'],
];

const APPS = {
  SimplePractice: { description: 'Client records, notes and your calendar.', web_url: 'https://secure.simplepractice.com', signin_note: 'Use your work email. The office sends the invite.' },
  Zoom: { description: 'Telehealth sessions.', web_url: 'https://zoom.us/signin', mac_url: 'https://zoom.us/download', windows_url: 'https://zoom.us/download' },
  Slack: { description: 'Team chat. Never put client details here.', web_url: 'https://slack.com/signin', mac_url: 'https://slack.com/downloads', windows_url: 'https://slack.com/downloads', signin_note: 'Join with your work email.' },
  'Google Workspace': { description: 'Work email, calendar and shared drive.', web_url: 'https://mail.google.com', signin_note: 'The office creates your account on day 1.' },
};

// More agreements to sign, so the paperwork screens show a real set.
const MORE_FORMS = [
  ['Telehealth policy', 'This is a sample policy for the demo.\n\nI will only hold telehealth sessions from a private, quiet room, on the practice Zoom account, with the client’s location confirmed at the start of every session.'],
  ['Social media policy', 'This is a sample policy for the demo.\n\nI will not connect with current or former clients on social media, and I will never post about a client, even without a name.'],
];

// Handbooks and policies for the Resources page: 9 real multi-page documents shared by every demo copy
// (built by scripts/make-demo-library.mjs; nothing is copied per visitor).
const DEMO_FILES = JSON.parse(fs.readFileSync(path.join(DEMO_LIBRARY, 'manifest.json'), 'utf8'));

// Sample team: how far each person has got. Steps are counted in course order.
const TEAM = [
  { name: 'Tess Alvarez', title: 'Associate clinician', done: 6, passed: [0, 1], failedFirst: [], signed: true, signedAll: true, seen: 0.1 },
  { name: 'Luis Ortega', title: 'Associate clinician', done: 3, passed: [0], failedFirst: [0], signed: true, seen: 1 },
  { name: 'Noor Haddad', title: 'Intern', done: 1, passed: [], failedFirst: [], signed: false, seen: 2, started: true },
  { name: 'Samir Patel', title: 'Associate clinician', done: 8, passed: [0, 1, 2], failedFirst: [1], signed: true, signedAll: true, seen: 0.5 },
  { name: 'Grace Kim', title: 'Associate clinician', done: 4, passed: [0], failedFirst: [], signed: true, seen: 3 },
  { name: 'Owen Brooks', title: 'Intern', done: 0, passed: [], failedFirst: [], signed: false, seen: 5 },
];

// ---------------------------------------------------------------- build / delete

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();

/** Creates a fresh demo practice. Returns its id and the 2 visitor accounts. */
export function createDemo(db, dataDir) {
  const tag = randomBytes(5).toString('hex');
  const t = now();
  const ins = (table, row) => {
    const keys = Object.keys(row);
    return Number(db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row)).lastInsertRowid);
  };
  let out;
  tx(db, () => {
    const pid = ins('practices', {
      name: DEMO_NAME, slug: `demo-${tag}`, brand_color: '#2F6B5E', logo_url: '', is_demo: 1, created_at: t,
      terms: JSON.stringify({ portal: 'Clinician portal', member: 'clinician', members: 'clinicians', lead: 'supervisor', org: 'practice', checklist: 'Before your first client', onboarding: 'Clinical onboarding' }),
      welcome_quote: 'Every new clinician, ready for their first client.', welcome_quote_ref: 'CLINICALLY READY',
      client_messaging: JSON.stringify({ label: 'SimplePractice', url: 'https://secure.simplepractice.com' }),
    });
    const user = (name, title, role, extra = {}) => ins('users', {
      practice_id: pid, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${tag}@demo.invalid`, name, title, role,
      password_hash: null, active: 1, created_at: t, ...extra,
    });
    const owner = user('You (practice owner)', 'Clinical director', 'owner');
    const visitor = user('You (new clinician)', 'Associate clinician', 'clinician');
    const team = TEAM.map((m) => ({ ...m, id: user(m.name, m.title, 'clinician', { last_seen_at: hoursAgo(m.seen * 24) }) }));

    const appIds = {};
    let pos = 1;
    for (const [name, a] of Object.entries(APPS)) appIds[name] = ins('apps', { practice_id: pid, name, position: pos++, created_at: t, ...a });
    const formId = ins('forms', { practice_id: pid, kind: 'sign', title: 'Confidentiality agreement', body: AGREEMENT, template_url: '', required: 1, active: 1, version: 1, position: 1, created_at: t, updated_at: t });
    const moreForms = MORE_FORMS.map(([title, body], i) => ({ title, body, id: ins('forms', { practice_id: pid, kind: 'sign', title, body, template_url: '', required: 1, active: 1, version: 1, position: i + 2, created_at: t, updated_at: t }) }));
    for (const f of DEMO_FILES) {
      const updated = hoursAgo(f.daysAgo * 24);
      ins('resources', {
        practice_id: pid, lesson_id: null, category: f.category, title: f.title, file_type: path.extname(f.file).slice(1),
        size_bytes: f.sizeBytes, stored_name: `demo-library/${f.file}`, preview_name: f.preview ? `demo-library/${f.preview}` : '',
        page_count: f.pages, created_at: updated, updated_at: updated,
      });
    }

    const lessonIds = [];
    SECTIONS.forEach((s, si) => {
      const weekId = ins('weeks', { practice_id: pid, position: si + 1, title: s.title, subtitle: s.subtitle, links: '[]', quiz_on: 1, quiz_draw: 4, quiz_pass: 75 });
      s.weekId = weekId;
      s.qids = [];
      for (const p of s.pool) {
        s.qids.push(ins('section_questions', { practice_id: pid, week_id: weekId, prompt: p.prompt, options: JSON.stringify(p.options), correct_index: p.correct, explanation: p.explanation, active: 1, created_at: t, updated_at: t }));
      }
      s.lessons.forEach((l, li) => {
        const blocks = [];
        if (l.video !== null) blocks.push({ type: 'video', url: l.video, transcript: '' }); // null = no video on this step
        blocks.push({ type: 'p', text: l.overview });
        blocks.push({ type: 'takeaways', items: l.takeaways });
        blocks.push(...l.content);
        if (l.links) blocks.push({ type: 'links', items: l.links });
        for (const a of l.apps ?? []) blocks.push({ type: 'app', appId: appIds[a] });
        if (l.form) blocks.push({ type: 'form', formId });
        blocks.push({ type: 'quiz' });
        const id = ins('lessons', {
          practice_id: pid, week_id: weekId, position: li + 1, title: l.title, label: l.label, presenter: 'Cedar Grove team',
          duration_min: l.min, video_url: l.video || '', poster_url: POSTER, overview: l.overview, takeaways: JSON.stringify(l.takeaways),
          transcript: '', content: JSON.stringify(l.content), blocks: JSON.stringify(blocks), updated_at: t,
        });
        ins('quiz_questions', { practice_id: pid, lesson_id: id, prompt: l.quiz.prompt, options: JSON.stringify(l.quiz.options), correct_index: l.quiz.correct, explanation: l.quiz.explanation });
        lessonIds.push({ id, weekId, si });
      });
    });
    CHECKLIST.forEach(([title, detail], i) => ins('checklist_items', { practice_id: pid, position: i + 1, title, detail, section: 'First week' }));

    // The sample team's progress, quiz tries and signatures.
    for (const m of team) {
      lessonIds.forEach((l, i) => {
        if (i < m.done) ins('lesson_progress', { user_id: m.id, lesson_id: l.id, practice_id: pid, status: 'complete', position_sec: 0, quiz_correct: 1, completed_at: hoursAgo(72 - i * 6) });
        else if (i === m.done && m.started) ins('lesson_progress', { user_id: m.id, lesson_id: l.id, practice_id: pid, status: 'started', position_sec: 40 });
      });
      // Each section they've tried: a failed first try where noted, then a pass if they passed.
      for (const si of new Set([...m.failedFirst, ...m.passed])) {
        const sec = SECTIONS[si];
        const tries = [...(m.failedFirst.includes(si) ? [false] : []), ...(m.passed.includes(si) ? [true] : [])];
        tries.forEach((ok, n) => {
          const pick = ok ? [0, 1, 2, 3] : [2, 3, 4, 5];
          const retry = ok && n > 0; // a pass after a failed try just makes it: 3 of 4 (75%)
          const items = pick.map((k, j) => {
            const p = sec.pool[k];
            const wrong = ok ? retry && j === 3 : j < 2; // a failed try: 2 of 4 wrong (50%)
            return { qid: sec.qids[k], prompt: p.prompt, options: p.options, correct: p.correct, explanation: p.explanation, choice: wrong ? (p.correct + 1) % p.options.length : p.correct };
          });
          const correct = items.filter((x) => x.choice === x.correct).length;
          ins('quiz_attempts', { practice_id: pid, user_id: m.id, week_id: sec.weekId, items: JSON.stringify(items), pass_percent: 75, started_at: hoursAgo(40 - si * 8 - n), submitted_at: hoursAgo(39 - si * 8 - n), correct, total: 4, passed: correct >= 3 ? 1 : 0 });
        });
      }
      if (m.signed) {
        for (const f of [{ id: formId, title: 'Confidentiality agreement', body: AGREEMENT }, ...moreForms.slice(0, m.signedAll ? 2 : 1)]) {
          ins('form_submissions', {
            practice_id: pid, form_id: f.id, user_id: m.id, version: 1, title: f.title, body: f.body,
            body_hash: createHash('sha256').update(f.body).digest('hex'), typed_name: m.name, ip: '203.0.113.10', user_agent: 'Demo', submitted_at: hoursAgo(60),
          });
        }
      }
    }
    const [maya, luis, noor] = team;
    // Open questions for the owner's home page, plus one already answered.
    ins('questions', { practice_id: pid, user_id: luis.id, lesson_id: lessonIds[3]?.id ?? null, body: 'Do I document a no-show in SimplePractice, or tell the office first?', created_at: hoursAgo(3) });
    ins('questions', { practice_id: pid, user_id: noor.id, lesson_id: lessonIds[1]?.id ?? null, body: 'My Zoom test call keeps dropping. Is there a backup link for telehealth?', created_at: hoursAgo(20) });
    ins('questions', { practice_id: pid, user_id: maya.id, lesson_id: lessonIds[0]?.id ?? null, body: 'Who is my backup supervisor when you are away?', created_at: hoursAgo(50), resolved_at: hoursAgo(45) });
    ins('notifications', { practice_id: pid, user_id: owner, kind: 'quiz', title: `${maya.name} passed the Clinical basics quiz (100%)`, body: '', link: `/admin/people/${maya.id}`, created_at: hoursAgo(5) });
    ins('notifications', { practice_id: pid, user_id: owner, kind: 'quiz', title: `${luis.name} passed the First week quiz (75%)`, body: '', link: `/admin/people/${luis.id}`, created_at: hoursAgo(26) });
    out = { practiceId: pid, owner, clinician: visitor };
  });
  return out;
}

/** Deletes a demo practice and everything in it (never a real practice). */
export function deleteDemo(db, practiceId, dataDir) {
  const p = db.prepare('SELECT * FROM practices WHERE id = ? AND is_demo = 1').get(practiceId);
  if (!p) return false;
  tx(db, () => {
    const users = db.prepare('SELECT id FROM users WHERE practice_id = ?').all(practiceId).map((u) => u.id);
    for (const uid of users) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM user_identities WHERE user_id = ?').run(uid);
    }
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'practices'").all().map((r) => r.name);
    for (const t of tables) {
      if (db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'practice_id')) db.prepare(`DELETE FROM ${t} WHERE practice_id = ?`).run(practiceId);
    }
    db.prepare('DELETE FROM practices WHERE id = ?').run(practiceId);
  });
  if (dataDir) fs.rmSync(path.join(dataDir, 'uploads', String(practiceId)), { recursive: true, force: true });
  return true;
}

/** Deletes demo copies older than DEMO_HOURS. */
export function sweepDemos(db, dataDir) {
  const cutoff = hoursAgo(DEMO_HOURS);
  const old = db.prepare('SELECT id FROM practices WHERE is_demo = 1 AND created_at < ?').all(cutoff);
  for (const { id } of old) deleteDemo(db, id, dataDir);
  return old.length;
}

/** Runs the sweep every hour. */
export function scheduleDemoSweep(db, dataDir, log = console.log) {
  const run = () => {
    try {
      const n = sweepDemos(db, dataDir);
      if (n) log(`Demo: removed ${n} old ${n === 1 ? 'copy' : 'copies'}.`);
    } catch (e) {
      log(`Demo sweep failed: ${e.message}`);
    }
  };
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
