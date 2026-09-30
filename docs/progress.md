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

## 2026-09-21 session 2

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
Rules: commit+push build/upstream after every working chunk (never main, no tool attribution); update release-results
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

Priority 3 DONE (exports and delivery, portal method end to end):
- Worker `services/worker/exports.py`: approved assessment -> allowlisted PackagePayload (snapshot readings, retained edge
  geometry, stations, versions, reviewer pseudonym, predecessor manifest) -> build_package with offline Playwright PDF and
  Ed25519 signature when EXPORT_SIGNING_KEY_ID/EXPORT_SIGNING_PRIVATE_KEY (base64 raw 32-byte key) are set -> private storage
  `packages/{org}/{id}/{file}` -> evidence_packages row (immutable). Export job = analysis_jobs purpose 'export', one per assessment.
  Local .env has a generated dev key (never commit/reuse).
- Report layout rewritten in `services/packages/report.py` (summary cards, inline SVG schematic, tables, example-data banner).
- Migrations 0009 (delivery ack columns, grant recipient, package case_id, bucket text/plain), 0010 (admins read recipients).
- API: GET /signing-key (public), POST assessments/{id}/exports (202), GET cases/{case}/packages, GET packages/{id}/artifacts/{name},
  GET packages/{id}/verify, GET/POST recipients (admin; portal only - webhook not enabled), POST packages/{id}/deliveries
  (expert, explicit; retry = same logical delivery, new link, old link revoked; revision notice to prior recipients),
  POST packages/{id}/grants/revoke, public GET /share/{token}, GET /share/{token}/artifacts/{name}, POST /share/{token}/acknowledge.
  `services/api/storage.py` now holds the storage helper.
- UI: `/app/[org]/investigations/[case]/exports`, public `/share/[token]`, `/app/[org]/settings/integrations`.
- Tests: tests/api/test_exports.py (3), tests/e2e/test_export_flow.py (1). Full suite 119 passed; 67 gates PASS.
- Next: priority 4 (B01 with photo; D12 note), then 5 (B09, B12, B13).

Priority 4 DONE:
- B01: guest e2e test now attaches a photo while signed out; photo survives sign-in, uploads, and the receipt shows "1 photo
  attached". Found and fixed a real bug: uploads checked intake via RLS-hidden organizations row, so first-time reporters got 403
  (regression test test_first_time_reporter_can_upload_before_any_report).
- D12: release-results now marks it FAIL/partial - only the server side is verified until the offline client exists.
- Reliability fixes found on the way: concurrent exclusion-constraint bookings could deadlock (-> 503). Migration
  202609210011 serializes bookings per instrument (advisory lock); API maps psycopg TransactionRollback to 409 retryable.
  Tests: shared `wait_job()` helper (background worker may hold the lease), `free_window()` for instrument bookings.
- Full suite 120 passed; 66 gates PASS (D12 moved to partial).
- Next: priority 5 (B09 duplicates, B12 contribution effect, B13 revised receipts).

Priority 5 DONE (B09, B12, B13):
- Migration 202609210012: contribution_receipts (immutable, own-only RLS), private.write_receipts called on approval
  (reporters: recorded_for_triage; monitors: used_in_assessment with co-dependency count / excluded_after_review / history_only;
  retained before/after), contribution_effect notifications; merge_case RPC (coordinator, optimistic version, both reports linked
  via case_reports, source becomes redirect via merged_into); approve_assessment re-created to write receipts.
- API: GET duplicate-suggestions (generalized: title, rounded distance, days apart), POST cases/{case}/merge,
  GET reports/{id}/receipts, GET receipts (mine). Case detail reports now come from case_reports (includes merged).
- UI: receipt page shows "Based on assessment N", effect text, "This assessment was revised", earlier receipts;
  report form review step offers nearby investigations with "This is a new observation" default; case page merge panel + notice.
- Tests: tests/api/test_receipts.py (2), tests/e2e/test_receipts_flow.py (2). Full suite 124 passed.
- Next: priority 6 (remaining routes, e2e, accessibility, release docs). Header links Community/Evidence: Evidence now exists;
  Community, notifications, settings/profile/organization/protocols, observations/history/decision case tabs, example scenarios
  and /onboarding org join remain.

Priority 6 IN PROGRESS (routes, e2e, accessibility, release docs):
- All PRD section 5 routes now exist: case tabs via `src/components/case-tabs.tsx` (Overview, Observations, Tasks, Map setup,
  Evidence, History, Decision, Exports); `/app/[org]/notifications`, `/community`, `/settings/{profile,organization,protocols}`;
  public `/example` (API-driven list) and `/example/[scenario]` (read-only, example orgs only).
- Migration 202609210013: set_capability / set_membership_status RPCs (admin only, no self-grant, audit log), members can read
  fellow members' display names. API: GET cases/{case}/events (filter + cursor), notifications (+read), community, members,
  members/{id}/capabilities|status, public GET /examples and /examples/{slug}. Seed now enqueues example analyses.
- Accessibility fixes from axe: unlabeled schematic node buttons removed from the station list; quiet button colour #2b6275
  (6.1:1). DocumentTitle sets per-route titles via PageIntro.
- Tests: tests/e2e/test_routes.py (route render + reload for expert/coordinator, dead-link crawl, axe serious/critical = 0),
  tests/api/test_membership.py (G03, G06). Full suite 131 passed; 71 gates PASS.
- Next in priority 6: A01 one-command setup check + README/runbook, A05 build/secret scan, A06 production admin doc,
  I05 responsive viewport pass, I06 keyboard-only flows, I09 reduced motion, remaining partial gates. Then priority 7.
- Priority 6 continued: tests/e2e/test_responsive_a11y.py (7 widths reflow, keyboard-only report, reduced motion),
  scripts/secret_scan.py + tests/security/test_secrets.py (A05), scripts/bootstrap_org.py + tests/api/test_bootstrap.py (A06),
  README rewritten with setup/test commands, docs/runbook.md (env classification, first production setup, key rotation,
  backup/restore drill, rollback, queue retry, solver limits). Full suite 144 passed; 73 gates PASS.
- Remaining after this: priority 7 (offline sync, AI adapter) and the long tail of partial/untested gates (see release-results).
- Security batch: duplicate suggestions moved to POST (precise coordinates were reaching access logs - G11 fix);
  GET /me/export and POST /me/deletion-request (disables account via auth ban + revokes memberships, withdraws public
  visibility, keeps evidence pseudonymized; admin completes erasure per runbook); profile page buttons.
  tests/security/test_boundaries.py (G02 G05 G09 G11 G12). Full suite 149 passed; 77 gates PASS.
- Durability: worker main loop now survives database interruptions (found when a DB reset killed the worker);
  tests/api/test_durability.py (A04). Upgrade migrations: tests/migrations/test_upgrade.py (A08) - destructive, runs only with
  UPSTREAM_RUN_DESTRUCTIVE=1, resets to an earlier schema, inserts data, upgrades, then fresh-resets and reseeds.
  Full suite 152 passed (1 destructive skipped); 79 gates PASS.
- Gate batch: tests/api/test_gates_misc.py (B14 E14 E22 E27 G08 A02), tests/e2e/test_gates_ui.py (B05 B15 G07-html I15 I16),
  tests/test_docs.py (J10; found GEOCODER_BASE_URL undocumented - runbook now states no place search exists).
  Full suite 164 passed; 91 gates PASS.
- More gates: E08 equality + planner flips exactly at 105/23 (tests/engine/test_threshold_equality.py), C09 independent readiness
  checks (tests/api/test_readiness_checks.py; readiness matching now case-insensitive), D10 audit entry, J04 origin labels on
  map captions, readings table, receipts (OriginBadge also fixed to label replayed data). Full suite 169 passed; 95 gates PASS.
- Engine gates: tests/engine/test_topology_and_limits.py (C06 subdivision/station insertion, E20, E26); C11 cited from existing
  open-boundary tests. Full suite 173 passed; 99 gates PASS.
- Remaining FAIL/partial gates now: A01 A07 B10 B11 D12 F11 F13 F14 G04 G07 G10 G11 H01-H12 I01-I14 I17 J01 J02 J03 J05 J07
  J09 J11 J12. Offline (H*) and AI (B10, H08, G07 prompt injection) belong to priority 7.
- FHIR: official validator 0 errors on a bundle from a real approved assessment (tests/packages/test_fhir_official.py; warnings documented in docs/fhir-validation.md); pnpm verify:fhir runs it. 101 gates PASS.

Priority 7 (offline) DONE for reports:
- `src/lib/submit.ts` (claim with compare-and-set; photos first, then report with the draft's idempotency key; network failure
  -> status "queued"; stale "submitting" older than 2 min is reclaimable), `src/components/offline.tsx` (offline banner that
  explains which actions need a connection; foreground sync of the signed-in account's queued drafts on reconnect after a
  session refresh; stops with a message on 403), `public/sw.js` + `src/components/service-worker.tsx` (app-shell cache for
  static assets and visited pages, never /api; updates wait for all tabs to close - no forced refresh).
- Found and fixed: sends interrupted by a closed tab stayed "submitting" forever. Session lives in cookies (@supabase/ssr).
- tests/e2e/test_offline.py (H01 H02 H03 H05 H09 H12). Full suite 179 passed; 107 gates PASS.
- Not built: offline capture of task readings (D12 client side), cached task packets, H04 quota handling test, H10 update
  prompt test. Next: AI adapter (B10, H08, G07 prompt injection), then remaining partial gates.

Priority 7 (AI) DONE:
- `services/api/ai.py`: disabled by default (no key) and an OpenAI Responses adapter (AI_API_KEY/AI_MODEL/AI_BASE_URL; https only,
  or a localhost test provider outside production), strict json_schema output, closed code list, report text passed as quoted
  data, no tools, whole answer rejected on extra keys/unknown codes/invented references, 20 s timeout.
- API: POST ai/describe (photos only with explicit consent, 10/hour, every run logged in ai_runs; failure -> 503 "AI assistance is
  unavailable; you can continue manually."), POST ai/runs/{id}/review (records what was accepted).
- UI: optional "Suggest wording" panel in step 1; nothing is added unless the person clicks "Add to my report".
- Tests: tests/api/test_ai.py (8, fake local provider), H08 browser test. Full suite 188 passed; 110 gates PASS.
- The OpenAI adapter is verified only against a local fake provider; it has not been tested against the real service.

## 2026-09-22 session 3

Performance, cancellation and public snapshot (finished the chunk left uncommitted by the restart):
- J01/J03 measured in docs/performance.md (hero WebP + preload, OfflineStatus only on report/workspace routes, set-wise
  `case_read` RLS policy in 202609210014_fast_case_policy.sql, scripts/seed_load.py 10k-case load org).
- G04 `/api/v1/public/cases/{id}`: only cases with a report its author made public; ~1 km coordinates; no text/people/readings.
- J02 `POST analyses/{id}/cancel` + Cancel analysis button; worker discards results of cancelled jobs. Fixed: the worker's
  failure path overwrote a cancelled job's state. Still partial: the button is not browser-tested.
- G11 worker log hygiene test. G10 stays FAIL: webhooks are refused; the signed HTTPS outbox with SSRF checks is not built.
- Test hygiene: directory tests search for Mill Brook instead of assuming it is on page 1; /status axe scan waits for the
  live check to settle (the button flipped disabled->enabled mid-scan).

Evaluation (J05, J07): fixtures/evaluation.py simulator (truth stays outside the engine), paired hash-indexed exogenous
values, three policies through one shared inference/eligibility/stopping loop, nominal and biased-background scenarios.
Results in docs/evaluation.md: nominal 0 incorrect exclusions for all policies; biased background 10/60 (planner) and
12/60 (random) incorrect exclusions. Tests: tests/engine/test_evaluation.py.

Next: A01, A07, B11, F11, G10, G11 leftovers, J01-J03 evidence, J09, J11, J12; then offline leftovers.

## 2026-09-22 session 4

Stragglers (J02, J11, B11, F11; A07 in progress):
- J02: browser test clicks Cancel analysis on a queued job (the real POST response is held in the queue via the database,
  then the real cancel endpoint runs); earlier approved revision stays current and the workspace stays navigable.
- J11: tests/test_content_audit.py (route set equals PRD section 5; no placeholder/partner/"coming soon" copy; every button
  and form has a handler); rendered pages are also scanned for placeholder copy.
- A07: tests/e2e/test_route_states.py (slow-then-failing API on every workspace/case/public data route shows loading, then an
  error with the page heading and header navigation; contributor permission states; empty states in a new real org).
  Added `PageState` so page-level loading/error keeps the heading and a Retry. Fixed: a contributor on case Evidence saw
  "No assessments yet" (RLS returned nothing) instead of the permission state; report/task detail now show "not found" states.
- B11: browser test for device-saved -> "Uploading photo 1 of 1" -> server-received receipt.
- F11: recipients carry admin-configured concerns (migration 202609210015); GET cases/{id}/context returns sourced layers,
  attention level and recipient suggestions, each citing its source; Decision view shows them. Engine snapshot unchanged.
- Full suite 212 passed, 1 skipped; 120 gates PASS.
- J09 DONE: scripts/backup_restore.py drill (supabase db dump roles/schema/data + storage objects with SHA-256 manifest ->
  isolated second stack UpstreamRestoreDrill on ports 553xx -> counts, object hashes, package verification, sign-in).
  tests/ops/test_backup_restore.py; runbook "Backups and restore" rewritten. Not yet in a recorded full run.
- A01 IN PROGRESS (paused 2026-09-22): scripts/local.py setup now fills blank local keys into .env and calls installed
  binaries (no pnpm needed at runtime). Clean clone from GitHub at %TEMP%\ua01: `npx pnpm@11.19.0 install`, Python 3.12 venv +
  requirements.lock, playwright chromium, `cp .env.example .env`, `pnpm setup:local`, `pnpm seed:example`, `pnpm dev` all
  worked and /api/v1/status answered 200 through the web proxy. Still to do: browser check that the seeded example shows,
  README update (pnpm fallback via npx/corepack, setup:local fills keys, short clone path on Windows), then `supabase db reset`
  + both seeds, rebuild, restart, full suite, record A01/A07/J09 evidence.
- Next after A01: G10 webhook outbox, then offline leftovers, then J12.

## 2026-09-22 session 5 (ponytail mode)

- A01: tests/migrations/test_fresh_checkout.py (destructive-gated) clones the committed tree to %TEMP%\ua01, runs the README
  commands (pnpm install, venv + requirements.lock, playwright chromium, .env, pnpm setup:local, seed:example, dev), checks
  status through the web proxy, the example chooser and the signed-in example case, then restores this checkout's stack.
  README: npx pnpm fallback, one-step setup:local, short clone path on Windows.
- G10: migration 202609210016 (recipient_secrets and webhook_outbox, RLS with no policies), services/worker/outbox.py
  (HMAC-SHA256 signature over timestamp + body; DNS re-resolved and checked each attempt, request sent to the checked IP
  with Host/SNI of the configured name; no redirects; 1m/5m/30m/2h/12h then failed), admin GET deliveries + POST retry
  (same delivery id, stored payload bytes). Integrations page: webhook destination, secret shown once, delivery status + Retry.
  tests/api/test_webhooks.py (local receiver + the real worker).
- Full suite 218 passed, 2 skipped (destructive); 124 gates PASS.
- Offline leftovers: D12 (task readings saved on the device on network failure under their capture task version, sent on
  reconnect by the same foreground sync; the server stores submitted_task_version and routes them to quality review = H06),
  H04 (failed upload and IndexedDB quota stay recoverable), H10 (a real sw.js update waits, the draft survives, then sends),
  H11 (fixed: a late poll response could revert a cancelled analysis to "queued"; state order guard). No streaming channel
  exists; polling is the only status path.
- H07 stays FAIL: a failing configured basemap is untested (needs a MAP_STYLE_URL build); caption no longer claims records
  are shown when the basemap fails.
- J12: docs/handoff.md (tests that exist, integrations unavailable/unverified, empirical limits, no field-validation claim);
  tests/test_docs.py keeps its open-gate list and test inventory in sync with release-results and tests/.
- Final full run on a fresh database: 223 passed, 2 skipped (destructive; A01 and A08 recorded separately); 130 gates PASS,
  16 FAIL (H07 and the I gates reserved for the UI pass).
- Basemap: OpenFreeMap Liberty (`https://tiles.openfreemap.org/styles/liberty`) is the default in .env.example; keyless, no
  account or payment (A02 test checks the configured URL carries no key/token). Attribution (OpenFreeMap, OpenMapTiles,
  OpenStreetMap) comes from the tile source and is asserted on the map. Found and fixed: our records waited for the map's
  `load` event, i.e. every basemap tile, so a slow or failing provider left the map without records; they now attach on
  `style.load`. Any map error now shows the honest fallback caption.
- H07 closed: tests/e2e/test_map_setup.py::test_failing_basemap_provider_falls_back_to_the_list (tile outage simulated by
  pointing the real tile index at a closed port, because MapLibre fetches vector tiles in a worker Playwright cannot route;
  full provider outage via 503). Map browser tests now need internet access to tiles.openfreemap.org.
- Full suite on a fresh database: 224 passed, 2 skipped (destructive); 131 gates PASS, 15 FAIL (I gates only).

## 2026-09-23 dark UI rebuild (handoff: NewUI/Upstream-Dark-Handoff)
- Theme: design.css (tokens, primitives, states, motion) and pages.css (page compositions) replace globals.css/dark.css.
  Fonts: Newsreader 500 + 400 italic, Source Sans 3 400/500/600, IBM Plex Mono 400 (removed Barlow x3, Source Sans 700,
  Newsreader 400/600); Caveat (48.8 KB, @fontsource/caveat 5.3.0) loads only on the report pages for the notebook note. [Correction 2026-09-26: this
  was not true at the time; nothing imported Caveat and the note rendered in the fallback serif. Fixed below.]
- Scene: one plate art box, WebGL water (single canvas, pauses offscreen/hidden/reduced motion/save-data), independent
  branch and reed sway, luminous routes drawn from the first dot; mounted per page, not in the root layout.
- Rebuilt so far: landing (One Health narrative: where a change enters, who reaches that water, traceable handover incl.
  FHIR R4; no health claim), how it works, sign in, onboarding, status, policy pages, system states, examples, report flow,
  receipt, investigations directory (list-to-map connectors from real rows), case header/tabs, case overview (ruled-out vs
  retained stretches, stretch detail, next station, readiness with role, M-13 evidence timeline), evidence review, decision
  (three distinct statements), history. Still in the old markup under the new tokens: local map, observations, case tasks,
  packages, field tasks, evidence queue, community, notifications, share page, settings.
- Found and fixed: MapLibre's worker URL resolved to the page, so vector tiles and GeoJSON never rendered; the worker is now
  served by app/maplibre/[file] and set with setWorkerUrl. Basemap switched to OpenFreeMap Dark (keyless) to match the UI.
- Missing API data (shown honestly, not faked): the engine returns no unsat core, so a ruled-out stretch cannot name the
  single reading that excluded it; the stretch detail shows its class reason, its signature stations and the accepted
  readings there. The example API has no prior revision, so example pages show the current assessment only (no before/after).
- Tests changed for the new interface (none deleted or skipped): J04 origin label "Example data" -> "Synthetic example";
  I09 reduced motion is a switch, not a select; A07 empty directory heading "No investigations yet"; I15 now asserts content
  never loops and only the scene loops (handoff supersedes it); duplicate-suggestion test uses a recent observed_at (±3 day
  window); A02 accepts any OpenFreeMap style URL.

## 2026-09-23 continuation and audit
- Reconciled the later local dark-UI checkout with this `build/upstream` checkout. The earlier uncommitted asset and connector
  experiment is preserved in local stash `pre-import local dark UI work 2026-09-23`; the later checkout's page work and its
  two committed asset commits are incorporated here.
- Browser audit found the scene, network, and list-map SVG draw CSS used a one-pixel dash on paths hundreds of units long.
  The main home route was invisible after the animation. Measured path lengths now drive those animations; the home-route
  browser regression test first failed and then passed. The settled 1440×900 home capture shows the route and branches.
- First-time report submission could reach a receipt before cached `/me` reflected the membership created by the report.
  The submission transition now refreshes membership before entering the workspace. The geolocation-denied, landmark-only
  browser journey passed after this change.
- The production build passed. The landing budget test measured 2,340 ms mobile LCP, 0.003 CLS, and 236 KB initial JS gzip
  after the motion fix (2,500 ms LCP limit). A PDF verification test exposed that `pypdf` was missing from `requirements.lock`;
  it is now pinned at 6.10.2, the version in the later checkout, and the previously unrun final test group passed 21/21.
- Remaining UI scope: the local map, observations, case tasks, packages, field tasks, evidence queue, community,
  notifications, share page, and settings still need their reference-level compositions and a complete screenshot pass.

## 2026-09-26 memory and performance pass (Phase 1)
Measured before fixing (Playwright/CDP probe against `next start`, 1440x900, forced GC; host numbers from process lists).
- Host: the app stack is small (API 30 MB, worker 24 MB, `next start` 63 MB). Docker VM ~1.4 GB, of which Supabase analytics
  (Logflare) 547 MB, realtime 241 MB, studio 218 MB; `supabase_vector` is crash-looping. The user's Chrome (61 processes,
  54 renderers, 10.4 GB) is the largest consumer on the machine. The repo lives in OneDrive: node_modules (737 MB, 26.5k files)
  and `.next` (1.3 GB, of which a stale 1.1 GB `next dev` cache, now deleted) were being synced.
- Leak (root cause): every client navigation between workspace pages showed the root `app/loading.tsx`, which mounted a full
  "screen" DuskScene with lazy images and a WebGL canvas for a moment. A lazy image unmounted before it loads stays registered
  with the document's media-query matcher, so each flash left a whole detached scene (plus React fibers) alive: +100-200 DOM
  nodes and ~36 listeners per navigation, unbounded. Fix: `app/app/[org]/loading.tsx` loads inside the shell (header band stays);
  the root loading screen uses a still scene with eager images. Heap snapshot and 12-cycle loops now flat.
- Idle cost: the workspace band ran the water shader at 60 fps on every workspace page (28-29% main-thread busy at idle in
  headless Chromium) although the band shows only a graded sliver of water. The band is now a still plate with no WebGL context
  (0% idle). Hero/screen water draws at ~30 fps (35-37% -> 16-20% busy in software GL).
- Foliage sway now pauses with the water (offscreen, hidden tab, reduced motion, save-data) via `data-paused`; the reed drift
  moved onto the independent `translate` property so the reeds are one composited layer instead of two; the permanent
  `will-change` was removed. Loading-line and skeleton animations exist only while a LoadingState renders (0 infinite
  animations on settled workspace pages).
- MapLibre: one map per mount, `map.remove()` on unmount, sources added once on `style.load`; contexts are released (live
  count stays 1 on the directory, 0 elsewhere).
- Removed unused dependencies (never imported): @fontsource/barlow-condensed, @fontsource/caveat (wrong: .ink-note names
  "Caveat" in CSS; restored below), motion, lucide-react,
  react-hook-form, @hookform/resolvers, zod. No bundle change (they were never in a bundle); smaller install.
- Simplifications (visual intent kept): workspace band water is a still plate; water frame rate ~30 fps; the loading screen's
  scene is still (no water) for its brief appearance.
- Tests added: test_gates_ui.py::test_foliage_sway_pauses_with_the_water_offscreen,
  test_gates_ui.py::test_workspace_navigation_keeps_no_scene_or_webgl_behind.
- Landing budget after: desktop LCP 72-132 ms, mobile LCP 2388-2424 ms (before 2380 ms; budget 2500), CLS 0.003, initial JS
  239 KB gzip (before 236 KB).

## Handoff 2026-09-26 (before the repo moves out of OneDrive)
Where things stand:
- Phase 0 (ground truth): done. Uncommitted dark-UI work was checkpointed as bde22d9. Stash `pre-import local dark UI work
  2026-09-23` is kept (its content is already reworked into HEAD). The 34 references map one-to-one to routes (gallery.html).
- Phase 1 (memory/performance): done; see the entry above. The local stack is trimmed in supabase/config.toml (analytics,
  studio and edge_runtime off; realtime kept on for the planned live /events streaming). Both seeds stay in the reset procedure.
  The pinned HL7 validator JAR (exports/fhir/.cache, gitignored) had to be downloaded again for F13; after a move, run
  `exports/fhir/validate.py --download` once, or the F13 test is skipped.
- Phase 2 (remaining pages): done. All ten page groups rebuilt: local map, observations, case tasks (6b597bb), packages,
  field tasks, evidence queue, community (6261057), Caveat restore (5efb45e), notifications and share page (31b64a0),
  settings x5 (40d75b4). Last milestone run on 40d75b4 (fresh reset + both seeds, 2026-09-26): 228 passed, 2 skipped
  (destructive), 1 failed: tests/test_docs.py found an uncommitted Phase 3 test file (tests/e2e/test_visual_gates.py) that
  the handoff inventory did not list yet; committed code is unaffected. 131 PASS.
- Phase 3: gates closed. Milestone run on 597143b (fresh reset + both seeds, 2026-09-27): 244 passed, 2 skipped
  (destructive); 146 PASS, 0 FAIL. An earlier overnight attempt was invalid (the database container restarted mid-run,
  most likely the laptop sleeping: 23 failures incl. API-only security tests, 10 h runtime) and was rerun from a fresh
  reset. Remaining: the leak click-through and the comparison of pages rebuilt before this session with their references.
- Gates (before Phase 3): 131 PASS, 15 FAIL (I01-I14, I17 only). Phase 1 milestone run on the trimmed stack, fresh reset + both seeds:
  229 passed, 2 skipped (destructive), 2026-09-26.

Memory before/after (Chromium 1440x900 against `next start`, forced GC; busy = main-thread task time at idle, software GL):

| Measure | Before | After |
|---|---|---|
| Workspace page idle | 28-29% busy, 60 rAF/s, 1 WebGL context | 0% busy, 0 rAF/s, 0 contexts (directory map: 1) |
| Public scene pages idle | 35-37% busy | 16-20% busy (water ~30 fps) |
| DOM after 5 navigation loops | 756 -> 1556 nodes (leak) | 357 -> 359 (flat; 12-cycle loops flat) |
| JS heap per route | 4.2-9.7 MB | 4.2-9.7 MB |
| Supabase containers | ~1,591 MiB (vector crash-looping) | ~669 MiB |
| Landing mobile LCP / initial JS | 2,380 ms / 236 KB gzip | 2,388-2,424 ms / 239 KB gzip (budget 2,500 ms / 250 KB) |

## 2026-09-26 Phase 2 pages
- Local map (map-setup): readiness strip states what is missing and which role fixes it (coordinator places/imports,
  network reviewer confirms and publishes); tabbed review panel (Summary, Linework, Connectivity, Evidence) from the version
  record; reaches and stations tables with review status; role-specific empty state; Term treatment for reach, readiness,
  network version. Missing API data: the reference marks the case's observation on the schematic and shows reach names and
  per-version edit times; the network version API returns neither a case observation position in schematic space nor reach
  names or edit timestamps, so they are not shown.
- Observations: reports list with time, type and location filters, accuracy (± m) and whole-row links; readings table with
  station/quality filters, client-side CSV of the shown rows, plain assessment use (Yes / No / Not yet with the reason), one
  origin caption when all rows share an origin; limits callout with the SC25 term; role-specific empty states (contributors
  are told readings go to the review team and that they will be notified of assessment changes). Missing API data: report
  photo thumbnails — the case detail API returns no media ids for reports, so no thumbnails are shown.
- Case tasks: tasks grouped by station beside a compact schematic of the case network (selecting a station scrolls to its
  group); task cards with state, window, protocol name and purpose; the propose form (coordinators) with a time-window group;
  a static list of the four checks that assignment runs on the server (qualification, verified instrument, access, booking);
  non-coordinators are pointed to Field tasks; role-specific empty states. Test changed for the interface:
  tests/e2e/test_task_flow.py now selects the form's station with get_by_label('Station', exact=True), because the page now
  also has a "Tasks by station" region and the schematic's station list (the form itself is unchanged).
- Packages: lifecycle line (created → delivered → acknowledged) lit only by recorded state, grows once to that state; package
  switcher when a case has several; manifest hash with copy; artifact table with a plain description per file; package-level
  integrity check; send panel and delivery ledger side by side; role-specific states. Missing API data: per-artifact size and
  per-artifact integrity (the verify endpoint checks the whole package), so neither is shown per row.
- Field tasks: tasks grouped by investigation and station with a river rail of the groups; plain task kinds for contributors;
  open work first and finished tasks collapsed; "who can take a task", safety and "no one is ranked" notes; role-specific
  empty states. Missing API data: task photos, station names and distances in the reference are not in the tasks API.
- Evidence queue: status filters with counts (all, new, reopened, on hold), cards with revision, computed time and
  conditional retained length, a detail panel explaining what the status means. Missing API data: priority, place,
  per-item preview map and reviewer assignment are not in the review-queue API, so there is no priority sort or assignment.
- Community: ways to help (report, open field tasks), safety note, contribution counts with "no rankings, no points",
  latest receipt, published updates with links to each investigation.
- Caveat restored for the report notebook note: @fontsource/caveat 5.3.0 (exact pin), one weight (400) and the latin subset
  only, imported in app/report/layout.tsx so only /report/new and /report/[draft]/edit load it. Download cost: one woff2,
  48,836 bytes, measured in the browser on /report/new; / and /how-it-works load none. The note is now sized in container
  units relative to the notebook (its viewport-based size overflowed the 330 px notebook) and sits on
  the left page as in dark-report.png. Landing budget after (test_public_landing_budgets, production build, two runs):
  desktop LCP 132-148 ms, mobile LCP 2,388-2,400 ms (budget 2,500), CLS 0.003, initial JS 239 KB gzip (unchanged).
- Notifications: a timeline grouped by day (today, yesterday, this week, earlier) with a spine that draws once, an amber
  node and glyph for unread items, one action per update (view report, view task, see what it changed) and mark as read;
  all/unread filter; plain empty state. Missing API data: notifications carry only an object id, so an assessment update
  cannot name or link its investigation and no place is shown.
- Share page (recipient): conclusion card with origin, assessment and review date, and an example-data caution; the four
  "does and does not show" columns; files with plain types, manifest hash and signature note; status, details and
  acknowledgment in a side column. Acknowledging is described as not agreement. Missing API data: file sizes, per-file
  checksums and the sending organization's name are not in the share view.
- Settings (5 references): a shared settings layout with side navigation (a scrolling row on narrow screens). Profile:
  labelled rows (display name, motion and map, drafts on this device with a real list of unsent drafts, your data with
  download and a danger-styled deletion request). Organization: searchable member table and a detail panel with a switch per
  capability in plain words, the audit reason first, and revoke/restore; qualifications shown in plain words. Instruments:
  instrument picker, details and history with result dots, and the expert's event form with a result radio group.
  Protocols: searchable list and detail with numbered instructions when the text has steps. Integrations: provider status
  strip (AI, email, background map, signing), recipient registry, add-recipient form and delivery ledger. Missing API
  data: instrument photos, location and a protocol field on calibration events; protocol bounds, reviewer and review
  date; member emails and join dates; recipient roles. Protocol editing and "new protocol" do not exist, so none is shown.

## 2026-09-26 Phase 3 gates
- ACCEPTANCE.md amendment (dated 2026-09-26): I01 (dark primary landing and workspace references), I02 (dark handoff
  palette), I11 (MOTION_SPEC, PRD values where unspecified) and I15 (only the scene's water and foliage loop, pausing
  offscreen, hidden and under reduced motion). The evidence rows of all four cite it.
- tests/e2e/test_visual_gates.py (15 tests) covers I01-I14 and I17 on every required page: public, report, share, all
  workspace and case routes, at 1920-320 px where relevant.
- I01 inspection (test-results/i01/*-side-by-side.png, 1440x900): landing matches 07-visible-current in composition (hero
  type left, amber origin with its note, drawn route over the water, process line with the unmapped-stream note, header
  links). Workspace matches dark-investigations (heading, search and filters, list/map toggle, list beside the map with
  correspondence lines). Differences: no case photos in list rows (not in the API), and the directory shows accumulated
  synthetic test cases rather than three curated examples.
- Found and fixed while closing gates: the case evidence page skipped from h1 to h3 (revision panels now h2); the instruments
  settings page overflowed at 1024 px (inputs in the side form could not shrink); menus opened with no transition (now a
  200 ms settle, within the handoff's state-transition range); route focus added (focus moves to the new page's h1 after a
  client navigation); recomputing with unchanged evidence returned an already finished job and the page never refreshed
  the result (now refreshed at once).
- I12 reduction: real data cannot be made to narrow on demand (an excluded reading cannot be restored, and new readings
  moved the result unpredictably), so the test serves the earlier real assessment back as the next revision to check the
  reduction is announced exactly like the expansion. The expansion uses real data end to end.

## 2026-09-27 Phase 3 visual comparison (all 34 references)
Method: each route captured against a production build after a fresh reset with both seeds, at the reference's own size
(1672x941; landing 1586x992) and at 390 px full page, then compared one route at a time (capture script and images in
test-results/compare, gitignored). Parameterised routes used real objects: Mill Brook, a contributor's submitted report,
a monitor's assigned and accepted task, an approved case with a created and delivered package, the admin for the two
admin-only settings references. Shared change: the header links now sit at the right edge beside the account tools, as
in every reference (they sat beside the brand).
- 07-visible-current (/): fixed: subtitle wrapped to three lines (now one, as in the reference). Otherwise matches.
- dark-how-it-works: fixed: the scene took the whole first screen, so the roles band was below the fold; the hero now
  ends at about 64% of the screen with the stage line and all five stage labels over the water and the roles band in view.
  At 390 px the drawn stage line crossed the intro text; it is hidden there (the stages are listed as text).
- dark-examples: fixed: only the featured card fitted the first screen; tighter intro and compact secondary rows show all
  three. Documented difference: card art is the scene plate with an illustrative trace (no case photos in the API).
- dark-example-detail: fixed: intro and schematic height tightened so map, notes and timeline read as one screen.
- dark-sign-in: matches (the primary button is dimmed until a password is typed; kept, it is the disabled state).
- dark-onboarding: matches in composition. Fixed at 390 px: the page was 427 px wide (the organization row's name
  column could not shrink; at narrow widths the action now sits under the name); /onboarding is now part of every visual gate's page set, so I05 reflow covers it.
- dark-status: matches; the real check list has seven services (the reference shows six).
- dark-privacy: fixed: the section list on the spine was compressed; its spacing now follows the reference.
- dark-terms: fixed: the numbered sections were squeezed into a narrow column by a class clash with the receipt's
  numbered list (`.numbered`); renamed to `policy-numbered` and the column widened.
- dark-accessibility: fixed: rebuilt to the reference composition (hero with the comfort switches beside it, an
  "On this page" row that underlines the section being read, three columns with hairline icons, WCAG note under "Our
  approach"). Same text and the same MotionSettings control.
- dark-system-states: matches for not found and error; loading is the shared LoadingState. Fixed: a script-focused
  heading (route focus) drew a focus ring; headings focused by script no longer show one, controls still do.
- dark-report: fixed: the step line spanned the whole column; it is now compact as in the reference. Documented
  difference: the reference's single-row chips and inline map are a denser layout of the same fields; ours keeps the
  labelled checkbox choices and the map on step 2 (the tested form).
- dark-report-review: fixed: the review step kept the "What caught your attention?" title and opened scrolled down; it
  is now titled "Review your observation" with its own lead, and every step change starts at the top.
- dark-receipt: matches. Documented difference: no photo in "What you reported" (the submission had none).
- dark-investigations: matches (header links now right-aligned). Documented differences: no case photos in rows (not in
  the API); markers are one style because the directory API has no location-certainty class per case.
- dark-tasks: matches in composition. Documented differences: task photos, station names and distances (not in the API).
- dark-task-detail: fixed: rebuilt to the reference composition (title with station and case, assigned/window/access
  facts; station and access, instrument and protocol on the left; actions, record readings and submitted readings on the
  right; replicate fields in one row). All actions, labels and field ids unchanged. Documented differences: station
  coordinates map, earlier readings at the station (not in the task API).
- dark-review-queue: matches. Documented differences: priority, place, preview map and reviewer assignment (not in the
  review-queue API).
- dark-community: fixed: added the reference's hairline icons to the three sections, both help cards, the contribution
  tiles and the safety line. Documented difference: no recent-activity list (no per-contributor activity API).
- dark-notifications: fixed: title is now "Updates that matter". Documented difference: no place per update (the
  notification carries only an object id).
- dark-shared-package: fixed: icons on the four "does and does not show" columns and the package status. Documented
  differences: file sizes, per-file checksums, sender organization name (not in the share view).
- dark-overview: fixed (shared case header): the back link, name, tabs and content now start about 60 px higher on every
  case page. Otherwise matches.
- dark-map: fixed: case sub-page titles are sized as working-page titles (the display size pushed the readiness strip
  below the fold). Documented differences from Phase 2 stand (reach names, edit times, observation position).
- dark-observations: fixed: section icons (people, flask) as in the reference. Documented difference: report photos.
- dark-case-tasks: matches. Documented difference: station coordinates beside each group (not in the case API).
- dark-evidence: fixed: the intro repeated the "Cause unconfirmed" badge already in the case header; removed. The
  single panel is shown here: a fresh seed has one draft per case. "Previous approved assessment" appears beside the
  draft (with "What changed?") only once an earlier revision was approved; not faked for the picture.
- dark-decision: matches (three distinct statements, record-a-decision form).
- dark-history: fixed: rows showed raw payload keys ("eligible: true · retained length m: 5300"); they now read in
  plain words ("able to rule stretches out · 5.30 km retained") with an event icon per row; raw fields stay in "View
  record". Documented differences: actor roles and before/after images (not in the events API).
- dark-packages: matches with an approved, delivered package (lifecycle lit to Delivered). Documented differences:
  per-artifact size and integrity (the verify endpoint checks the whole package).
- dark-settings-profile: fixed (shared settings layout): side navigation now carries the reference's hairline icons;
  settings titles and rows tightened.
- dark-settings-organization: matches for the admin. Documented differences: member emails and join dates.
- dark-settings-instruments: fixed: date-picker icons were inverted twice (dark on dark) by a filter on top of the dark
  color scheme; now light. Documented differences: instrument photo, location, protocol per event.
- dark-settings-protocols: fixed: statuses capitalised ("Approved"). Documented differences: bounds, reviewer, review
  date; no protocol editing or "New protocol" (not in the API).
- dark-settings-integrations-v2: fixed: provider strip now has an icon per provider with its status line beneath, as in
  the reference. Documented difference: recipient roles.

## 2026-09-27 Phase 3 leak click-through (every route)
Production build (`next start`), Chromium 1440x900, forced GC before each reading; client-side navigation
(`next.router.push`) through all 34 routes: public, report, share, onboarding, workspace, every case tab, task and report
detail. Five loops. Live WebGL contexts are counted by a probe that holds each created context weakly (alive after GC and
not lost = live). Test: tests/e2e/test_performance.py::test_click_through_every_route_stays_flat (per-route values in
test-results/leak-click-through.json).
- Found (regression the two-route Phase 1 test could not see): DOM grew by ~343 nodes and ~0.5 MB per loop (loop end
  2,053 -> 3,572 nodes). Bisected by route group: workspace, public pairs and app<->public transitions were flat; the
  growth came from each client navigation into a public page that shows the root loading screen (/example, /report/new,
  the example walkthroughs). CDP queryObjects found one detached `div.screen-top` (the loading StatePage) retained per
  such navigation: its `<picture>` images were still loading when it unmounted, and an image element with a pending load
  keeps its detached tree alive, even with eager loading (Phase 1's fix). Fix: the still loading scene paints the plate
  as a CSS background and has no `<img>`; its foliage is left out for that moment.
- After: DOM at the loop end 1,318 in all five loops; per route, loop 2 -> 5 within -4..+21 nodes. WebGL: 1 live context
  on the directory (map) and on each scene page (water), 0 on every other workspace page, identical in loops 1 and 5;
  contexts are released on leaving. Heap at the loop end 13.93 -> 15.44 MB over five loops, decelerating
  (+0.60, +0.40, +0.31, +0.20). A 20-loop workspace run plateaus (13.87-13.99 MB from loop 14 to 20, +0.01..0.05 per
  loop; DOM flat at 261): warm-up and caches filling, not a leak. Public pages plateau by loop 8 (+0.02 MB).

| Route (loop 1 -> loop 5) | Heap MB | DOM nodes | Live WebGL |
|---|---|---|---|
| /investigations | 11.48 -> 15.22 | 1,250 -> 1,319 | 1 -> 1 |
| /tasks | 9.87 -> 13.49 | 220 -> 287 | 0 -> 0 |
| /evidence | 10.18 -> 13.69 | 1,023 -> 1,088 | 0 -> 0 |
| /community | 10.12 -> 13.59 | 441 -> 504 | 0 -> 0 |
| /notifications | 10.11 -> 13.53 | 179 -> 240 | 0 -> 0 |
| /settings/profile | 10.26 -> 13.59 | 274 -> 358 | 0 -> 0 |
| /settings/organization | 10.34 -> 13.57 | 212 -> 267 | 0 -> 0 |
| /settings/instruments | 10.42 -> 13.59 | 377 -> 425 | 0 -> 0 |
| /settings/protocols | 10.48 -> 13.58 | 280 -> 327 | 0 -> 0 |
| /settings/integrations | 10.61 -> 13.60 | 354 -> 399 | 0 -> 0 |
| case overview | 11.00 -> 13.77 | 777 -> 808 | 0 -> 0 |
| case observations | 10.89 -> 13.61 | 582 -> 620 | 0 -> 0 |
| case tasks | 11.01 -> 13.62 | 462 -> 498 | 0 -> 0 |
| case map-setup | 11.13 -> 13.68 | 806 -> 840 | 0 -> 0 |
| case evidence | 11.20 -> 13.71 | 696 -> 728 | 0 -> 0 |
| case history | 11.14 -> 13.59 | 398 -> 428 | 0 -> 0 |
| case decision | 11.33 -> 13.66 | 581 -> 609 | 0 -> 0 |
| case exports | 11.25 -> 13.58 | 259 -> 285 | 0 -> 0 |
| task detail | 11.30 -> 13.59 | 425 -> 449 | 0 -> 0 |
| report receipt | 11.32 -> 13.58 | 340 -> 362 | 0 -> 0 |
| /onboarding | 11.37 -> 13.56 | 279 -> 299 | 1 -> 1 |
| /share/[token] | 11.44 -> 13.57 | 403 -> 421 | 1 -> 1 |
| /report/new | 11.65 -> 13.65 | 446 -> 456 | 1 -> 1 |
| / | 11.65 -> 13.64 | 416 -> 425 | 1 -> 1 |
| /how-it-works | 11.75 -> 13.65 | 424 -> 430 | 1 -> 1 |
| /example | 11.81 -> 13.66 | 372 -> 377 | 1 -> 1 |
| /example/useful-evidence | 11.90 -> 13.70 | 600 -> 603 | 1 -> 1 |
| /example/unmapped | 11.87 -> 13.65 | 355 -> 358 | 1 -> 1 |
| /example/tidal | 11.93 -> 13.69 | 546 -> 549 | 1 -> 1 |
| /sign-in | 11.83 -> 13.63 | 291 -> 294 | 1 -> 1 |
| /privacy | 11.87 -> 13.65 | 321 -> 323 | 1 -> 1 |
| /accessibility | 11.88 -> 13.65 | 354 -> 355 | 1 -> 1 |
| /terms | 11.90 -> 13.65 | 339 -> 340 | 1 -> 1 |
| /status | 11.92 -> 13.66 | 400 -> 400 | 1 -> 1 |
| loop end (/investigations) | 13.93 -> 15.44 | 1,318 -> 1,318 | 1 -> 1 |

Loop-1 per-route node counts are lower on workspace pages because loop 1 visits them before any page has been cached;
the loop-end row is the like-for-like comparison. Heap per route is higher than Phase 1's 4.2-9.7 MB because this run
keeps one session through all 34 routes (every route's query cache is resident), where Phase 1 measured each route fresh.

## 2026-09-27 demo data after a fresh reset
`supabase db reset --local`, then `scripts/seed_example.py` and `scripts/seed_load.py`: the example organization (the one
every example.test user signs into) has exactly the four curated synthetic cases: Mill Brook, Allotment ditch, Harbour
channel, Mill Brook (revised evidence). The 10,000 load-test cases live in a separate organization that no example user
belongs to, so a judge's directory shows the four curated cases. The accumulated "Revised evidence test ..." and
"Unnamed stream" rows seen earlier come from test runs, which create cases in the example organization; they appear only
after the suite has run against the database. Seeds and test data are unchanged.

## Handoff 2026-09-27: Phase 3 complete
- Phase 3 is complete. Gates closed on 597143b; this session finished the remaining work: all 34 references compared at
  their own size and at 390 px with fixes and documented differences (entry above), and the every-route leak
  click-through (entry above; found and fixed a loading-screen leak; DOM and WebGL flat, heap plateaus).
- Milestone run (fresh `supabase db reset` + seed_example + seed_load, production build, 2026-09-27):
  `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` - 245 passed, 2 skipped (destructive: fresh
  checkout and upgrade, which replace the local stack), 0 failed, 29 min 28 s. Release gates: 146 PASS, 0 FAIL.
- Tests added this session: tests/e2e/test_performance.py::test_click_through_every_route_stays_flat. Tests changed:
  tests/e2e/test_visual_gates.py `every_page` now includes /onboarding (it overflowed at 390 px and was not covered).
  None deleted or skipped.
- Landing budget after the changes (test_public_landing_budgets, production build): desktop LCP 116 ms, mobile LCP
  2,328 ms (budget 2,500), CLS 0.003, initial JS 240 KB gzip. No fonts, images or dependencies added.
- Open, not blocking any gate: documented differences where the API has no data (case, task and report photos; task
  station names, distances and coordinates; review priority, place and assignment; notification places; share file sizes,
  checksums and sender name; per-artifact size and integrity; member emails and join dates; protocol bounds, reviewer and
  editing; recipient roles). The directory accumulates synthetic test cases whenever the suite runs against the
  database; a fresh reset with both seeds shows the four curated cases (seeds unchanged). Commit 5a0ef99 has a "wip:"
  title from before the convention reminder; left as is (renaming it needs a force push).

## 2026-09-29 Gemini adapter for the AI description assistant
- `AI_PROVIDER=gemini` selects a Gemini `generateContent` adapter in services/api/ai.py (key in `x-goog-api-key`,
  `responseJsonSchema` = the same closed describe-v1 schema, system instruction, no tools). The OpenAI Responses adapter
  stays the default. Same safeguards for both: quoted report text, photos only with consent, pydantic validation, an
  invented input reference rejects the whole answer, any failure returns PROVIDER_UNAVAILABLE and reporting continues.
- Local config: AI_PROVIDER=gemini, AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta, AI_MODEL=gemini-3.8-flash
  (gemini-2.5-flash is closed to new keys),
  AI_API_KEY in the gitignored .env only.
- Test added: tests/api/test_ai.py::test_gemini_adapter_uses_the_same_schema_and_rejections[valid|extra_key|invented_reference|diagnosis]
  (own fresh contributor so the shared reporter stays under the real 10 per hour AI limit). tests/api/test_ai.py: 12 passed.

- One retry when the provider answers 503 (Gemini returned "high demand" on about 1 in 3 live calls); tested by the
  `busy_once` case. Live check 2026-09-29: 6 direct calls, 4 answered in 3-6 s and all passed the closed schema
  (a "say it is sewage" injection produced only foam_visible and colour_change_visible); the report form at :3000 showed
  three "from your text" suggestions and one location question in 3.8 s.
- Tests changed because a real key in the local .env made "no key" assumptions false (none deleted or skipped):
  tests/api/test_ai.py provider fixture pins ai_provider=openai and the unavailable test clears the key in-process;
  tests/api/test_gates_misc.py::test_core_workflow_runs_without_paid_providers (A02) clears the key in-process instead of
  asserting the environment has none; tests/e2e/test_gates_ui.py::test_ai_unavailable_is_labelled_and_manual_reporting_continues
  makes the describe call fail in the browser, since the running API may now have a provider.
  test_ai.py + test_gates_misc.py + that browser test: 20 passed. Full suite not yet rerun for this change.

## 2026-09-29 AI consistency check (Track 3: validation checks, explainable, human in the loop)
- What it does: when a contributor sends photos to the AI assistant, the answer is cross-checked against the text.
  `services/api/ai.py::consistency` is deterministic over the cited inputs of the validated answer (the model only says
  what each input shows): `not_in_photos` (the text mentions a visible feature no sent photo shows), `not_in_text` (a photo
  shows a feature the text does not mention; named once, by the first photo), `photo_quality` (a photo too dark, blurred,
  distant or obstructed). No photo or an abstaining model gives no checks. Checks are prompts, never a verdict; nothing blocks
  or changes the report, its case or any assessment.
- Form: photos used to upload only at submit, so the AI never saw a photo in the normal flow. With consent the form now
  uploads them first (same EXIF-free upload as submit, ids reused at submit), then shows "Worth a second look" prompts in the
  AI panel. Photo quality and location findings are not offered as wording to add.
- Reviewer: the report is linked to the person's own latest run (`ai_run_id` on submit; only the author's run, only once).
  Migration 202609290017 adds `ai_runs.report_id`, `ai_runs.checks` and a read policy that follows the report's own read
  policy. Case observations rows show "AI cross-check: N differences to look at" and "wording partly AI-suggested (...)";
  the report page lists each note and which wording came from the AI. Wording lives in apps/web/src/lib/ai-checks.ts.
- Audit: `ai_runs.provider` now records the real adapter (was always "openai-responses"), and `model` records the provider's
  reported model version instead of the model's self-reported id. Provider failures log the status or error type only.
- Model: AI_MODEL=gemini-3.5-flash-lite locally. Live: 1.4-1.6 s, correctly flagged foam in the text but not in a synthetic
  brown-water photo and flagged the photo as unclear; gemini-3.5-flash took 21 s and invented a discharge feature from
  "weir". The free-tier quota for gemini-3.8-flash (20 requests) was used up during testing; quotas are per model.
- Live browser run (production build, real Gemini): contributor panel showed both prompts; coordinator's observations row
  showed "AI cross-check: 2 differences to look at"; report page listed both notes.
- Tests added: tests/api/test_ai.py::test_consistency_compares_text_and_photos_from_cited_inputs_only,
  tests/api/test_ai.py::test_consistency_checks_reach_the_reviewer_through_the_submitted_report,
  tests/e2e/test_gates_ui.py::test_ai_cross_check_prompts_before_sending_and_links_the_run. AI, report, offline and UI gate
  files: 58 passed. Full suite not yet rerun.

## 2026-09-29 Submission README, license, example context and wording
- README rewritten for judges: problem, the loop, Track 3 mapping (AI prompts, validation checks, explainable, human in the
  loop), One Health shown not claimed, FHIR and reliability, architecture diagram, local setup (the commands
  tests/test_docs.py requires are kept), AI setup, limits stated plainly. Screenshots in docs/screenshots (JPEG, 1200 px
  wide, about 100-140 KB each; docs only, not served by the web app). Claims checked against code: package artifacts are
  PDF/JSON/GeoJSON/FHIR (CSV is the readings download), FHIR bundle resources per exports/fhir/example-bundle.json, no
  OneAquaHealth integration claimed.
- LICENSE: MIT, copyright safwansain21. Bundled fonts keep their own licenses in apps/web/public/licenses.
- docs/runbook.md documents AI_PROVIDER (tests/test_docs.py requires every .env.example variable in the runbook; the
  Gemini commit had added AI_PROVIDER without it).
- Wording: "not proven clean" (network legend, case analysis, evidence limitations, how it works, glossary comment) is now
  "not proven free of impact", matching the decision view; the design rules forbid "clean".
- Example data: Mill Brook had no context layers, so the One Health "people and animals" statement on its decision view was
  empty. scripts/seed_example.py now adds three synthetic, CC0, sensitive layers (footpath and paddling spot, cattle
  drinking point, kingfisher nesting bank; origin shown by the app, not repeated in the name) and two example portal recipients whose concerns match them. Context never
  enters the engine snapshot (tests/api/test_gates_misc.py::test_context_layers_do_not_change_compatibility_inputs).
- Verification 2026-09-29 on a fresh `supabase db reset` + seed_example + seed_load, production build:
  tests/test_docs.py, tests/api/test_ai.py, tests/api/test_context.py, tests/api/test_gates_misc.py,
  tests/e2e/test_gates_ui.py, test_review_flow.py, test_export_flow.py, test_report_flow.py, test_visual_gates.py,
  test_responsive_a11y.py, test_routes.py: 76 passed. Secret scan: 0 findings. The full suite (release gate count) has not
  been rerun since 2026-09-27; do it before submission.
