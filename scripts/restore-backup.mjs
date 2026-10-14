#!/usr/bin/env node
// Restore a backup into an empty data directory, then inspect it or point the server at it.
//   BACKUP_S3_* in env (copy from Railway: `railway variables --json`), then:
//   node scripts/restore-backup.mjs --list
//   node scripts/restore-backup.mjs --date 2026-10-09 --to ./restored
import path from 'node:path';
import { listBackups, restoreBackup } from '../server/backup.mjs';
import { s3FromEnv } from '../server/s3.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const s3 = s3FromEnv();
if (!s3) { console.error('Set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_KEY, BACKUP_S3_SECRET.'); process.exit(1); }
if (args.includes('--list')) {
  const days = await listBackups(s3);
  console.log(days.length ? days.join('\n') : 'No backups yet.');
  process.exit(0);
}
const date = opt('date');
const to = path.resolve(opt('to') ?? `restored-${date}`);
if (!date) { console.error('Need --date YYYY-MM-DD (see --list) and optionally --to <dir>.'); process.exit(1); }
const r = await restoreBackup({ s3, date, dataDir: to });
console.log(`Restored ${r.date} into ${to}: ${r.practices} practice(s), ${r.files} uploaded file(s).`);
console.log(`Run it: DATA_DIR=${to} npm run server`);
