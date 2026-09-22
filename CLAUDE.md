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

## Priorities
- Functionality over UI polish. Skip the I gates (I01-I14, I17); they are for a later UI pass.
- Remaining order:
  1. Quick stragglers: J02 (browser test for Cancel analysis), J11, A07, B11, F11, A01 (clean-clone check + README steps), J09 (backup and isolated restore).
  2. G10: signed HTTPS webhook outbox per PRD 14 and 15.4 (SSRF checks, DNS revalidation at delivery, no redirects, HMAC, retry schedule 1m/5m/30m/2h/12h, admin retry keeping delivery ID and bytes).
  3. Offline leftovers: D12, H04, H06, H07, H10, H11 (skip if short on time; mark honestly).
  4. J12 last: final handoff report reflecting the true final state.

## Local stack (Windows)
- Docker Desktop running; `node_modules/.bin/supabase migration up --local`; `.venv/Scripts/python.exe scripts/seed_example.py` (+ `scripts/seed_load.py` for J03).
- `pnpm` may not be on PATH: build with `npx next build` in `apps/web`, then `powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1` (API :8000, worker, web :3000; logs in `%TEMP%`).
- Full suite: `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` on a freshly reset database (`node_modules/.bin/supabase db reset --local`, then both seeds); accumulated test cases break directory ordering.
