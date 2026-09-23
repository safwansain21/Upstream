# Upstream: working rules

Spec: `docs/specification/` (UPSTREAM-PRD.md, SCIENTIFIC-ENGINE.md, ACCEPTANCE.md). Status: `docs/release-results.md`, `docs/progress.md`.

## Git
- Only commit and push to `build/upstream`. Never push to `main`.
- Commit and push after every working chunk. Sessions can end without warning.
- Commit style: one lowercase imperative line describing the change (e.g. `add optional AI suggestion panel to the report form and record AI gate evidence`).
- Never include "built with Claude Code", "Generated with Claude Code", a Co-Authored-By trailer, or any other tool attribution in commits, pushes, PRs, or repo files.

## Evidence
- After each step, update `docs/release-results.md` via `scripts/update_release_results.py` (edit its PASSES/PARTIAL maps, rerun the full suite, update the pass count in `CMD`, run the script).
- PASS only with the exact command and passing test node IDs as evidence. Partial coverage stays FAIL with a note saying what is missing.
- Update `docs/progress.md` as you go.
- Before every push, reset the local database, apply both example and load seeds, run the full test suite, and confirm the release gate count is at least 131 PASS. Fix UI tests for intentional interface changes; never delete or skip a failing test to preserve the count. Report changed tests and the reason.

## UI asset and performance rules
- Do not put raw PNG or JPEG assets in `apps/web/public`. Export AVIF and WebP variants at actual rendered sizes and serve responsive variants with `next/image`.
- Keep each route's total image transfer under 400 KB. If a design needs more, state the measured cost and the tradeoff before shipping it.
- After any commit that adds images, font weights, animation, or a dependency, rerun `tests/e2e/test_performance.py::test_public_landing_budgets` against a production build and report measured mobile LCP against the 2.5 s budget.
- Never regress a passing release gate. Record the download and performance cost of each added font weight and dependency; add one only when the design needs it.

## Priorities
- Preserve product functionality while completing the current dark UI pass (I01-I14 and I17).
- Done through J12 and H07 (131 PASS). Remaining: the UI pass for I01-I14 and I17. Default basemap is OpenFreeMap (keyless; map browser tests need internet). Keep docs/handoff.md in sync (tests/test_docs.py enforces its open-gate list).

## Local stack (Windows)
- Docker Desktop running; `node_modules/.bin/supabase migration up --local`; `.venv/Scripts/python.exe scripts/seed_example.py` (+ `scripts/seed_load.py` for J03).
- `pnpm` may not be on PATH: build with `npx next build` in `apps/web`, then `powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1` (API :8000, worker, web :3000; logs in `%TEMP%`).
- Full suite: `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` on a freshly reset database (`node_modules/.bin/supabase db reset --local`, then both seeds); accumulated test cases break directory ordering.
