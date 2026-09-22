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
