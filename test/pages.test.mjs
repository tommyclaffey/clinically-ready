// Steps built like a Notion page (ordered blocks), the outline order, and Tools (apps the team uses).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, OFFICE, lessonId, setup } from './helpers.mjs';

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

describe('page blocks', () => {
  test('existing lessons were converted: video first, then the same reading', async () => {
    const id = lessonId(t.db, 'Faith-integrated care: our model');
    const { lesson } = (await jordan.get(`/api/lessons/${id}`)).body;
    assert.equal(lesson.blocks[0].type, 'video');
    assert.ok(lesson.blocks.some((b) => b.type === 'takeaways' && b.items.length === 3));
    assert.ok(lesson.blocks.some((b) => b.type === 'quiz'), 'the quick check has a place on the page');
    assert.ok(lesson.blocks.some((b) => b.type === 'files'), 'its downloads have a place on the page');
  });

  test('a step can have no video, and blocks keep their order', async () => {
    const id = lessonId(t.db, 'HIPAA and client privacy');
    const blocks = [
      { type: 'h', text: 'Before you start' },
      { type: 'p', text: 'Read this first.' },
      { type: 'links', items: [{ label: 'HHS: HIPAA basics', url: 'https://www.hhs.gov/hipaa/index.html' }] },
      { type: 'divider' },
      { type: 'checklist', items: ['Lock your screen', 'Use the portal'] },
    ];
    const r = await angela.put(`/api/admin/lessons/${id}`, { blocks });
    assert.equal(r.status, 200);
    const got = (await jordan.get(`/api/lessons/${id}`)).body.lesson;
    assert.deepEqual(got.blocks.slice(0, 5).map((b) => b.type), ['h', 'p', 'links', 'divider', 'checklist']);
    assert.equal(got.videoUrl, '', 'no video block means no video');
  });

  test('a video in the middle of the page is still the step’s video', async () => {
    const id = lessonId(t.db, 'HIPAA and client privacy');
    const blocks = [{ type: 'p', text: 'Intro' }, { type: 'video', url: 'https://www.loom.com/share/abc123', transcript: '' }];
    await angela.put(`/api/admin/lessons/${id}`, { blocks });
    assert.equal(t.db.prepare('SELECT video_url FROM lessons WHERE id = ?').get(id).video_url, 'https://www.loom.com/share/abc123');
    // The Videos page sets just the link: it lands in the existing video block, not a new one.
    await angela.put(`/api/admin/lessons/${id}`, { videoUrl: 'https://youtu.be/xyz' });
    const got = (await angela.get(`/api/lessons/${id}`)).body.lesson.blocks;
    assert.equal(got.filter((b) => b.type === 'video').length, 1);
    assert.equal(got[1].url, 'https://youtu.be/xyz');
  });

  test('bad blocks are refused', async () => {
    const id = lessonId(t.db, 'HIPAA and client privacy');
    const bad = [
      [{ type: 'script', text: 'x' }],
      [{ type: 'video', url: 'javascript:alert(1)' }],
      [{ type: 'links', items: [{ label: 'x', url: 'ftp://x' }] }],
      [{ type: 'form', formId: 99999 }],
      [{ type: 'app', appId: 99999 }],
      Array.from({ length: 151 }, () => ({ type: 'divider' })),
      'not a list',
    ];
    for (const blocks of bad) assert.equal((await angela.put(`/api/admin/lessons/${id}`, { blocks })).status, 400, JSON.stringify(blocks).slice(0, 60));
    assert.equal((await jordan.put(`/api/admin/lessons/${id}`, { blocks: [] })).status, 403);
  });

  test('a page can place an agreement; the learner gets its status with the lesson', async () => {
    const form = (await angela.post('/api/admin/forms', { kind: 'sign', title: 'Handbook acknowledgement', body: 'I have read the handbook.' })).body.id;
    const id = lessonId(t.db, 'Intake and informed consent');
    assert.equal((await angela.put(`/api/admin/lessons/${id}`, { blocks: [{ type: 'form', formId: form }, { type: 'p', text: 'Then watch.' }] })).status, 200);
    const b = (await jordan.get(`/api/lessons/${id}`)).body;
    assert.equal(b.lesson.blocks[0].formId, form);
    assert.equal(b.forms.length, 1);
    assert.equal(b.forms[0].status, 'todo');
  });

  test('a new step can start empty', async () => {
    const weekId = t.db.prepare('SELECT id FROM weeks ORDER BY position LIMIT 1').get().id;
    const r = await angela.post('/api/admin/lessons', { weekId, title: 'Set up your laptop', blocks: [], notify: false });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.lesson.blocks, []);
  });
});

describe('outline order', () => {
  test('sections and steps reorder, and a step can move to another section', async () => {
    const c = (await angela.get('/api/admin/content')).body;
    const [a, b] = c.weeks;
    const moved = a.lessons[0].id;
    const sections = [
      { id: b.id, lessonIds: [moved, ...b.lessons.map((l) => l.id)] },
      { id: a.id, lessonIds: a.lessons.slice(1).map((l) => l.id).reverse() },
    ];
    assert.equal((await jordan.put('/api/admin/outline', { sections })).status, 403);
    assert.equal((await angela.put('/api/admin/outline', { sections })).status, 200);
    const after = (await angela.get('/api/admin/content')).body.weeks;
    assert.equal(after[0].id, b.id);
    assert.equal(after[0].lessons[0].id, moved);
    assert.deepEqual(after[1].lessons.map((l) => l.id), sections[1].lessonIds);
    assert.equal((await angela.put('/api/admin/outline', { sections: [{ id: a.id, lessonIds: [moved, moved] }] })).status, 400);
    assert.equal((await angela.put('/api/admin/outline', { sections: [{ id: 99999, lessonIds: [] }] })).status, 404);
  });
});

describe('tools', () => {
  let slack;
  test('admins add tools; everyone can see them', async () => {
    assert.equal((await jordan.post('/api/admin/apps', { name: 'Slack', webUrl: 'https://slack.com/signin' })).status, 403);
    assert.equal((await angela.post('/api/admin/apps', { name: 'Slack' })).status, 400, 'needs a link');
    assert.equal((await angela.post('/api/admin/apps', { name: 'Slack', webUrl: 'javascript:x' })).status, 400);
    const r = await office.post('/api/admin/apps', {
      name: 'Slack', description: 'Team chat', webUrl: 'https://slack.com/signin', macUrl: 'https://slack.com/downloads', signinNote: 'Use your work email.',
    });
    assert.equal(r.status, 200);
    slack = r.body.id;
    await angela.post('/api/admin/apps', { name: 'SimplePractice', webUrl: 'https://secure.simplepractice.com' });
    const list = (await jordan.get('/api/apps')).body;
    assert.deepEqual(list.map((a) => a.name), ['Slack', 'SimplePractice']);
    assert.equal(list[0].macUrl, 'https://slack.com/downloads');
    assert.equal(list[0].signinNote, 'Use your work email.');
  });

  test('a page can show a tool; removing the tool removes it from the page', async () => {
    const id = lessonId(t.db, 'Intake and informed consent');
    await angela.put(`/api/admin/lessons/${id}`, { blocks: [{ type: 'app', appId: slack }, { type: 'p', text: 'Say hi in #general.' }] });
    const b = (await jordan.get(`/api/lessons/${id}`)).body;
    assert.equal(b.apps[0].name, 'Slack');
    assert.equal((await angela.put(`/api/admin/apps/${slack}`, { name: 'Slack (team chat)' })).status, 200);
    assert.equal((await angela.del(`/api/admin/apps/${slack}`)).status, 200);
    const after = (await jordan.get(`/api/lessons/${id}`)).body;
    assert.ok(!after.lesson.blocks.some((x) => x.type === 'app'));
    assert.deepEqual(after.apps, []);
  });

  test('tools belong to one practice', async () => {
    const other = await t.client();
    assert.equal((await other.get('/api/apps')).status, 401);
    const mine = (await jordan.get('/api/apps')).body[0].id;
    t.db.prepare("INSERT INTO practices(name, slug) VALUES ('Elsewhere', 'elsewhere')").run();
    const pid = t.db.prepare("SELECT id FROM practices WHERE slug = 'elsewhere'").get().id;
    t.db.prepare('UPDATE apps SET practice_id = ? WHERE id = ?').run(pid, mine);
    assert.equal((await angela.put(`/api/admin/apps/${mine}`, { name: 'x' })).status, 404);
    assert.equal((await jordan.get('/api/apps')).body.length, 0);
  });
});
