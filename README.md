# Sadaneera Mahotsav — Cloudflare Worker + D1

This is the clean Cloudflare-only project root. The existing frontend is in `public/`; Worker code is in `src/`. No Express, Firebase, Firestore, old SQLite database, or `node_modules` are included.

## Before deployment
1. Create a Cloudflare D1 database named `sadaneera-invitations-test`.
2. Copy its real database ID into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
3. Initialize the remote database from this folder: `npx wrangler d1 execute sadaneera-invitations-test --remote --file=./schema.sql`.
4. Configure Worker secrets in Cloudflare (or with `npx wrangler secret put KEY`): `JWT_SECRET`, `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_NAME`, `SUPERADMIN_EMAIL`, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`. Use a newly generated random JWT secret of at least 32 characters and a strong unique Super Admin password.
5. Deploy from this directory with `npx wrangler deploy`.

## Important
- Never upload `.dev.vars` or real credentials. `.dev.vars.example` contains placeholders only.
- The D1 database starts empty; `schema.sql` inserts the master event settings and sequence row.
- Photos continue to use Google Drive; the OAuth credentials remain server-side Worker secrets.
- This project does not migrate data from the old backend.
