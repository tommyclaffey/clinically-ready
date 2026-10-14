// Nightly backups: a consistent copy of the SQLite database plus a tarball of uploaded files, gzipped
// and put in the bucket under backups/<YYYY-MM-DD>/. Keeps the last KEEP_DAYS days. restoreBackup()
// is the proof that a backup is real: tests round-trip through it.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

export const KEEP_DAYS = 30;
const PREFIX = 'backups/';
const today = () => new Date().toISOString().slice(0, 10);

// ---- tiny tar (ustar) writer/reader: enough for a flat tree of regular files ----
function tarHeader(name, size, mtime) {
  if (Buffer.byteLength(name) > 100) throw new Error(`tar: name too long: ${name}`);
  const h = Buffer.alloc(512);
  h.write(name, 0, 100);
  h.write('0000644\0', 100, 8);
  h.write('0000000\0', 108, 8);
  h.write('0000000\0', 116, 8);
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12);
  h.write(`${Math.floor(mtime / 1000).toString(8).padStart(11, '0')}\0`, 136, 12);
  h.write('        ', 148, 8); // checksum placeholder
  h.write('0', 156, 1);
  h.write('ustar\0', 257, 6);
  h.write('00', 263, 2);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return h;
}

/** Tars every regular file under `dir` (recursively), paths relative to `dir`. */
export function tarDirectory(dir) {
  const parts = [];
  const walk = (d, rel) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      const name = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, name);
      else if (entry.isFile()) {
        const data = fs.readFileSync(full);
        parts.push(tarHeader(name, data.length, fs.statSync(full).mtimeMs), data);
        const pad = (512 - (data.length % 512)) % 512;
        if (pad) parts.push(Buffer.alloc(pad));
      }
    }
  };
  walk(dir, '');
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

/** Yields { name, data } for each file in a tar made by tarDirectory. */
export function* untar(buf) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const size = parseInt(h.toString('utf8', 124, 136).replace(/\0.*$/, '').trim(), 8);
    const start = off + 512;
    yield { name, data: buf.subarray(start, start + size) };
    off = start + size + ((512 - (size % 512)) % 512);
  }
}

/** A consistent snapshot of the live database (safe while the app is running). */
export function snapshotDb(db, outFile) {
  fs.rmSync(outFile, { force: true });
  db.exec(`VACUUM INTO '${outFile.replace(/'/g, "''")}'`);
  const data = fs.readFileSync(outFile);
  fs.rmSync(outFile, { force: true });
  return data;
}

/** Runs one backup. Returns the keys written and the dates removed. */
export async function runBackup({ db, dataDir, s3, date = today(), keepDays = KEEP_DAYS, log = () => {} }) {
  const dbGz = gzipSync(snapshotDb(db, path.join(dataDir, `.backup-${process.pid}.db`)));
  const upGz = gzipSync(tarDirectory(path.join(dataDir, 'uploads')));
  const keys = [`${PREFIX}${date}/app.db.gz`, `${PREFIX}${date}/uploads.tar.gz`];
  await s3.put(keys[0], dbGz, 'application/gzip');
  await s3.put(keys[1], upGz, 'application/gzip');
  // Retention: delete whole days older than keepDays.
  const cutoff = new Date(Date.parse(date) - keepDays * 864e5).toISOString().slice(0, 10);
  const removed = new Set();
  for (const key of await s3.list(PREFIX)) {
    const day = key.slice(PREFIX.length, PREFIX.length + 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < cutoff) {
      await s3.del(key);
      removed.add(day);
    }
  }
  log(`Backup ${date}: db ${dbGz.length} B, uploads ${upGz.length} B${removed.size ? `, removed ${[...removed].join(', ')}` : ''}`);
  return { date, keys, bytes: dbGz.length + upGz.length, removed: [...removed] };
}

/** Dates that have a backup, newest first. */
export async function listBackups(s3) {
  const days = new Set();
  for (const key of await s3.list(PREFIX)) {
    const day = key.slice(PREFIX.length, PREFIX.length + 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && key.endsWith('/app.db.gz')) days.add(day);
  }
  return [...days].sort().reverse();
}

/** Restores one day's backup into dataDir (which must be empty or absent). The server must not be running on it. */
export async function restoreBackup({ s3, date, dataDir }) {
  if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length) throw new Error(`restore: ${dataDir} is not empty.`);
  const dbGz = await s3.get(`${PREFIX}${date}/app.db.gz`);
  const upGz = await s3.get(`${PREFIX}${date}/uploads.tar.gz`);
  if (!dbGz || !upGz) throw new Error(`restore: no backup for ${date}.`);
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'app.db'), gunzipSync(dbGz));
  let files = 0;
  for (const { name, data } of untar(gunzipSync(upGz))) {
    const target = path.join(dataDir, 'uploads', name);
    if (!target.startsWith(path.join(dataDir, 'uploads'))) throw new Error(`restore: refusing path ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    files += 1;
  }
  // Sanity check: the database opens and has the practices table.
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  const n = db.prepare('SELECT COUNT(*) AS n FROM practices').get().n;
  db.close();
  return { date, files, practices: n };
}

/**
 * Runs a backup once a day at `hourUtc` (default 09:00 UTC = 2 am Pacific), and on boot if today's
 * hasn't happened. Returns a stop() function.
 */
export function scheduleBackups({ db, dataDir, s3, hourUtc = 9, log = console.log, error = console.error }) {
  let lastDate = null;
  let running = false;
  const tick = async (force = false) => {
    if (running) return;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    if (!force && (lastDate === date || now.getUTCHours() !== hourUtc)) return;
    running = true;
    try {
      await runBackup({ db, dataDir, s3, date, log });
      lastDate = date;
    } catch (e) {
      error(`Backup failed: ${e.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 15 * 60 * 1000);
  timer.unref();
  // On boot: back up now unless the bucket already has today's.
  void listBackups(s3)
    .then((days) => { if (days[0] === today()) lastDate = today(); else return tick(true); })
    .catch((e) => error(`Backup check failed: ${e.message}`));
  return () => clearInterval(timer);
}
