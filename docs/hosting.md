# Free hosting (synthetic demo)

Upstream runs as a public demo of the synthetic example workspace on free tiers. No payment card is needed anywhere.

| Piece | Free host | Limits that matter |
|---|---|---|
| Postgres, auth, private evidence storage | Supabase Free | 500 MB database, 1 GB storage, project pauses after 7 idle days |
| Web app (`apps/web`) | Vercel Hobby | non-commercial use only |
| API and analysis worker (one container) | Render Free web service (`render.yaml`) | 512 MB RAM, 0.1 CPU, 750 hours a month, sleeps after 15 idle minutes, about a minute to wake |
| Keep-awake ping | GitHub Actions (`.github/workflows/keep-alive.yml`), every 10 minutes | GitHub may delay scheduled runs, and turns them off after 60 days without commits |

This is a demo, not a production deployment. It runs with `ENVIRONMENT=demo` and `EXAMPLE_MODE=true`, so:
- the example accounts and their password (in `scripts/seed_example.py`) are public, and anyone can change the example data;
- the production checks in `services/api/config.py` (no example mode) do not apply;
- outside production the API still accepts plain-HTTP webhook recipients on 127.0.0.1, which on Render is the container itself.
For a real deployment follow `docs/runbook.md` instead.

The worker shares the API container's 0.1 CPU. The seeded example assessments are computed on the machine that runs the seed, but
new analyses on the host run slowly and may reach the solver limits, which leaves classes unresolved and retained, never excluded.

## How it fits together

- The browser loads the web app from Vercel. The web app forwards `/api/v1/*` to `API_INTERNAL_URL` (the Render service);
  `apps/web/next.config.ts` reads it at build time, so a changed Render URL needs a Vercel redeploy.
- `deploy/render/Dockerfile` installs `requirements.lock` and copies `packages/` and `services/`. `deploy/render/start.sh` runs the
  worker in the background and the API on Render's `$PORT`.
- `scripts/deploy_supabase.py` applies `supabase/migrations` to the hosted database and seeds the synthetic example. It reads the
  gitignored `.env.hosted`, and only seeds a remote database because it sets `UPSTREAM_SEED_HOSTED_DEMO=1`.
- `services/api/config.py:service_headers` sends legacy `service_role` keys (JWTs) as `apikey` and `Authorization`, and new
  `sb_secret_` keys as `apikey` only.

## Setup

1. Create a Supabase project in a US East region (Render's `virginia` region and Vercel's default `iad1` are there; every API request
   opens a database connection). Fill `.env.hosted` and run `.venv/Scripts/python.exe scripts/deploy_supabase.py`.
2. Render: New, Blueprint, this repository. Enter the `sync: false` values from `.env.hosted`.
3. Vercel: import this repository with Root Directory `apps/web`; set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `INTAKE_ORG_ID`,
   `MAP_STYLE_URL`, `API_INTERNAL_URL` and `ENABLE_EXPERIMENTAL_COREPACK=1` (so the pinned pnpm is used).
4. Set `APP_URL` and `FHIR_CANONICAL_BASE` on Render to the Vercel URL. In Supabase Auth URL configuration, the Site URL and redirect
   URL are the Vercel URL.
5. In GitHub, set the repository variable `UPSTREAM_URL` to the Vercel URL and run the keep-awake workflow once.

## Redeploying

- Code: push to `main`. Render and Vercel both rebuild automatically.
- Schema: rerun `scripts/deploy_supabase.py` (it applies only new migrations; the seed is idempotent).
