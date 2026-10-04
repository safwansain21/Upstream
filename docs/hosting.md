# Free hosting (synthetic demo)

Upstream runs as a public demo of the synthetic example workspace on free tiers. No payment card is needed anywhere.

| Piece | Free host | Limits that matter |
|---|---|---|
| Postgres, auth, private evidence storage | Supabase Free | 500 MB database, 1 GB storage, project pauses after 7 idle days |
| Web app, API and analysis worker (one container) | Hugging Face Space, Docker SDK, CPU basic | 2 vCPU, 16 GB RAM, sleeps after 48 idle hours, about a minute to wake |
| Keep-awake ping | GitHub Actions (`.github/workflows/keep-alive.yml`) | GitHub turns off scheduled workflows after 60 days without commits |

This is a demo, not a production deployment. It runs with `ENVIRONMENT=demo` and `EXAMPLE_MODE=true`, so:
- the example accounts and their password (in `scripts/seed_example.py`) are public, and anyone can change the example data;
- the production checks in `services/api/config.py` (no example mode) do not apply;
- outside production the API still accepts plain-HTTP webhook recipients on 127.0.0.1, which inside the container is the container itself.
For a real deployment follow `docs/runbook.md` instead.

## How it fits together

- `deploy/huggingface/Dockerfile` and `deploy/huggingface/README.md` are the only two files in the Space. The Dockerfile clones `main`
  from GitHub, installs Python and web dependencies, and builds the web app with the public Supabase values.
- `deploy/start.sh` runs the API and the worker on loopback and `next start` on port 7860. The web app forwards `/api/v1/*` to the API.
- `scripts/deploy_supabase.py` applies `supabase/migrations` to the hosted database and seeds the synthetic example. It reads the
  gitignored `.env.hosted`, and only seeds a remote database because it sets `UPSTREAM_SEED_HOSTED_DEMO=1`.
- `services/api/config.py:service_headers` sends legacy `service_role` keys (JWTs) as `apikey` and `Authorization`, and new
  `sb_secret_` keys as `apikey` only.

## Setup

1. Create a Supabase project in a US East region (the Space runs in the US; every API request opens a database connection).
2. Fill `.env.hosted` from the project's keys and session pooler connection string.
3. `.venv/Scripts/python.exe scripts/deploy_supabase.py`
4. Supabase Auth URL configuration: Site URL and redirect URL are the Space URL.
5. Create the Space with the Docker SDK and upload the two files in `deploy/huggingface/`. Put the public values from `.env.hosted` in
   Variables and `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPORT_SIGNING_PRIVATE_KEY` (and `AI_API_KEY` if used) in Secrets.
6. In GitHub, set the repository variable `UPSTREAM_URL` to the Space URL and run the keep-awake workflow once.

## Redeploying

- Code: push to `main`, then in the Space choose Settings, Factory rebuild.
- Schema: rerun `scripts/deploy_supabase.py` (it applies only new migrations; the seed is idempotent).
- A changed Variable rebuilds the Space by itself. A changed Secret needs a restart.
