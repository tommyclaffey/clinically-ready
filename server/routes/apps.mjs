// Tools: the apps a practice runs on (SimplePractice, Slack, Notion…). Each has a web link, optional
// desktop/phone downloads and a sign-in note. Shown on the Tools page and as an "app" block inside a step.
import { now } from '../db.mjs';
import { fail, intId, readJson } from '../http.mjs';
import * as v from '../validate.mjs';

const FIELDS = { web_url: 'webUrl', mac_url: 'macUrl', windows_url: 'windowsUrl', ios_url: 'iosUrl', android_url: 'androidUrl', icon_url: 'iconUrl' };

export const appShape = (a) => ({
  id: a.id,
  name: a.name,
  description: a.description || '',
  iconUrl: a.icon_url || '',
  webUrl: a.web_url || '',
  macUrl: a.mac_url || '',
  windowsUrl: a.windows_url || '',
  iosUrl: a.ios_url || '',
  androidUrl: a.android_url || '',
  signinNote: a.signin_note || '',
  position: a.position,
});

function appFields(body, creating) {
  const f = {};
  if (creating || body.name !== undefined) f.name = v.text(body.name, 'App name', { max: 80 });
  if (body.description !== undefined) f.description = v.text(body.description, 'What it’s for', { max: 400, optional: true });
  if (body.signinNote !== undefined) f.signin_note = v.text(body.signinNote, 'Sign-in note', { max: 600, optional: true });
  for (const [col, key] of Object.entries(FIELDS)) if (body[key] !== undefined) f[col] = v.url(body[key], `${key} link`);
  if (creating && !f.web_url && !f.mac_url && !f.windows_url && !f.ios_url && !f.android_url) fail(400, 'Add at least one link: the web app or a download.');
  return f;
}

function ownApp(ctx, id) {
  const a = ctx.db.prepare('SELECT * FROM apps WHERE id = ? AND practice_id = ?').get(intId(id), ctx.user.practice_id);
  if (!a) fail(404, 'That app was not found.');
  return a;
}

const list = (ctx) => ctx.db.prepare('SELECT * FROM apps WHERE practice_id = ? ORDER BY position, id').all(ctx.user.practice_id).map(appShape);

export default function register(router) {
  router.add('GET', '/api/apps', list, { auth: 'user' });

  router.add('POST', '/api/admin/apps', async (ctx) => {
    const f = appFields(await readJson(ctx.req), true);
    const pos = ctx.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM apps WHERE practice_id = ?').get(ctx.user.practice_id).n;
    const all = { practice_id: ctx.user.practice_id, position: pos, created_at: now(), ...f };
    const keys = Object.keys(all);
    const id = Number(ctx.db.prepare(`INSERT INTO apps(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(all)).lastInsertRowid);
    return { ok: true, id, apps: list(ctx) };
  }, { auth: 'admin' });

  router.add('PUT', '/api/admin/apps/:id', async (ctx) => {
    const app = ownApp(ctx, ctx.params.id);
    const body = await readJson(ctx.req);
    const f = appFields(body, false);
    if (body.position !== undefined) f.position = v.int(body.position, 'Position', { max: 10000 });
    const keys = Object.keys(f);
    if (keys.length) ctx.db.prepare(`UPDATE apps SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND practice_id = ?`).run(...Object.values(f), app.id, ctx.user.practice_id);
    return { ok: true, apps: list(ctx) };
  }, { auth: 'admin' });

  // Removing an app also removes its block from any step, so no page shows a dead card.
  router.add('DELETE', '/api/admin/apps/:id', (ctx) => {
    const app = ownApp(ctx, ctx.params.id);
    const pid = ctx.user.practice_id;
    for (const l of ctx.db.prepare("SELECT id, blocks FROM lessons WHERE practice_id = ? AND blocks LIKE '%\"app\"%'").all(pid)) {
      let blocks;
      try { blocks = JSON.parse(l.blocks); } catch { continue; }
      const kept = blocks.filter((b) => !(b.type === 'app' && b.appId === app.id));
      if (kept.length !== blocks.length) ctx.db.prepare('UPDATE lessons SET blocks = ? WHERE id = ?').run(JSON.stringify(kept), l.id);
    }
    ctx.db.prepare('DELETE FROM apps WHERE id = ? AND practice_id = ?').run(app.id, pid);
    return { ok: true, apps: list(ctx) };
  }, { auth: 'admin' });
}
