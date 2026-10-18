// SQLite via node:sqlite. Schema matches SPEC §2; migrations are keyed on PRAGMA user_version.
import fs from 'node:fs';
import path from 'node:path';
import { legacyBlocks } from './pageblocks.mjs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  `
  CREATE TABLE practices(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
    brand_color TEXT DEFAULT '#22688A', logo_url TEXT, created_at TEXT);
  CREATE TABLE users(
    id INTEGER PRIMARY KEY, practice_id INT NOT NULL, email TEXT UNIQUE COLLATE NOCASE NOT NULL,
    name TEXT, title TEXT, role TEXT CHECK(role IN ('owner','admin','clinician')),
    password_hash TEXT, active INT DEFAULT 1, created_at TEXT, last_seen_at TEXT);
  CREATE TABLE invites(
    token_hash TEXT PRIMARY KEY, practice_id INT NOT NULL, email TEXT COLLATE NOCASE, name TEXT,
    title TEXT, role TEXT, created_by INT, created_at TEXT, expires_at TEXT, accepted_at TEXT);
  CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id INT NOT NULL, created_at TEXT, expires_at TEXT);
  CREATE TABLE weeks(id INTEGER PRIMARY KEY, practice_id INT NOT NULL, position INT, title TEXT, subtitle TEXT);
  CREATE TABLE lessons(
    id INTEGER PRIMARY KEY, practice_id INT NOT NULL, week_id INT NOT NULL, position INT, title TEXT,
    label TEXT, presenter TEXT, duration_min INT, video_url TEXT, poster_url TEXT,
    overview TEXT, takeaways TEXT, transcript TEXT, updated_at TEXT);
  CREATE TABLE quiz_questions(
    id INTEGER PRIMARY KEY, practice_id INT NOT NULL, lesson_id INT NOT NULL, prompt TEXT,
    options TEXT, correct_index INT, explanation TEXT);
  CREATE TABLE resources(
    id INTEGER PRIMARY KEY, practice_id INT NOT NULL, lesson_id INT NULL, category TEXT,
    title TEXT, file_type TEXT, size_bytes INT, stored_name TEXT, created_at TEXT);
  CREATE TABLE checklist_items(id INTEGER PRIMARY KEY, practice_id INT NOT NULL, position INT, title TEXT, detail TEXT);
  CREATE TABLE lesson_progress(
    user_id INT, lesson_id INT, practice_id INT NOT NULL, status TEXT,
    position_sec INT DEFAULT 0, quiz_correct INT, completed_at TEXT, PRIMARY KEY(user_id, lesson_id));
  CREATE TABLE checklist_done(user_id INT, item_id INT, practice_id INT NOT NULL, done_at TEXT, PRIMARY KEY(user_id, item_id));
  CREATE TABLE notes(user_id INT, lesson_id INT, practice_id INT NOT NULL, body TEXT, updated_at TEXT, PRIMARY KEY(user_id, lesson_id));
  CREATE TABLE questions(
    id INTEGER PRIMARY KEY, practice_id INT NOT NULL, user_id INT, lesson_id INT NULL, body TEXT,
    created_at TEXT, resolved_at TEXT);

  CREATE INDEX users_practice ON users(practice_id);
  CREATE INDEX invites_practice ON invites(practice_id, email);
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE INDEX weeks_practice ON weeks(practice_id, position);
  CREATE INDEX lessons_practice ON lessons(practice_id, week_id, position);
  CREATE INDEX quiz_lesson ON quiz_questions(practice_id, lesson_id);
  CREATE INDEX resources_practice ON resources(practice_id, lesson_id);
  CREATE INDEX checklist_practice ON checklist_items(practice_id, position);
  CREATE INDEX questions_practice ON questions(practice_id, user_id);
  `,
  // v2 (Oct 8): per-organisation wording, so the app isn't locked to therapy practices.
  `ALTER TABLE practices ADD COLUMN terms TEXT;`,
  // v3 (Oct 8): each organisation's own sign-in panel (photo + welcome quote).
  `ALTER TABLE practices ADD COLUMN welcome_quote TEXT;
   ALTER TABLE practices ADD COLUMN welcome_quote_ref TEXT;
   ALTER TABLE practices ADD COLUMN welcome_photo_url TEXT;`,
  // v4 (Oct 8): sign in with Google / Microsoft. Invites still decide who gets in.
  `CREATE TABLE user_identities(
     provider TEXT NOT NULL, subject TEXT NOT NULL, user_id INT NOT NULL, email TEXT, created_at TEXT,
     PRIMARY KEY(provider, subject));
   CREATE INDEX identities_user ON user_identities(user_id);
   CREATE TABLE oauth_states(
     state_hash TEXT PRIMARY KEY, provider TEXT, verifier TEXT, nonce TEXT, invite_hash TEXT,
     link_user_id INT, next TEXT, created_at TEXT, expires_at TEXT);
   ALTER TABLE practices ADD COLUMN signin_methods TEXT;`,
  // v5 (Oct 8): replies on questions, the notification bell, and where client questions go (e.g. SimplePractice).
  `CREATE TABLE question_replies(
     id INTEGER PRIMARY KEY, practice_id INT NOT NULL, question_id INT NOT NULL, user_id INT, body TEXT, created_at TEXT);
   CREATE INDEX replies_question ON question_replies(practice_id, question_id);
   CREATE TABLE notifications(
     id INTEGER PRIMARY KEY, practice_id INT NOT NULL, user_id INT NOT NULL, kind TEXT, title TEXT, body TEXT,
     link TEXT, created_at TEXT, read_at TEXT);
   CREATE INDEX notifications_user ON notifications(user_id, read_at);
   ALTER TABLE practices ADD COLUMN client_messaging TEXT;`,
  // v6 (Oct 8): source-material links on each section (week) and lesson, e.g. the practice's Google Drive docs.
  `ALTER TABLE weeks ADD COLUMN links TEXT;
   ALTER TABLE lessons ADD COLUMN links TEXT;`,
  // v7 (Oct 9): positions (e.g. Associate / Intern) with their own checklist items; items grouped by section.
  `CREATE TABLE tracks(id INTEGER PRIMARY KEY, practice_id INT NOT NULL, name TEXT NOT NULL, position INT);
   CREATE INDEX tracks_practice ON tracks(practice_id, position);
   ALTER TABLE users ADD COLUMN track_id INT;
   ALTER TABLE invites ADD COLUMN track_id INT;
   ALTER TABLE checklist_items ADD COLUMN track_id INT;
   ALTER TABLE checklist_items ADD COLUMN section TEXT;`,
  // v8 (Oct 9): a lesson's reading, as structured blocks (headings, lists, checklists, steps, quotes, do/don't).
  `ALTER TABLE lessons ADD COLUMN content TEXT;`,
  // v9 (Oct 9): every quiz answer (results for admins), paperwork (agreements to sign, forms to upload),
  // uploaded lesson videos, and the per-practice switch for tax/employment forms.
  `CREATE TABLE quiz_answers(
     id INTEGER PRIMARY KEY, practice_id INT NOT NULL, user_id INT NOT NULL, lesson_id INT NOT NULL,
     question_id INT NOT NULL, choice INT, correct INT, answered_at TEXT);
   CREATE INDEX quiz_answers_user ON quiz_answers(practice_id, user_id, question_id, id);
   CREATE TABLE forms(
     id INTEGER PRIMARY KEY, practice_id INT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('sign','upload')),
     title TEXT NOT NULL, body TEXT, template_url TEXT, track_id INT, required INT DEFAULT 1, active INT DEFAULT 1,
     version INT DEFAULT 1, position INT DEFAULT 0, created_at TEXT, updated_at TEXT);
   CREATE INDEX forms_practice ON forms(practice_id, active, position);
   CREATE TABLE form_submissions(
     id INTEGER PRIMARY KEY, practice_id INT NOT NULL, form_id INT NOT NULL, user_id INT NOT NULL, version INT,
     title TEXT, body TEXT, body_hash TEXT, typed_name TEXT, stored_name TEXT, file_ext TEXT, size_bytes INT,
     ip TEXT, user_agent TEXT, submitted_at TEXT, file_deleted_at TEXT);
   CREATE INDEX form_subs ON form_submissions(practice_id, form_id, user_id, id);
   CREATE TABLE videos(
     id INTEGER PRIMARY KEY, practice_id INT NOT NULL, stored_key TEXT NOT NULL, ext TEXT, size_bytes INT,
     title TEXT, created_at TEXT);
   ALTER TABLE practices ADD COLUMN paperwork_enabled INT DEFAULT 0;`,
  // v10 (Oct 10): pages built from blocks (each step picks video / text / links / files / quiz / paperwork / apps,
  // in any order), and the tools a practice uses (SimplePractice, Slack…). Existing lessons are converted.
  (db) => {
    db.exec(`ALTER TABLE lessons ADD COLUMN blocks TEXT;
      CREATE TABLE apps(
        id INTEGER PRIMARY KEY, practice_id INT NOT NULL, name TEXT NOT NULL, description TEXT, icon_url TEXT,
        web_url TEXT, mac_url TEXT, windows_url TEXT, ios_url TEXT, android_url TEXT, signin_note TEXT,
        position INT DEFAULT 0, created_at TEXT);
      CREATE INDEX apps_practice ON apps(practice_id, position);`);
    const lessons = db.prepare('SELECT * FROM lessons').all();
    const hasQuiz = db.prepare('SELECT 1 FROM quiz_questions WHERE lesson_id = ? LIMIT 1');
    const hasFiles = db.prepare('SELECT 1 FROM resources WHERE lesson_id = ? LIMIT 1');
    const save = db.prepare('UPDATE lessons SET blocks = ? WHERE id = ?');
    for (const l of lessons) {
      save.run(JSON.stringify(legacyBlocks(l, { hasQuiz: Boolean(hasQuiz.get(l.id)), hasFiles: Boolean(hasFiles.get(l.id)) })), l.id);
    }
  },
  // v11 (Oct 10): section quizzes. Each section can end with a quiz drawn from a pool of questions; staff must
  // pass it before the next section opens. Every attempt keeps a snapshot of the questions it asked.
  `ALTER TABLE weeks ADD COLUMN quiz_on INT NOT NULL DEFAULT 0;
   ALTER TABLE weeks ADD COLUMN quiz_draw INT NOT NULL DEFAULT 5;
   ALTER TABLE weeks ADD COLUMN quiz_pass INT NOT NULL DEFAULT 80;
   CREATE TABLE section_questions(
     id INTEGER PRIMARY KEY, practice_id INT NOT NULL, week_id INT NOT NULL, prompt TEXT NOT NULL, options TEXT NOT NULL,
     correct_index INT NOT NULL, explanation TEXT, active INT NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT);
   CREATE INDEX section_questions_week ON section_questions(practice_id, week_id, active);
   CREATE TABLE quiz_attempts(
     id INTEGER PRIMARY KEY, practice_id INT NOT NULL, user_id INT NOT NULL, week_id INT NOT NULL, items TEXT NOT NULL,
     pass_percent INT NOT NULL, started_at TEXT NOT NULL, submitted_at TEXT, correct INT, total INT, passed INT);
   CREATE INDEX quiz_attempts_user ON quiz_attempts(practice_id, user_id, week_id, id);`,
  // v12 (Oct 10): the public demo. Each visitor gets a throwaway copy of a sample practice (is_demo = 1).
  `ALTER TABLE practices ADD COLUMN is_demo INT NOT NULL DEFAULT 0;
   CREATE INDEX practices_demo ON practices(is_demo, created_at);`,
  // v13 (Oct 18): Resources cards show a first-page preview, the page count and when the file was updated.
  // preview_name: NULL = not tried yet, '' = no preview possible (the card shows a type illustration).
  `ALTER TABLE resources ADD COLUMN page_count INT;
   ALTER TABLE resources ADD COLUMN preview_name TEXT;
   ALTER TABLE resources ADD COLUMN updated_at TEXT;`,
];

export function openDb(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  let version = db.prepare('PRAGMA user_version').get().user_version;
  while (version < MIGRATIONS.length) {
    tx(db, () => {
      const m = MIGRATIONS[version];
      if (typeof m === 'function') m(db);
      else db.exec(m);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
    version += 1;
  }
  return db;
}

/** Run fn inside a transaction; roll back if it throws. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const now = () => new Date().toISOString();
