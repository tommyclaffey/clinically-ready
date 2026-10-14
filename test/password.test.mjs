// Changing your own password: needs the current one, signs out other devices, respects the org's settings.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, PASSWORD, setup } from './helpers.mjs';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

describe('change password', () => {
  test('wrong current password is refused; right one changes it and ends other sessions', async () => {
    const laptop = await t.as(JORDAN);
    const phone = await t.as(JORDAN);
    assert.equal((await laptop.put('/api/account/password', { current: 'nope-nope-nope', next: 'a-brand-new-pass-1' })).status, 400);
    assert.equal((await laptop.put('/api/account/password', { current: PASSWORD, next: 'short' })).status, 400);
    assert.equal((await laptop.put('/api/account/password', { current: PASSWORD, next: PASSWORD })).status, 400);
    const r = await laptop.put('/api/account/password', { current: PASSWORD, next: 'a-brand-new-pass-1' });
    assert.equal(r.status, 200);
    assert.equal((await laptop.get('/api/me')).status, 200, 'this device stays signed in');
    assert.equal((await phone.get('/api/me')).status, 401, 'other devices are signed out');
    const fresh = await t.client();
    assert.equal((await fresh.post('/api/auth/login', { email: JORDAN, password: PASSWORD })).status, 401);
    assert.equal((await fresh.post('/api/auth/login', { email: JORDAN, password: 'a-brand-new-pass-1' })).status, 200);
  });

  test('signed-out requests are refused', async () => {
    const anon = await t.client();
    assert.equal((await anon.put('/api/account/password', { current: PASSWORD, next: 'whatever-long-1' })).status, 401);
  });

  test('blocked when the organisation turns passwords off', async () => {
    const angela = await t.as(ANGELA);
    const pid = t.db.prepare('SELECT practice_id FROM users WHERE email = ?').get(ANGELA).practice_id;
    const before = t.db.prepare('SELECT signin_methods FROM practices WHERE id = ?').get(pid);
    t.db.prepare('UPDATE practices SET signin_methods = ? WHERE id = ?').run(JSON.stringify({ password: false, google: true, microsoft: true }), pid);
    assert.equal((await angela.put('/api/account/password', { current: PASSWORD, next: 'whatever-long-1' })).status, 403);
    t.db.prepare('UPDATE practices SET signin_methods = ? WHERE id = ?').run(before?.signin_methods ?? null, pid);
  });
});
