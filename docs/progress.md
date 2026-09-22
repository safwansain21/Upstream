# Implementation ledger

Plan: docs/superpowers/plans/2026-09-21-upstream.md

2026-09-21: specification audit, five reference hashes and 146 acceptance entries verified; commit a010995 pushed to origin/build/upstream.

Ruling: execute engine and public visual foundation in independent bounded parallel tasks under dispatching-parallel-agents; parent owns database/API/integration. This changes inline sequencing, not scope or release gates.

Ruling: dedicated fresh clone and build/upstream branch provide isolation; another worktree is unnecessary.

Environment update: Docker Desktop installed and running UI, Linux engine currently returns HTTP 500; investigating startup logs before requesting user action.

2026-09-21 checkpoint 2: required Node/Python dependencies installed and locked. API request/security contract suite: 17 passed (`.venv/Scripts/python -m pytest tests/api/test_contracts.py -q -p no:cacheprovider`); compileall passed. This is a partial foundation, not completed application or acceptance release.

Reboot handoff: user ran WSL installation as administrator; Windows requested a reboot. After reboot check `docker info`, then initialize/start the pinned Supabase CLI. The CLI package shim currently reports executable missing; investigate postinstall/rebuild. No database migrations have run yet.

Active independent work: scientific_engine owns packages/engine, fixtures, tests/engine; web_foundation owns public pages and components; evidence_packages owns services/packages, exports/fhir, tests/packages. Each writes a subsystem progress document. Reconcile files and run tests before assuming any task complete. Parent owns root configuration, API, schema, integration.

Next parent work: Supabase configuration/migrations and RLS integration tests, API transaction endpoints, report/offline/auth integration. Do not substitute client-only persistence. Continue all eleven stages from checklist, with periodic verified commits to build/upstream.

## 2026-09-21 session 2 (Claude Code)

Order of work agreed with user (functionality first, UI images as layout reference only):
1 API skeleton + seed → 2 auth/org shell → 3 report flow + directory → 4 case workspace/readiness/network →
5 worker + engine assessments → 6 tasks/instruments/readings → 7 evidence review/revisions → 8 exports/delivery →
9 offline → 10 AI adapter → 11 remaining routes, e2e, a11y, release docs.

Step 1 DONE:
- `services/api/main.py`: FastAPI `/api/v1` with success/error envelopes, request IDs, origin check on mutations,
  RPC error-prefix → HTTP code mapping. Endpoints: health, me, profile, org reports (create w/ Idempotency-Key,
  own list, detail, visibility), cases (directory w/ search/filters/keyset cursor, detail w/ reports+events), tasks
  (list, create, assign, transition/claim). Authority stays in DB RPCs + RLS (user-scoped `set local role authenticated`).
- `scripts/seed_example.py` (`pnpm seed:example`): idempotent, local+EXAMPLE_MODE only. Example org = INTAKE_ORG_ID,
  5 users `{coordinator,expert,monitor,contributor,admin}@example.test` / `upstream-example-only`, capabilities,
  qualifications, 3 instruments w/ passing calibration, cases Mill Brook (network1 reviewed, 8 stations),
  Allotment ditch (unmapped, landmark only), Harbour channel (tidal network, unsupported). Reports go through submit_report.
- `pnpm reset:example` = guarded `supabase db reset --local` + seed.
- Local gotcha: migration 202609210002 had not been applied; run `pnpm exec supabase migration up --local`.
- APP_URL is now http://127.0.0.1:3000 (matches `next dev --hostname 127.0.0.1` and supabase site_url).
- Tests: `.venv/Scripts/python -m pytest tests/api` 26 passed (tests/api/test_http.py needs Supabase running + seed).

Step 2 DONE (auth/org shell): `/sign-in` (password for example users + Supabase email link), `/auth/callback`,
`/onboarding` (display name; explains intake when no membership), `/app` (redirects to last/first org),
`/app/[org]` layout (client sign-in redirect, membership check → "not available" state, example banner).
Web talks to API through same-origin `/api/v1` rewrite with the Supabase access token (`src/lib/api.ts`).
ponytail: route guarding is client-side; API + RLS are the authority. Add SSR cookie middleware if needed later.
Root `.env` is loaded by next.config.ts; needs INTAKE_ORG_ID and API_INTERNAL_URL (added to local .env).

Step 3 PARTIAL (report flow): `/report/new` → Dexie draft (`src/lib/drafts.ts`, per-account, guest drafts claimed on
sign-in) → `/report/[draft]/edit` 3 steps (categories/text/time; GPS on click, landmark, manual coords, local name,
"not on the map"; review + private-by-default visibility) → submit w/ idempotency key = draft UUIDv7 →
`/app/[org]/reports/[report]` receipt (visibility toggle). Directory `/app/[org]/investigations` (search, status,
origin, involving-me filters, cursor "Show more"), case overview `/app/[org]/investigations/[case]`.
Browser e2e: `tests/e2e/test_report_flow.py` (python Playwright; `pnpm test:e2e`) 2 passed — needs API on :8000 and
`next start` on :3000. Chromium installed via `.venv/Scripts/python -m playwright install chromium`.
Photos DONE: `POST /orgs/{org}/uploads` (Pillow decode check, 15MB, 40MP, JPEG re-encode drops EXIF/GPS, originals kept
only with consent) → Supabase storage via service key server-side; `GET /orgs/{org}/media/{id}[?original=true]` under RLS.
Form uploads photos at submit, failed photo keeps draft (retry/remove). HEIC not converted yet (rejected with message).
Remaining in step 3: duplicate suggestions (B09),
map pin + directory map view (needs MapLibre, do with step 4), offline queue (step 9).
