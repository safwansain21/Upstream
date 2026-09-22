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

Step 5 core DONE (worker + engine on real records), done before step 4 UI because readiness needs it:
- Migration 202609210003: network_versions.mixing_reviewed + indexes. Apply with `pnpm exec supabase migration up --local`.
- `services/worker/snapshot.py`: DB rows -> engine Snapshot + dependency rows + planner candidate actions. Conventions for
  JSON columns are in its docstring (reading bounds, background enclosure, transport_versions.configuration = the reviewed
  episode record: load, readiness, per-station discharge, future_uncertainty, planned_visit_at).
- `services/worker/__main__.py` (`python -m services.worker`, included in `pnpm dev`): SKIP LOCKED lease, 3 attempts then
  failed, assessment+classes+dependencies+recommendations+draft publication+case event+job done in ONE transaction.
- API: `GET cases/{case}/readiness` (independent checks, state ready|missing|not_evaluated), `POST cases/{case}/analyses`
  (202, deduped by canonical snapshot hash; 422 READINESS_REQUIRED when no snapshot can be built), `GET analyses/{job}`,
  `GET cases/{case}/assessment[?revision=]`.
- Seed adds Mill Brook evidence straight from fixtures.network1_snapshot (backgrounds, transport record, anchor task, visits,
  O x2 + A3 enclosure readings, accepted QC). Worker result: eligible, 5300 m retained, 3 upper-A classes incompatible,
  B2 plan bound 5300 (U=5, no guaranteed narrowing). tests/api/test_analysis.py 4 passed; full suite 82 passed.
- Case page UI DONE (`src/components/case-analysis.tsx`): schematic from network version (retained hatched / excluded dashed /
  unreviewed faded), retained km + disjoint segment count + class breakdown + draft status, next-useful-observation list with
  honest "no guaranteed narrowing", readiness checklist (ready/missing/not evaluated), Run/Recompute with job polling.
  `GET cases/{case}/network` added. Contributors see neither assessment nor readiness (review team only).
- Tests: full suite `pytest tests` 86 passed (API tests use a fresh per-run reporter because of the real 20 reports/hour limit).
  Local servers: build web, then `powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1` (API, worker, web).
- Next: map-setup page, tasks board/assignment (step 6), remaining seed scenarios (precision-limited, revised evidence, confluence, access-blocked, delivery).

Step 6 backend DONE (tasks/field work), UI pending:
- Migration 202609210004: create_task checks station belongs to case; RPCs report_access (closed -> station closed, open
  tasks blocked + bookings released + assignee notified; reopening needs coordinator), submit_readings (assignee only,
  qualification valid at measured_at, calibration valid at measured_at else held, raw needs temperature + calibration bounds +
  water group else history-only, meter SC25 history-only, stale task version recorded not rejected, future times rejected,
  idempotent by client_id, one visit per set, each replicate its own reading_version), record_quality (expert; coordinator may
  only flag suspect; history-only cannot be accepted; comparability recorded by reviewer). Policies: available_tasks, own_visits.
- API: GET tasks/{task}, GET tasks/{task}/candidates, POST stations/{station}/access, POST tasks/{task}/readings,
  GET cases/{case}/readings, POST readings/{id}/quality.
- Snapshot builder: only QC-decided readings enter; discharge falls back to the reviewed per-station interval; mS/cm converted
  exactly; unmodellable accepted reading -> NotReady naming it.
- Seed: example protocol (synthetic reading bounds), calibration bounds, water group; qualifications valid from 2025-01-01.
- tests/api/test_field_work.py (D01-D10, D12-D14) on the Harbour channel case so Mill Brook stays canonical. API suite 41 passed.
  After schema changes: `pnpm exec supabase db reset --local && pnpm seed:example` (fresh migrations verified).
- Next: task board + task detail/capture UI, assignment dialog, create task from recommendation; then step 7 (review/approve,
  instrument verification failure -> suspect -> under_review -> recompute).

Release evidence: after each step rerun the full suite and `python scripts/update_release_results.py` (edit its PASSES/PARTIAL maps). PASS only with command + passing test IDs. Session 2 end state: 40 PASS, 106 FAIL; 96 tests passed.

Step 6 DONE (tasks, instruments, readings, task board):
- UI: `/app/[org]/tasks` (My tasks / Available to me / Coordinating), `/app/[org]/tasks/[task]` (claim/accept/start/decline/
  block/submit/complete/cancel with reasons, report access closed / coordinator resolve, assignment panel from
  `GET tasks/{task}/candidates`, replicate capture form, readings table with expert/coordinator QC),
  `/app/[org]/investigations/[case]/tasks` (case board + propose form; recommendations link "Propose as task" with
  conservative-bound limitation text), case tab nav, `/app/[org]/settings/instruments` (registry + append-only
  calibration events; expert only; optional bounds validated with the engine Instrument model).
- Migration 202609210005: members read protocols and instruments.
- Tests: tests/e2e/test_task_flow.py (propose -> assign -> monitor accept + 2 replicates -> expert accept) and D09 tests.
  Full suite 99 passed; release-results 41 PASS.
- Known shortcut: QC rationale uses window.prompt (native, keyboard accessible); replace with inline form in step 6 below.

## Priority order from 2026-09-21 (user instruction; supersedes the earlier order above)
1. Map setup: network mapping and review flow (map-setup page, import/draft/validate/publish, diff), plus the map pin in
   the report form and the directory map view deferred from step 3.
2. Evidence review and approval: expert review of readings and assessments, approve/publish (dependency-hash check),
   request more evidence/reject, revisions (instrument failure -> suspect -> under_review -> recompute -> supersede).
3. Exports and delivery: at least one complete, polished export end to end (package build -> storage -> recipient view/ack).
4. Tighten gates: B01 guest test must include a photo that survives sign-in; D12 note in release-results that only the
   server side is verified until the offline client exists.
5. Remaining B gates: B09 duplicate suggestions, B12 contribution effect, B13 revised receipts.
6. Remaining routes, end-to-end tests, accessibility, release docs (old step 11). Header links Evidence/Community are
   currently dead routes - fix here at the latest.
7. Offline sync and AI adapter last (optional if time runs short).
Rules: commit+push build/upstream after every working chunk (never main, no Claude attribution); update release-results
after each step with command + passing test IDs (scripts/update_release_results.py); every new page needs loading, empty
and error states.

Priority 1 DONE (map setup):
- Migration 202609210006: draft/published network versions (published geometry frozen by trigger), one open draft per case,
  stations unique per network version, publish_network RPC (network_verify capability, rationale + evidence, boundary,
  mixing review; supersedes pointer; case.network_id moves only on publish).
- API: POST cases/{case}/network/drafts (GeoJSON import or copy of current), GET networks/{nid} (validation via engine
  classify_network, import warnings, diff vs current), PATCH networks/{nid}/edges/{edge}, POST networks/{nid}/stations
  (on node <=1 m or splits reach <=5 m, else rejected with distance), POST .../stations/{id}/approve, POST networks/{nid}/publish,
  GET cases/{case}/network/versions, PATCH waterways/{id} (external IDs), cases list now returns first located report point.
- UI: `/app/[org]/investigations/[case]/map-setup`; `src/components/map-view.tsx` (MapLibre, keyless: MAP_STYLE_URL optional,
  otherwise labelled plain background; accuracy circles; no camera moves on data refresh); directory Map/List toggle with
  explicit precision text; report form map pin (method=pin, no snapping).
- Tests: tests/api/test_mapping.py (7), tests/e2e/test_map_setup.py (3). Full suite 109 passed; release-results 51 PASS.
- Next: priority 2 evidence review and approval.

Priority 2 DONE (evidence review and approval):
- Migration 202609210007: publication_status(); propagate_evidence_change (suspect/excluded reading -> approved assessments
  under_review + case review_hold + tasks with matching rationale_hash -> needs_revision); record_quality v2; flag_instrument_failure
  (readings in interval -> suspect, never deleted); review_assessment (reject / more_evidence); approve_assessment (expert only,
  draft only, compares recomputed snapshot hash under a per-case advisory lock -> DEPENDENCY_CHANGED; supersedes prior approved;
  follower notifications); record_decision (inspection/escalate/close, optimistic version); create_task stores rationale_hash;
  publish_network takes the per-case lock. Migration 202609210008: org-adjustable report rate limit (default 20/h, cap 200;
  example org 200 for local test runs).
- API: POST assessments/{id}/approve|review, POST instruments/{id}/failure, POST cases/{case}/decisions, GET cases/{case}/assessments
  (history with publication trail), GET review-queue.
- Seed: scenario 3 `Mill Brook (revised evidence)` (fixture high branch, B2 on SC-014, 2.30 km); `seed_revised_scenario()` is
  reused by tests to create fresh copies.
- UI: `/app/[org]/evidence` (queue), `/app/[org]/investigations/[case]/evidence` (approved vs draft side by side, what changed,
  evidence table, revision audit, approve/request more/reject, case decision). Evidence tab on the case page.
- Tests: tests/api/test_review.py (4), tests/e2e/test_review_flow.py (2). Full suite 115 passed; release-results updated.
- Next: priority 3 exports and delivery.
