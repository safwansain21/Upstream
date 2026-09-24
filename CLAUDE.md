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
- Current work: dark-theme UI rebuild from the handoff at `C:/Users/safwa/OneDrive/Documents/Hackathon Builds/UpstreamInstructions/NewUI/Upstream-Dark-Handoff` (start with `CODEX_START_HERE.md`; 34 references in `gallery.html`). It supersedes the old orange/ice-blue visual brief. Preserve all functionality; never change backend or scientific behavior to match a picture.
- Preserve product functionality while completing the dark UI pass (I01-I14 and I17). J12 and H07 were complete before the rebuild; the baseline was 131 PASS. Default basemap is OpenFreeMap (keyless; map browser tests need internet). Keep docs/handoff.md in sync (tests/test_docs.py enforces its open-gate list).

## Design integrity (UI rebuild)
- The 34 references are a complete, deliberate design; additions must look as if they were always there. Integrate each addition into its page while building that page, never as a later pass.
- Use the design's own language (typography, palette, curves, spacing, motion, composition). No generic additions: no info-icon clutter, banner strips, extra callout boxes, badge piles, default tooltips or filler cards.
- If an addition has no natural home, find the designer's form (a typographic treatment, a line in an existing panel, a state of an existing element). If it cannot be integrated without compromise, describe the conflict in docs/progress.md instead of shipping it.
- Required additions: One Health connection shown not claimed (landing narrative; decision view keeps environmental observations / potential exposure and access for people and animals / no health outcome established distinct); plain language for contributor screens and one quiet in-context explanation treatment for technical terms (station, reach, background range, SC25, ruled out, retained, readiness, network version); readiness items say what is missing and which role fixes it; case page shows ruled-out vs retained stretches, the reading that ruled a stretch out and why (engine data only), the planner's next station with a plain reason, and the M-13 evidence timeline with a static explanation; role-specific empty states; reusable components and tokens.
- Never use "polluter", "safe" or "clean". Ruled out = incompatible under stated assumptions; retained = worth checking. Missing API data is listed in docs/progress.md, never faked.

## Local stack (Windows)
- Docker Desktop running; `node_modules/.bin/supabase migration up --local`; `.venv/Scripts/python.exe scripts/seed_example.py` (+ `scripts/seed_load.py` for J03).
- `pnpm` may not be on PATH: build with `npx next build` in `apps/web`, then `powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1` (API :8000, worker, web :3000; logs in `%TEMP%`).
- Full suite: `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` on a freshly reset database (`node_modules/.bin/supabase db reset --local`, then both seeds); accumulated test cases break directory ordering.
