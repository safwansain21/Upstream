# Upstream: working rules

Spec: `docs/specification/` (UPSTREAM-PRD.md, SCIENTIFIC-ENGINE.md, ACCEPTANCE.md). Status: `docs/release-results.md`, `docs/progress.md`.

## Git
- Only commit and push to `build/upstream`. Never push to `main`.
- Commit and push after every working chunk. Sessions can end without warning.
- Commit style: one lowercase imperative line describing the change (e.g. `add optional AI suggestion panel to the report form and record AI gate evidence`). No Co-Authored-By trailer or tool attribution anywhere in the repo.

## Evidence
- After each step, update `docs/release-results.md` via `scripts/update_release_results.py` (edit its PASSES/PARTIAL maps, rerun the full suite, update the pass count in `CMD`, run the script).
- PASS only with the exact command and passing test node IDs as evidence. Partial coverage stays FAIL with a note saying what is missing.
- Update `docs/progress.md` as you go.

## Priorities
- Functionality over UI polish. Leave the I gates for a later UI pass.
- Remaining order: J05, J07 → A01, A07, B11, F11, G04, G10, G11, J01, J02, J03, J09, J11, J12 → offline leftovers D12, H04, H06, H07, H10, H11 (skip if short on time; mark honestly).

## Local stack (Windows)
- Docker Desktop running; `node_modules/.bin/supabase migration up --local`; `.venv/Scripts/python.exe scripts/seed_example.py` (+ `scripts/seed_load.py` for J03).
- `pnpm` may not be on PATH: build with `npx next build` in `apps/web`, then `powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1` (API :8000, worker, web :3000; logs in `%TEMP%`).
- Full suite: `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` on a freshly reset database (`node_modules/.bin/supabase db reset --local`, then both seeds); accumulated test cases break directory ordering.
