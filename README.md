# Clinical Onboarding App

> **About this repo.** This is the public copy of Clinically Ready, an onboarding app for counselling and therapy practices, designed and built by Tommy Claffey.
> It holds the full product code and the demo practice (Cedar Grove Counseling, fictional). The first client's real training course is private and isn't included.
> Live demo: https://web-production-1f8f7.up.railway.app/demo


Onboarding for counselling and therapy practices. New clinicians sign in, watch video lessons,
download resources, answer quick checks and work through a checklist. Practice owners invite
staff, load their own content and see who has finished.

## Run it

```bash
npm install
npm run seed      # creates data/ with The Well demo practice (prints the logins)
npm run dev       # app: http://localhost:5173  ·  API: http://localhost:4500
```

| Command | Does |
|---|---|
| `npm test` | API tests (node --test) + UI tests (vitest) |
| `npm run build` | type-check + build the front end to `dist/` |
| `npm start` | production: one Node server for `dist/` and `/api` on `$PORT`. On first boot, seeds The Well if `SEED_PASSWORD` is set and the database is empty |

## Stack

- **Server:** Node 22+, no runtime dependencies, built-in `node:sqlite`
- **Front end:** Vite, React 19, TypeScript, plain CSS
- Full contract: [`SPEC.md`](SPEC.md)

## Seed data is placeholder

The Well's lessons, videos, checklist and files in the seed are **stand-ins** built from the
approved designs. Real content comes from the practice through the admin screens.

## Deploy (Railway)

Volume mounted at `/data`. Variables: `DATA_DIR=/data`, `TRUST_PROXY=1`, `SIGNUP_OPEN=0`
(set `1` to open public sign-up), `SEED_PASSWORD` (private, 12+ characters; first boot only).

## Backups

With `BACKUP_S3_*` set (Railway bucket `backups`), the server copies the database and uploaded files to
`backups/<date>/` every night at 09:00 UTC (2 am Pacific), and on boot if today's is missing. The last
30 days are kept. Owners can trigger one with `POST /api/admin/backup`.

Restore: `node scripts/restore-backup.mjs --list`, then `--date YYYY-MM-DD --to ./restored`.
