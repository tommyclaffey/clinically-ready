// Positions (Associate / Intern …): each person sees shared checklist items plus their position's.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, OFFICE, setup } from './helpers.mjs';

let t;
let angela;
let office;
let jordan;
let associate;
let intern;
before(async () => {
  t = await setup();
  angela = await t.as(ANGELA);
  office = await t.as(OFFICE);
  jordan = await t.as(JORDAN);
});
after(() => t.close());

const jordanId = () => t.db.prepare('SELECT id FROM users WHERE email = ?').get(JORDAN).id;

describe('positions', () => {
  test('admins create positions; clinicians cannot', async () => {
    associate = (await angela.post('/api/admin/positions', { name: 'Associate' })).body.id;
    intern = (await office.post('/api/admin/positions', { name: 'Intern' })).body.id;
    assert.ok(associate && intern);
    assert.equal((await jordan.post('/api/admin/positions', { name: 'Hacker' })).status, 403);
    assert.equal((await angela.post('/api/admin/positions', { name: '' })).status, 400);
    const list = (await angela.get('/api/admin/positions')).body;
    assert.deepEqual(list.map((p) => p.name), ['Associate', 'Intern']);
  });

  test('checklist items can belong to a position and carry a section heading', async () => {
    const r1 = await angela.post('/api/admin/checklist', { title: 'BBS registration verified', section: 'Registration and exams', positionId: associate });
    const r2 = await angela.post('/api/admin/checklist', { title: 'School–site agreement', section: 'School and placement', positionId: intern });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.item.positionId, associate);
    assert.equal(r1.body.item.section, 'Registration and exams');
    assert.equal(r2.status, 200);
  });

  test('without a position you see only the shared items; with one you see shared + yours', async () => {
    const shared = (await jordan.get('/api/dashboard')).body.checklist;
    assert.equal(shared.length, 5);
    assert.equal((await jordan.get('/api/dashboard')).body.position, null);

    assert.equal((await angela.put(`/api/admin/users/${jordanId()}`, { positionId: associate })).status, 200);
    const d = (await jordan.get('/api/dashboard')).body;
    assert.deepEqual(d.position, { id: associate, name: 'Associate' });
    assert.equal(d.checklist.length, 6);
    assert.ok(d.checklist.some((c) => c.title === 'BBS registration verified' && c.section === 'Registration and exams'));
    assert.ok(!d.checklist.some((c) => c.title === 'School–site agreement'));
  });

  test('you cannot tick an item from another position', async () => {
    const internItem = t.db.prepare("SELECT id FROM checklist_items WHERE title = 'School–site agreement'").get().id;
    assert.equal((await jordan.post(`/api/checklist/${internItem}`, { done: true })).status, 404);
  });

  test('team progress counts each person against their own checklist', async () => {
    const team = (await angela.get('/api/admin/team')).body.users;
    const j = team.find((u) => u.email === JORDAN);
    assert.equal(j.checklistTotal, 6);
    assert.equal(j.positionName, 'Associate');
    const a = team.find((u) => u.email === ANGELA);
    assert.equal(a.checklistTotal, 5);
  });

  test('invites carry a position to the new account', async () => {
    const inv = (await angela.post('/api/admin/invites', { email: 'new.intern@thewell.test', name: 'Nia', role: 'clinician', positionId: intern })).body;
    const c = t.client();
    await c.post(`/api/invites/${inv.inviteUrl.split('/invite/')[1]}/accept`, { name: 'Nia', password: 'nia-password-123' });
    const d = (await c.get('/api/dashboard')).body;
    assert.equal(d.position.name, 'Intern');
    assert.ok(d.checklist.some((c2) => c2.title === 'School–site agreement'));
  });

  test('a position with checklist items cannot be deleted; an empty one can, and people lose it', async () => {
    assert.equal((await angela.del(`/api/admin/positions/${intern}`)).status, 409);
    const empty = (await angela.post('/api/admin/positions', { name: 'Volunteer' })).body.id;
    await angela.put(`/api/admin/users/${jordanId()}`, { positionId: empty });
    assert.equal((await angela.del(`/api/admin/positions/${empty}`)).status, 200);
    assert.equal((await jordan.get('/api/dashboard')).body.position, null);
  });

  test('positions are scoped to the practice', async () => {
    const other = t.client();
    await other.post('/api/signup', { practiceName: 'Brook', name: 'Bea', email: 'bea@brook.test', password: 'brook-password-1' });
    assert.equal((await other.put(`/api/admin/positions/${associate}`, { name: 'Stolen' })).status, 404);
    assert.equal((await other.post('/api/admin/checklist', { title: 'x', positionId: associate })).status, 404);
    assert.equal((await other.post('/api/admin/invites', { email: 'x@brook.test', positionId: associate })).status, 404);
    assert.deepEqual((await other.get('/api/admin/positions')).body, []);
  });
});
