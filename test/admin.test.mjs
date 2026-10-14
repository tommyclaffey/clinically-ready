import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, OFFICE, setup } from './helpers.mjs';

let t;
let angela;
let office;
let jordan;
before(async () => {
  t = await setup();
  angela = await t.as(ANGELA);
  office = await t.as(OFFICE);
  jordan = await t.as(JORDAN);
});
after(() => t.close());

const userId = (email) => t.db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;

describe('role checks', () => {
  test('clinicians get 403 on every /api/admin/* route', async () => {
    const calls = [
      ['GET', '/api/admin/team'],
      ['GET', '/api/admin/content'],
      ['GET', '/api/admin/questions'],
      ['POST', '/api/admin/invites', { email: 'x@x.test' }],
      ['DELETE', '/api/admin/invites/x@x.test'],
      ['PUT', `/api/admin/users/${userId(JORDAN)}`, { role: 'owner' }],
      ['POST', '/api/admin/weeks', { title: 'W' }],
      ['PUT', '/api/admin/weeks/1', { title: 'W' }],
      ['DELETE', '/api/admin/weeks/1'],
      ['POST', '/api/admin/lessons', { weekId: 1, title: 'L' }],
      ['PUT', '/api/admin/lessons/1', { title: 'L' }],
      ['DELETE', '/api/admin/lessons/1'],
      ['PUT', '/api/admin/lessons/1/quiz', []],
      ['POST', '/api/admin/checklist', { title: 'C' }],
      ['PUT', '/api/admin/checklist/1', { title: 'C' }],
      ['DELETE', '/api/admin/checklist/1'],
      ['POST', '/api/admin/questions/1/resolve'],
      ['PUT', '/api/admin/practice', { name: 'Hacked' }],
    ];
    for (const [method, url, body] of calls) {
      const r = await jordan.req(method, url, body);
      assert.equal(r.status, 403, `${method} ${url}`);
    }
    // Nothing changed.
    assert.equal(t.db.prepare('SELECT role FROM users WHERE id = ?').get(userId(JORDAN)).role, 'clinician');
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM lessons').get().n, 9);
  });

  test('admins can manage content but practice settings are owner-only', async () => {
    assert.equal((await office.get('/api/admin/team')).status, 200);
    assert.equal((await office.put('/api/admin/practice', { name: 'Renamed' })).status, 403);
    const r = await angela.put('/api/admin/practice', { name: 'The Well', brandColor: '#1d5a78', logoUrl: '' });
    assert.equal(r.status, 200);
    const { terms, welcome, signIn, clientMessaging, ...rest } = r.body.practice;
    assert.equal(clientMessaging.label, 'SimplePractice');
    assert.deepEqual(signIn, { password: true, google: true, microsoft: true });
    assert.equal(welcome.ref, 'MATTHEW 11:28');
    assert.deepEqual(rest, { id: 1, name: 'The Well', slug: 'the-well', brandColor: '#1D5A78', logoUrl: '', paperworkEnabled: false, isDemo: false });
    assert.equal(terms.member, 'clinician');
  });

  test('brand colours must pass 4.5:1 on white', async () => {
    const { contrastOnWhite } = await import('../server/routes/admin.mjs');
    assert.ok(contrastOnWhite('#22688A') >= 4.5);
    const r = await angela.put('/api/admin/practice', { brandColor: '#B0E3F6' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /contrast on white is 1\.\d\d:1/);
    assert.equal((await angela.put('/api/admin/practice', { brandColor: 'blue' })).status, 400);
    assert.equal((await angela.put('/api/admin/practice', { logoUrl: 'javascript:alert(1)' })).status, 400);
  });
  test('public org page: branded sign-in, nothing private, welcome is owner-editable', async () => {
    const anon = t.client();
    const r = await anon.get('/api/orgs/the-well');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['brandColor', 'logoUrl', 'name', 'signIn', 'slug', 'terms', 'welcome']);
    assert.equal(r.body.terms.portal, 'Clinician portal');
    assert.equal((await anon.get('/api/orgs/nope')).status, 404);
    assert.equal((await office.put('/api/admin/practice', { welcome: { quote: 'x' } })).status, 403);
    const w = await angela.put('/api/admin/practice', { welcome: { quote: 'Welcome home.', ref: 'THE WELL' } });
    assert.equal(w.status, 200);
    assert.equal(w.body.practice.welcome.quote, 'Welcome home.');
    assert.ok(w.body.practice.welcome.photoUrl, 'fields left out are kept');
    assert.equal((await angela.put('/api/admin/practice', { welcome: { photoUrl: 'javascript:alert(1)' } })).status, 400);
    assert.equal((await angela.put('/api/admin/practice', { welcome: { quote: 'x'.repeat(301) } })).status, 400);
    await angela.put('/api/admin/practice', { welcome: { quote: '“Come to me, all you who are weary and burdened, and I will give you rest.”', ref: 'MATTHEW 11:28' } });
  });

  test('terms: The Well uses therapy words, owners can change them, bad input is rejected', async () => {
    const me = await angela.get('/api/me');
    assert.deepEqual(me.body.practice.terms, {
      portal: 'Clinician portal', member: 'clinician', members: 'clinicians',
      lead: 'supervisor', org: 'practice', checklist: 'Before your first client', onboarding: 'Clinical onboarding',
    });
    assert.equal((await office.put('/api/admin/practice', { terms: { member: 'x' } })).status, 403);
    const r = await angela.put('/api/admin/practice', { terms: { member: 'counselor', members: 'counselors' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.practice.terms.member, 'counselor');
    assert.equal(r.body.practice.terms.lead, 'supervisor', 'keys left out keep their saved value');
    assert.equal((await angela.put('/api/admin/practice', { terms: { member: 'x'.repeat(41) } })).status, 400);
    assert.equal((await angela.put('/api/admin/practice', { terms: ['clinician'] })).status, 400);
    // Unknown keys are ignored, not stored.
    await angela.put('/api/admin/practice', { terms: { member: 'clinician', hacker: '<script>' } });
    assert.ok(!('hacker' in (await angela.get('/api/me')).body.practice.terms));
    await angela.put('/api/admin/practice', { terms: { member: 'clinician', members: 'clinicians' } });
  });
});

describe('team', () => {
  test('GET /api/admin/team includes progress and pending invites', async () => {
    await angela.post('/api/admin/invites', { email: 'pending@thewell.test', name: 'Pat Pending', title: 'Intern', role: 'clinician' });
    const r = await office.get('/api/admin/team');
    const j = r.body.users.find((u) => u.email === JORDAN);
    assert.equal(j.progressPercent, 33);
    assert.equal(j.lessonsDone, 3);
    assert.equal(j.checklistDone, 2);
    assert.ok(j.lastSeenAt);
    assert.equal(j.active, true);
    const inv = r.body.invites.find((i) => i.email === 'pending@thewell.test');
    assert.equal(inv.name, 'Pat Pending');
    assert.equal(inv.role, 'clinician');
    assert.ok(!JSON.stringify(r.body).includes('token'));
  });
});

describe('invites', () => {
  test('create -> get -> accept -> reuse fails', async () => {
    const r = await angela.post('/api/admin/invites', { email: 'New.Hire@thewell.test', name: 'Nia Hire', title: 'Associate clinician', role: 'clinician' });
    assert.equal(r.status, 200);
    assert.match(r.body.inviteUrl, /^\/invite\/[\w-]{40,}$/);
    const token = r.body.inviteUrl.split('/').pop();
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM invites WHERE token_hash = ?').get(token).n, 0); // hash only

    const anon = t.client();
    const info = await anon.get(`/api/invites/${token}`);
    const { terms, org, ...invite } = info.body;
    assert.equal(org.slug, 'the-well');
    assert.ok(!('id' in org), 'public org shape has no internal id');
    assert.deepEqual(invite, { email: 'new.hire@thewell.test', name: 'Nia Hire', practiceName: 'The Well' });
    assert.equal(terms.portal, 'Clinician portal');

    assert.equal((await anon.post(`/api/invites/${token}/accept`, { name: 'Nia Hire', password: 'short' })).status, 400);
    const acc = await anon.post(`/api/invites/${token}/accept`, { name: 'Nia Hire', password: 'a-long-password' });
    assert.equal(acc.status, 200);
    assert.equal(acc.body.me.role, 'clinician');
    assert.equal(acc.body.me.title, 'Associate clinician');
    assert.equal(acc.body.practice.name, 'The Well');
    assert.equal((await anon.get('/api/dashboard')).status, 200);

    assert.equal((await t.client().get(`/api/invites/${token}`)).status, 404);
    assert.equal((await t.client().post(`/api/invites/${token}/accept`, { name: 'X', password: 'a-long-password' })).status, 404);
  });

  test('expired invites are 404', async () => {
    const r = await angela.post('/api/admin/invites', { email: 'late@thewell.test', role: 'clinician' });
    const token = r.body.inviteUrl.split('/').pop();
    t.db.prepare("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE email = ?").run('late@thewell.test');
    assert.equal((await t.client().get(`/api/invites/${token}`)).status, 404);
    assert.equal((await t.client().post(`/api/invites/${token}/accept`, { name: 'Late', password: 'a-long-password' })).status, 404);
  });

  test('re-inviting replaces the old link; revoke deletes it; existing users are 409', async () => {
    const first = (await angela.post('/api/admin/invites', { email: 'twice@thewell.test' })).body.inviteUrl.split('/').pop();
    const second = (await angela.post('/api/admin/invites', { email: 'twice@thewell.test' })).body.inviteUrl.split('/').pop();
    assert.equal((await t.client().get(`/api/invites/${first}`)).status, 404);
    assert.equal((await t.client().get(`/api/invites/${second}`)).status, 200);
    assert.deepEqual((await office.del('/api/admin/invites/twice@thewell.test')).body, { ok: true });
    assert.equal((await t.client().get(`/api/invites/${second}`)).status, 404);
    assert.equal((await office.del('/api/admin/invites/twice@thewell.test')).status, 404);
    assert.equal((await angela.post('/api/admin/invites', { email: JORDAN })).status, 409);
  });

  test('only owners can invite owners', async () => {
    assert.equal((await office.post('/api/admin/invites', { email: 'boss@thewell.test', role: 'owner' })).status, 403);
    assert.equal((await angela.post('/api/admin/invites', { email: 'boss@thewell.test', role: 'owner' })).status, 200);
  });
});

describe('user edits and last-owner protection', () => {
  test("can't demote or deactivate yourself", async () => {
    const me = userId(ANGELA);
    assert.equal((await angela.put(`/api/admin/users/${me}`, { role: 'admin' })).status, 409);
    assert.equal((await angela.put(`/api/admin/users/${me}`, { active: false })).status, 409);
    assert.equal((await angela.put(`/api/admin/users/${me}`, { title: 'Founder' })).status, 200);
  });

  test('admins cannot touch owners', async () => {
    const r = await office.put(`/api/admin/users/${userId(ANGELA)}`, { role: 'clinician' });
    assert.equal(r.status, 403);
    assert.equal((await office.put(`/api/admin/users/${userId(ANGELA)}`, { active: false })).status, 403);
    assert.equal((await office.put(`/api/admin/users/${userId(OFFICE)}`, { role: 'owner' })).status, 403);
  });

  test('the last owner can never be removed', async () => {
    // Put a second owner in place, then remove Angela; the remaining owner is the last one.
    const id = userId(OFFICE);
    assert.equal((await angela.put(`/api/admin/users/${id}`, { role: 'owner' })).status, 200);
    const officeAsOwner = await t.as(OFFICE);
    assert.equal((await officeAsOwner.put(`/api/admin/users/${userId(ANGELA)}`, { role: 'admin' })).status, 200);
    // Office is now the only owner: it can't step down or deactivate itself, and Angela (now admin) can't touch it.
    assert.equal((await officeAsOwner.put(`/api/admin/users/${id}`, { role: 'admin' })).status, 409);
    const angelaAdmin = await t.as(ANGELA);
    assert.equal((await officeAsOwner.put(`/api/admin/users/${id}`, { active: false })).status, 409);
    assert.equal((await angelaAdmin.put(`/api/admin/users/${id}`, { role: 'admin' })).status, 403);
    assert.equal((await angelaAdmin.put(`/api/admin/users/${id}`, { active: false })).status, 403);
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM users WHERE practice_id = 1 AND role = 'owner'").get().n, 1);
    // Restore: Angela owner again, Office back to admin.
    assert.equal((await officeAsOwner.put(`/api/admin/users/${userId(ANGELA)}`, { role: 'owner' })).status, 200);
    const angela2 = await t.as(ANGELA);
    assert.equal((await angela2.put(`/api/admin/users/${id}`, { role: 'admin' })).status, 200);
  });

  test('bad input -> 400, unknown user -> 404', async () => {
    const a = await t.as(ANGELA);
    assert.equal((await a.put(`/api/admin/users/${userId(JORDAN)}`, { role: 'superuser' })).status, 400);
    assert.equal((await a.put(`/api/admin/users/${userId(JORDAN)}`, { active: 'no' })).status, 400);
    assert.equal((await a.put('/api/admin/users/99999', { title: 'x' })).status, 404);
  });
});

describe('content editing', () => {
  test('weeks, lessons, quiz and checklist CRUD', async () => {
    const a = await t.as(ANGELA);
    const week = await a.post('/api/admin/weeks', { title: 'Week 4', subtitle: 'Extras' });
    assert.equal(week.status, 200);
    assert.equal(week.body.week.position, 4);

    const lesson = await a.post('/api/admin/lessons', {
      weekId: week.body.id, title: 'Telehealth basics', label: 'TELEHEALTH', presenter: 'Dr. Angela Claffey',
      durationMin: 9, videoUrl: 'https://vimeo.com/123', posterUrl: '', overview: 'How we run video sessions.',
      takeaways: ['Check the room', 'Confirm location'], transcript: '',
    });
    assert.equal(lesson.status, 200);
    assert.equal(lesson.body.lesson.position, 1);
    assert.deepEqual(lesson.body.lesson.takeaways, ['Check the room', 'Confirm location']);
    const lid = lesson.body.id;

    const quiz = await a.put(`/api/admin/lessons/${lid}/quiz`, [
      { prompt: 'Before a telehealth session you confirm...', options: ['Location', 'Nothing'], correctIndex: 0, explanation: 'For emergencies.' },
    ]);
    assert.equal(quiz.status, 200);
    assert.equal(quiz.body.quiz[0].correctIndex, 0);
    assert.equal((await a.put(`/api/admin/lessons/${lid}/quiz`, [{ prompt: 'Q', options: ['one'], correctIndex: 0 }])).status, 400);
    assert.equal((await a.put(`/api/admin/lessons/${lid}/quiz`, { quiz: [{ prompt: 'Q', options: ['a', 'b'], correctIndex: 5 }] })).status, 400);

    // The learner sees it, without the answer.
    const jl = (await jordan.get(`/api/lessons/${lid}`)).body;
    assert.equal(jl.quiz.length, 1);
    assert.equal(jl.quiz[0].correctIndex, undefined);
    assert.equal((await jordan.get('/api/dashboard')).body.progress.total, 10);

    const upd = await a.put(`/api/admin/lessons/${lid}`, { title: 'Telehealth essentials', durationMin: 10 });
    assert.equal(upd.body.lesson.title, 'Telehealth essentials');
    assert.equal(upd.body.lesson.label, 'TELEHEALTH'); // partial update keeps other fields
    assert.equal((await a.put(`/api/admin/lessons/${lid}`, { videoUrl: 'not a url' })).status, 400);

    const content = (await a.get('/api/admin/content')).body;
    assert.equal(content.weeks.length, 4);
    assert.equal(content.weeks[3].lessons[0].quiz[0].correctIndex, 0);
    assert.equal(content.checklist.length, 5);
    assert.equal(content.resources.length, 9);

    const item = await a.post('/api/admin/checklist', { title: 'Get your keys', detail: 'From the office' });
    assert.equal(item.body.item.position, 6);
    await jordan.post(`/api/checklist/${item.body.id}`, { done: true });
    assert.equal((await a.put(`/api/admin/checklist/${item.body.id}`, { title: 'Get your office keys' })).body.item.title, 'Get your office keys');
    assert.deepEqual((await a.del(`/api/admin/checklist/${item.body.id}`)).body, { ok: true });
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM checklist_done WHERE item_id = ?').get(item.body.id).n, 0);

    await jordan.post(`/api/lessons/${lid}/complete`);
    assert.deepEqual((await a.del(`/api/admin/weeks/${week.body.id}`)).body, { ok: true });
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM lessons WHERE id = ?').get(lid).n, 0);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM lesson_progress WHERE lesson_id = ?').get(lid).n, 0);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM quiz_questions WHERE lesson_id = ?').get(lid).n, 0);
    assert.equal((await jordan.get('/api/dashboard')).body.progress.total, 9);
  });

  test('validation: lessons need a real week and a title', async () => {
    const a = await t.as(ANGELA);
    assert.equal((await a.post('/api/admin/lessons', { weekId: 99999, title: 'X' })).status, 404);
    assert.equal((await a.post('/api/admin/lessons', { weekId: 1, title: '' })).status, 400);
    assert.equal((await a.post('/api/admin/weeks', { subtitle: 'no title' })).status, 400);
  });
});

describe('questions', () => {
  test('learner asks, admin sees asker + lesson and resolves', async () => {
    await jordan.post('/api/questions', { lessonId: 4, body: 'Where do I record spiritual-care consent?' });
    const list = (await office.get('/api/admin/questions')).body;
    const q = list.find((x) => x.body.startsWith('Where do I record'));
    assert.equal(q.askerName, 'Jordan Lee');
    assert.equal(q.lessonTitle, 'Faith-integrated care: our model');
    assert.equal(q.resolvedAt, null);
    assert.deepEqual((await office.post(`/api/admin/questions/${q.id}/resolve`)).body, { ok: true });
    const again = (await office.get('/api/admin/questions')).body.find((x) => x.id === q.id);
    assert.ok(again.resolvedAt);
    assert.ok((await jordan.get('/api/questions')).body.find((x) => x.id === q.id).resolvedAt);
  });
});

describe('source-material links on sections and lessons', () => {
  test('owners add links; learners see them on the path, the week and the lesson; bad links are refused', async () => {
    const week = t.db.prepare('SELECT id FROM weeks ORDER BY position LIMIT 1').get();
    const lesson = t.db.prepare('SELECT id FROM lessons WHERE week_id = ? ORDER BY position LIMIT 1').get(week.id);
    const wLinks = [{ label: 'Week 1 folder', url: 'https://drive.google.com/drive/folders/abc' }];
    const lLinks = [{ label: 'Welcome script', url: 'https://docs.google.com/document/d/xyz/edit' }];
    assert.equal((await angela.put(`/api/admin/weeks/${week.id}`, { links: wLinks })).status, 200);
    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { links: lLinks })).status, 200);

    const path = (await jordan.get('/api/dashboard')).body.path;
    assert.deepEqual(path[0].links, wLinks);
    assert.deepEqual((await jordan.get('/api/weeks')).body[0].links, wLinks);
    const detail = (await jordan.get(`/api/lessons/${lesson.id}`)).body;
    assert.deepEqual(detail.lesson.links, lLinks);
    assert.deepEqual(detail.week.links, wLinks);

    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { links: [{ label: 'x', url: 'javascript:alert(1)' }] })).status, 400);
    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { links: [{ label: '', url: 'https://x.test' }] })).status, 400);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ label: `L${i}`, url: 'https://x.test' }));
    assert.equal((await angela.put(`/api/admin/weeks/${week.id}`, { links: eleven })).status, 400);
    assert.equal((await jordan.put(`/api/admin/weeks/${week.id}`, { links: wLinks })).status, 403);
    // Clearing works.
    await angela.put(`/api/admin/weeks/${week.id}`, { links: [] });
    assert.deepEqual((await jordan.get('/api/weeks')).body[0].links, []);
  });
});

describe('lesson content blocks', () => {
  test('valid blocks are stored and returned to learners; unknown types and oversize are refused', async () => {
    const lesson = t.db.prepare('SELECT id FROM lessons ORDER BY id LIMIT 1').get();
    const content = [
      { type: 'h', text: 'Response times' },
      { type: 'p', text: 'Reply to every inquiry within 1 business day.' },
      { type: 'checklist', items: ['Verify insurance', 'Send intake forms'] },
      { type: 'steps', items: ['Stop', 'Assess', 'Consult'] },
      { type: 'quote', text: 'I am a registered associate working under the supervision of Dr. Angela Claffey.' },
      { type: 'dodont', do: ['Listen calmly.'], dont: ['Promise total confidentiality.'] },
      { type: 'callout', text: '<script>alert(1)</script> is just text here' },
    ];
    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { content })).status, 200);
    const got = (await jordan.get(`/api/lessons/${lesson.id}`)).body.lesson.content;
    assert.equal(got.length, 7);
    assert.deepEqual(got[5], { type: 'dodont', do: ['Listen calmly.'], dont: ['Promise total confidentiality.'] });
    assert.equal(got[6].text, '<script>alert(1)</script> is just text here', 'stored as plain text; the UI never renders HTML');
    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { content: [{ type: 'html', text: '<b>x</b>' }] })).status, 400);
    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { content: [{ type: 'list', items: Array(31).fill('x') }] })).status, 400);
    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { content: [{ type: 'p', text: 'x'.repeat(1201) }] })).status, 400);
    await angela.put(`/api/admin/lessons/${lesson.id}`, { content: [] });
  });
});
