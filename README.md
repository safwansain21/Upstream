# Upstream

A citizen-science platform that turns stream observations into coordinated, reviewable investigations: report → verify
readiness → choose useful evidence → collect → review → revise → share. Scientific compatibility is computed by an exact
engine (Z3, rational inputs); AI never changes it, and every conclusion stays conditional on stated assumptions.

Status and evidence: `docs/progress.md` (what is built), `docs/release-results.md` (acceptance gates with test evidence).

## Stack

Next.js (App Router, TypeScript) in `apps/web` · FastAPI in `services/api` · durable PostgreSQL job worker in
`services/worker` · pure scientific engine in `packages/engine` · evidence packages/FHIR in `services/packages` ·
Supabase (PostgreSQL + PostGIS, Auth, private storage) with migrations in `supabase/migrations`.

## Local setup

Requirements: Node 24, pnpm 11, Python 3.12, Docker (for the local Supabase stack).

```sh
pnpm install
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.lock   # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m playwright install chromium                               # PDF export and browser tests
cp .env.example .env
pnpm exec supabase start                     # prints local URLs and keys
pnpm exec supabase migration up --local      # or: pnpm setup:local (starts + migrates)
```

Put the local `ANON_KEY` and `SERVICE_ROLE_KEY` from `pnpm exec supabase status` into `.env` as `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. Optional: set `EXPORT_SIGNING_KEY_ID` and `EXPORT_SIGNING_PRIVATE_KEY` (base64 of a raw
32-byte Ed25519 key) to sign evidence packages; without them packages are explicitly unsigned.

The `pnpm` scripts call `python scripts/local.py …`; run them with the virtual environment activated
(`.venv\Scripts\activate` on Windows, `source .venv/bin/activate` elsewhere).

```sh
pnpm seed:example          # synthetic example workspace (idempotent; refuses non-local or production databases)
pnpm dev                   # API :8000, worker, web :3000 (web proxies /api/v1 to the API)
pnpm reset:example         # rebuild the local database and reseed (local only)
```

Open http://127.0.0.1:3000. Example accounts (local example workspace only, synthetic data):
`coordinator@example.test`, `expert@example.test`, `monitor@example.test`, `contributor@example.test`,
`admin@example.test`, password `upstream-example-only`. Production refuses `EXAMPLE_MODE=true`.

No paid map, AI or email service is needed: maps draw Upstream data on a plain background unless `MAP_STYLE_URL` is set;
AI assistance is shown as unavailable; local email goes to the Supabase mail catcher.

## Tests

```sh
.venv/Scripts/python -m pytest tests -q -p no:cacheprovider -rA   # everything (needs local Supabase + seed; browser tests
                                                                  # need `pnpm build`, API, worker and `next start` running)
pnpm test:engine            # scientific engine and property tests
pnpm test                   # API/package/security tests + web typecheck
pnpm test:e2e               # browser workflows
python scripts/secret_scan.py          # no privileged keys in the browser build or tracked files
python scripts/update_release_results.py   # refresh docs/release-results.md after a full run
```

On Windows, `powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1` restarts API, worker and `next start`.

## Operations

See `docs/runbook.md` for production setup (first organization and administrator), deployment, key rotation,
backup/restore and rollback.
