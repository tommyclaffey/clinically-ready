// Railway infrastructure for the Clinical Onboarding App (replaces railway.json, retired Dec 1 2026).
// Diffed against the live environment on `railway config plan`; `railway config apply` changes it.
//
// Secrets never live here: SEED_PASSWORD, sign-in and backup credentials are `preserve()`d —
// whatever Railway already holds is kept. Set them with `railway variables --set`.
import { bucket, defineRailway, github, preserve, project, service, volume } from "railway/iac";

export const partial = "web";

export default defineRailway(() => {
  // The SQLite database and uploaded files. Losing this volume loses everything.
  const data = volume("web-volume", { region: "sfo", sizeMB: 5000 });

  // Nightly backups of the volume are copied here (see server/backup.mjs).
  const backups = bucket("backups", { region: "sjc" });

  const web = service("web", {
    source: github("tommyclaffey/clinical-onboarding", { branch: "main" }),
    build: "npm run build",
    start: "npm start",
    healthcheck: "/healthz",
    healthcheckTimeout: 120,
    volumeMounts: { "/data": data },
    env: {
      DATA_DIR: "/data",
      TRUST_PROXY: "1",
      SIGNUP_OPEN: "0",
      PUBLIC_ORIGIN: "https://web-production-1f8f7.up.railway.app",
      SEED_PASSWORD: preserve(),
      BACKUP_S3_ENDPOINT: preserve(),
      BACKUP_S3_BUCKET: preserve(),
      BACKUP_S3_REGION: preserve(),
      BACKUP_S3_KEY: preserve(),
      BACKUP_S3_SECRET: preserve(),
      // Encrypts handed-in tax/employment forms. Losing it makes stored forms unreadable.
      PAPERWORK_KEY: preserve(),
    },
  });

  return project("clinical-onboarding", { resources: [data, backups, web] });
});
