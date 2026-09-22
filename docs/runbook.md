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

- Enable daily database backups (and point-in-time recovery if your plan provides it).
- Storage objects (photos and evidence packages under `packages/`) need a separate export policy.
- Restore drill: restore the latest backup into an isolated project, apply pending migrations, point a staging API at it,
  and verify a package with `GET /api/v1/orgs/{org}/packages/{id}/verify`. Record the date and result.

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
