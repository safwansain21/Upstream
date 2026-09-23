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
- Current work: dark-theme UI rebuild from the handoff at `C:/Users/safwa/OneDrive/Documents/Hackathon Builds/UpstreamInstructions/NewUI/Upstream-Dark-Handoff` (start with `CODEX_START_HERE.md`; 34 references in `gallery.html`). It supersedes the old orange/ice-blue visual brief. Preserve all functionality; never change backend or scientific behavior to match a picture.
- Gates: 131 PASS before the rebuild. Default basemap is OpenFreeMap (keyless; map browser tests need internet). Keep docs/handoff.md in sync (tests/test_docs.py enforces its open-gate list).

## Assets and performance (standing rules)
- No raw PNG or JPEG in `apps/web/public`. Ship AVIF with WebP fallback, sized to what is actually rendered, through `next/image`.
- Keep the total image weight of any route under 400 KB. If a design needs more, say so and propose the tradeoff instead of shipping it.
- After any commit that adds images, fonts, animation or a new dependency, re-run the J01 performance test (`tests/e2e/test_performance.py::test_public_landing_budgets`) and report the measured LCP against the 2.5 s budget.
- Each new font weight and each new dependency costs load time: add only when the design needs it, and state what it cost.
- Never let a passing gate regress. Before each push, run the full suite on a fresh database and confirm the pass count has not dropped. If a UI change breaks a test, fix the test to match the new interface (never delete or skip it) and say which tests changed and why.

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
