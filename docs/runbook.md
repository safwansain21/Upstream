# Operations runbook

This describes how to run Upstream outside local development. No live deployment is claimed by this repository.

## Environment variables

| Variable | Class | If absent |
|---|---|---|
| `ENVIRONMENT` | config | defaults to development; set `production` in production |
| `APP_URL` | config | origin check rejects browser mutations from other origins; must be HTTPS in production |
| `API_INTERNAL_URL` | config | web proxy target for `/api/v1` |
| `DATABASE_URL` | secret | API and worker cannot start; production refuses the development password |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | public | sign-in unavailable (anon key is safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret, server/worker only | uploads, package storage and seeding fail; never prefix with `NEXT_PUBLIC_` |
| `AUTH_JWKS_URL`, `AUTH_ISSUER` | config | JWT verification fails closed |
| `STORAGE_BUCKET` | config | defaults to `evidence-private` (private bucket from the foundation migration) |
| `INTAKE_ORG_ID` | config | reports without a chosen organization have nowhere to go; the form says intake is not configured |
| `EXAMPLE_MODE` | config | must be `false` in production (startup validation refuses otherwise) |
| `MAP_STYLE_URL` | config, optional | maps show Upstream data on a plain labelled background |
| `GEOCODER_BASE_URL` | config, optional | not used by this build: there is no place-name search; reporters use GPS, a map pin, coordinates or a landmark description |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | secret/config, optional | AI assistance shown as unavailable; all work continues manually |
| `EXPORT_SIGNING_KEY_ID`, `EXPORT_SIGNING_PRIVATE_KEY` | secret, optional | packages are explicitly unsigned |
| `FHIR_CANONICAL_BASE` | config | profile URLs in the optional FHIR adapter |
| `LOG_LEVEL` | config | defaults to INFO |

## First production setup

1. Provision managed Supabase (PostgreSQL with PostGIS). Configure Auth redirect origins to your `APP_URL`, email
   confirmation on, and an email provider.
2. Apply migrations as a release step (never on user requests): `supabase db push` against the project, after a backup.
3. Deploy the API (`uvicorn services.api.main:app`), the worker (`python -m services.worker`, one or more replicas; jobs
   are leased with `SKIP LOCKED` so replicas are safe) and the web app (`pnpm build && next start`) behind HTTPS.
4. The first administrator signs up through the normal email flow, then an operator runs:
   `python scripts/bootstrap_org.py --name "<Organization>" --slug <slug> --admin-email <verified email> [--intake]`
   The script refuses example accounts and grants only `admin`. The administrator then grants `coordinate`, `expert`,
   `network_verify`, `monitor` and qualifications to the right people in Settings → Organization (nobody can self-grant).
5. If the organization receives unassigned public reports, set `INTAKE_ORG_ID` to the printed organization id.
6. Do not run `pnpm seed:example` in production; example workspaces are for isolated demonstration only.
7. Smoke test: `/status`, sign-in, submit a text-only report, check it in the directory as a coordinator.

## Signing keys and rotation

Generate a new Ed25519 key, set `EXPORT_SIGNING_KEY_ID` to a new id and `EXPORT_SIGNING_PRIVATE_KEY` to the base64 raw key,
and restart API and worker. Publish the new public key (`GET /api/v1/signing-key`) to recipients through an independent
channel. Existing packages keep their original signature and key id; they are never re-signed or rewritten.

## Backups and restore

Database backups alone are not enough: photos and evidence package bytes live in private object storage and are backed up
separately. A restore is only accepted after the verification step below.

Backup (hosted project; replace the connection string and keys with your own):

1. Database, in three files (the documented Supabase dump format):
   `supabase db dump --db-url "$DB_URL" --role-only -f roles.sql`,
   `supabase db dump --db-url "$DB_URL" -f schema.sql`,
   `supabase db dump --db-url "$DB_URL" --data-only --use-copy -f data.sql`.
   Also enable the provider's daily backups and point-in-time recovery if the plan offers them.
2. Objects: list `storage.objects` for bucket `evidence-private` (name and `metadata->>'mimetype'`), download each through
   the storage API with the service key, and store a manifest with each object's SHA-256, size and MIME type.
3. Keep the backup encrypted and outside the project; it contains personal data (auth users, report text, photos).

Restore into an isolated project (never over the live one):

1. Create a new, empty project. Run, as a superuser:
   `psql -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql`, then `psql -v ON_ERROR_STOP=1` with
   `set session_replication_role = replica;` followed by `data.sql` in the same session.
2. Upload every object to the new project's `evidence-private` bucket under its original name and MIME type.
3. Verify before using it: row counts per table equal the source at backup time; each restored object's SHA-256 equals the
   manifest; every evidence package verifies from restored storage (`verify_package` with the recorded manifest hash,
   predecessor hash and, for signed packages, the public key - the same check as `GET /api/v1/orgs/{org}/packages/{id}/verify`);
   an existing account can sign in. Record the date and result.

Local drill (exercised): `.venv/Scripts/python.exe scripts/backup_restore.py drill [backup_dir]` does all of the above
against the local stack. It starts a second, isolated Supabase stack (project id `UpstreamRestoreDrill`, ports 553xx, its
own volumes), restores into it, verifies, then stops it and deletes its volumes. The source is only read. Test:
`tests/ops/test_backup_restore.py`. Result on 2026-09-22 (seeded example + 10k load org): 20 table counts equal, 44 of 44
objects hash-identical, 5 of 5 evidence packages verified, example sign-in accepted; under a minute with cached images.
If a drill is interrupted, `python scripts/backup_restore.py cleanup` removes the isolated stack.

## Rollback

Web and API are stateless: redeploy the previous build. Migrations are forward-only; ship a corrective migration instead of
editing an applied one. Approved assessments, packages and receipts are immutable, so a rollback never rewrites evidence.

## Queues and solver limits

- Analysis and export jobs live in `analysis_jobs`. Failed jobs show `last_error`; after three attempts they stay `failed`.
  To retry, set `state='queued', attempts=0` for that job after fixing the cause. The same snapshot hash never creates a
  duplicate job.
- Solver limits: 2 s per class and 30 s per job by default (hard caps 10 s / 120 s). Hitting a limit leaves classes
  unresolved and retained; it never excludes them. Investigate slow cases by inspecting the stored SMT2 problem in
  `class_results.exact_problem`.

## Secrets hygiene

Run `python scripts/secret_scan.py` after every production build; it fails if the service key, signing key or database
password appear in the browser bundle or tracked files. Rotate any key that was ever exposed.
