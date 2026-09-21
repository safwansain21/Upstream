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
