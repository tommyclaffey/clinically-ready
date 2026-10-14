import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, OFFICE, setup } from './helpers.mjs';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

const upload = (client, query, bytes, type = 'application/octet-stream') =>
  client.req('POST', `/api/admin/resources?${new URLSearchParams(query)}`, bytes, {
    raw: true,
    headers: { 'Content-Type': type },
  });

const uploadsDir = () => path.join(t.dataDir, 'uploads', '1');

describe('download', () => {
  test('streams the file as an attachment', async () => {
    const jordan = await t.as(JORDAN);
    const handbook = (await jordan.get('/api/resources')).body.find((r) => r.title === 'Clinician handbook');
    const r = await jordan.get(`/api/resources/${handbook.id}/download`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition'), /^attachment; filename="Clinician handbook\.pdf"/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
    assert.equal(Number(r.headers.get('content-length')), r.body.length);
  });

  test('signed out -> 401, unknown id -> 404', async () => {
    assert.equal((await t.client().get('/api/resources/1/download')).status, 401);
    const jordan = await t.as(JORDAN);
    assert.equal((await jordan.get('/api/resources/99999/download')).status, 404);
  });
});

describe('upload', () => {
  test('admin uploads an allowed type; stored under a random name', async () => {
    const office = await t.as(OFFICE);
    const before = new Set(fs.readdirSync(uploadsDir()));
    const bytes = Buffer.from('Parking is behind the building.\n');
    const r = await upload(office, { title: 'Parking notes', category: 'Policy', filename: 'my parking notes.txt' }, bytes, 'text/plain');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.resource, {
      id: r.body.resource.id, title: 'Parking notes', fileType: 'TXT', sizeLabel: '32 B', category: 'Policy', lessonId: null,
    });
    const added = fs.readdirSync(uploadsDir()).filter((f) => !before.has(f));
    assert.equal(added.length, 1);
    assert.match(added[0], /^[0-9a-f]{32}\.txt$/);
    assert.ok(!added[0].includes('parking'));

    const jordan = await t.as(JORDAN);
    const dl = await jordan.get(`/api/resources/${r.body.resource.id}/download`);
    assert.equal(dl.status, 200);
    assert.deepEqual(dl.body, bytes);
    assert.match(dl.headers.get('content-disposition'), /attachment; filename="Parking notes\.txt"/);
  });

  test('can attach to a lesson, title defaults to the filename', async () => {
    const angela = await t.as(ANGELA);
    const r = await upload(angela, { lessonId: 1, filename: 'Welcome slides.pptx' }, Buffer.from('pptx-ish'));
    assert.equal(r.status, 200);
    assert.equal(r.body.resource.title, 'Welcome slides');
    assert.equal(r.body.resource.lessonId, 1);
    assert.equal(r.body.resource.category, 'Resource');
  });

  test('rejects disallowed types, bad category and empty files', async () => {
    const angela = await t.as(ANGELA);
    for (const filename of ['evil.exe', 'page.html', 'script.js', 'noext', 'x.svg', 'archive.pdf.sh']) {
      const r = await upload(angela, { filename }, Buffer.from('x'));
      assert.equal(r.status, 400, filename);
      assert.match(r.body.error, /isn't allowed/);
    }
    assert.equal((await upload(angela, { filename: 'a.pdf', category: 'Secret' }, Buffer.from('x'))).status, 400);
    assert.equal((await upload(angela, { filename: 'a.pdf' }, Buffer.alloc(0))).status, 400);
  });

  test('rejects files over 25 MB with 413', async () => {
    const angela = await t.as(ANGELA);
    const count = fs.readdirSync(uploadsDir()).length;
    const r = await upload(angela, { filename: 'huge.zip' }, Buffer.alloc(25 * 1024 * 1024 + 1));
    assert.equal(r.status, 413);
    assert.equal(fs.readdirSync(uploadsDir()).length, count);
  });

  test('clinicians cannot upload or delete', async () => {
    const jordan = await t.as(JORDAN);
    assert.equal((await upload(jordan, { filename: 'a.pdf' }, Buffer.from('x'))).status, 403);
    assert.equal((await jordan.del('/api/admin/resources/1')).status, 403);
  });

  test('delete removes the row and the file', async () => {
    const angela = await t.as(ANGELA);
    const r = await upload(angela, { filename: 'temp.txt' }, Buffer.from('temporary'));
    const id = r.body.resource.id;
    const { stored_name } = t.db.prepare('SELECT stored_name FROM resources WHERE id = ?').get(id);
    assert.ok(fs.existsSync(path.join(uploadsDir(), stored_name)));
    assert.deepEqual((await angela.del(`/api/admin/resources/${id}`)).body, { ok: true });
    assert.ok(!fs.existsSync(path.join(uploadsDir(), stored_name)));
    assert.equal((await angela.get(`/api/resources/${id}/download`)).status, 404);
  });
});
