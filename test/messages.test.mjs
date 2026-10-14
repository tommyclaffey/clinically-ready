// Replies on questions, the notification bell, and the "client questions go to" link.
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

const unread = async (c) => (await c.get('/api/notifications')).body.unread;

describe('questions and replies', () => {
  let qid;

  test('a new question alerts the owner and admin, not the asker', async () => {
    const before = { a: await unread(angela), o: await unread(office), j: await unread(jordan) };
    qid = (await jordan.post('/api/questions', { body: 'When do I shadow a session?' })).body.id;
    assert.equal(await unread(angela), before.a + 1);
    assert.equal(await unread(office), before.o + 1);
    assert.equal(await unread(jordan), before.j);
    const n = (await angela.get('/api/notifications')).body.items[0];
    assert.equal(n.kind, 'question');
    assert.match(n.title, /Jordan Lee asked a question/);
    assert.equal(n.link, `/admin#q-${qid}`);
  });

  test('staff reply -> the asker sees it in their thread and gets a bell alert', async () => {
    const j0 = await unread(jordan);
    const r = await angela.post(`/api/questions/${qid}/replies`, { body: 'Thursday at 2. Bring your notebook.' });
    assert.equal(r.status, 200);
    assert.equal(await unread(jordan), j0 + 1);
    const mine = (await jordan.get('/api/questions')).body.find((q) => q.id === qid);
    assert.equal(mine.replies.length, 1);
    assert.equal(mine.replies[0].authorName, 'Dr. Angela Claffey');
    assert.equal(mine.replies[0].fromAsker, false);
    assert.equal(mine.replies[0].mine, false);
  });

  test('a follow-up from the asker reopens a resolved question and alerts staff', async () => {
    await angela.post(`/api/admin/questions/${qid}/resolve`);
    const a0 = await unread(angela);
    assert.equal((await jordan.post(`/api/questions/${qid}/replies`, { body: 'Thanks! Which room?' })).status, 200);
    assert.equal(await unread(angela), a0 + 1);
    const adminView = (await angela.get('/api/admin/questions')).body.find((q) => q.id === qid);
    assert.equal(adminView.resolvedAt, null, 'reopened');
    assert.deepEqual(adminView.replies.map((r) => r.fromAsker), [false, true]);
  });

  test('other clinicians cannot read or reply to someone else’s question', async () => {
    const other = (await angela.post('/api/admin/invites', { email: 'peer@thewell.test', name: 'Peer', title: '', role: 'clinician' })).body;
    const token = other.inviteUrl.split('/invite/')[1];
    const peer = t.client();
    await peer.post(`/api/invites/${token}/accept`, { name: 'Peer', password: 'peer-password-123' });
    assert.equal((await peer.post(`/api/questions/${qid}/replies`, { body: 'butting in' })).status, 404);
    assert.equal((await peer.get('/api/questions')).body.length, 0);
    assert.equal((await peer.get('/api/admin/questions')).status, 403);
  });

  test('replies validate input and 404 on unknown questions', async () => {
    assert.equal((await angela.post(`/api/questions/${qid}/replies`, { body: '   ' })).status, 400);
    assert.equal((await angela.post('/api/questions/99999/replies', { body: 'x' })).status, 404);
    assert.equal((await angela.post('/api/questions/abc/replies', { body: 'x' })).status, 404);
  });
});

describe('notifications', () => {
  test('new lessons alert everyone but the author', async () => {
    const j0 = await unread(jordan);
    const a0 = await unread(angela);
    const weekId = t.db.prepare('SELECT id FROM weeks ORDER BY position LIMIT 1').get().id;
    const r = await angela.post('/api/admin/lessons', { weekId, title: 'Boundaries and self-care', durationMin: 9 });
    assert.equal(r.status, 200);
    assert.equal(await unread(jordan), j0 + 1);
    assert.equal(await unread(angela), a0);
    const n = (await jordan.get('/api/notifications')).body.items[0];
    assert.equal(n.title, 'New lesson: Boundaries and self-care');
    assert.equal(n.link, `/lesson/${r.body.id}`);
  });

  test('bulk imports can skip the alert (notify: false)', async () => {
    const j0 = await unread(jordan);
    const weekId = t.db.prepare('SELECT id FROM weeks ORDER BY position LIMIT 1').get().id;
    assert.equal((await angela.post('/api/admin/lessons', { weekId, title: 'Imported quietly', notify: false })).status, 200);
    assert.equal(await unread(jordan), j0);
  });

  test('mark one read, then mark all read; only your own', async () => {
    const list = (await jordan.get('/api/notifications')).body;
    assert.ok(list.unread >= 2);
    const first = list.items[0].id;
    await jordan.post('/api/notifications/read', { ids: [first] });
    assert.equal(await unread(jordan), list.unread - 1);
    // Angela can't mark Jordan's as read.
    await angela.post('/api/notifications/read', { ids: list.items.map((i) => i.id) });
    assert.equal(await unread(jordan), list.unread - 1);
    await jordan.post('/api/notifications/read', {});
    assert.equal(await unread(jordan), 0);
  });

  test('signed out -> 401', async () => {
    assert.equal((await t.client().get('/api/notifications')).status, 401);
  });
});

describe('client questions link (e.g. SimplePractice)', () => {
  test('The Well points client questions to SimplePractice; owners can change or clear it', async () => {
    assert.deepEqual((await jordan.get('/api/me')).body.practice.clientMessaging, { label: 'SimplePractice', url: 'https://secure.simplepractice.com' });
    assert.equal((await office.put('/api/admin/practice', { clientMessaging: { label: 'X', url: 'https://x.test' } })).status, 403);
    assert.equal((await angela.put('/api/admin/practice', { clientMessaging: { label: 'TherapyNotes', url: 'javascript:alert(1)' } })).status, 400);
    assert.equal((await angela.put('/api/admin/practice', { clientMessaging: { label: 'TherapyNotes', url: '' } })).status, 400);
    const r = await angela.put('/api/admin/practice', { clientMessaging: { label: 'TherapyNotes', url: 'https://www.therapynotes.com' } });
    assert.equal(r.body.practice.clientMessaging.label, 'TherapyNotes');
    const cleared = await angela.put('/api/admin/practice', { clientMessaging: null });
    assert.equal(cleared.body.practice.clientMessaging, null);
    await angela.put('/api/admin/practice', { clientMessaging: { label: 'SimplePractice', url: 'https://secure.simplepractice.com' } });
  });

  test('it is not on the public org page (that is for signed-in staff only)', async () => {
    const pub = (await t.client().get('/api/orgs/the-well')).body;
    assert.ok(!('clientMessaging' in pub));
  });
});
