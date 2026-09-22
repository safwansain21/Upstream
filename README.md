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

Requirements: Node 24, pnpm 11 (without a global pnpm, use `npx pnpm@11.19.0` wherever `pnpm` appears), Python 3.12,
Docker (for the local Supabase stack). On Windows, clone into a short path such as `C:\src\upstream`: deep folders hit the
Windows path-length limit inside `node_modules`.

```sh
pnpm install
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.lock   # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m playwright install chromium                               # PDF export and browser tests
cp .env.example .env
```

The `pnpm` scripts call `python scripts/local.py …`; run them with the virtual environment activated
(`.venv\Scripts\activate` on Windows, `source .venv/bin/activate` elsewhere).

```sh
pnpm setup:local           # supabase start + migration up --local, then writes the local keys into blank .env entries
pnpm seed:example          # synthetic example workspace (idempotent; refuses non-local or production databases)
pnpm dev                   # API :8000, worker, web :3000 (web proxies /api/v1 to the API)
pnpm reset:example         # rebuild the local database and reseed (local only)
```

Open http://127.0.0.1:3000. Example accounts (local example workspace only, synthetic data):
`coordinator@example.test`, `expert@example.test`, `monitor@example.test`, `contributor@example.test`,
`admin@example.test`, password `upstream-example-only`. Production refuses `EXAMPLE_MODE=true`.
Evidence packages are unsigned unless `EXPORT_SIGNING_KEY_ID` and `EXPORT_SIGNING_PRIVATE_KEY` are set (see `docs/runbook.md`).

No paid map, AI or email service is needed: the default basemap is OpenFreeMap (no key, account or payment; leave
`MAP_STYLE_URL` empty for a plain background, and rebuild the web app after changing it);
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
