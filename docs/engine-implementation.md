# Scientific engine implementation checkpoint

2026-09-21 — work in progress; not yet verified complete.

## Public API

Python import path: `packages/engine`. `from upstream_engine import Snapshot, Reading, Interval, Network, Reach, Station, Action, assess, plan, classify_network, canonical_hash`.

`assess(snapshot, timeout_ms=2000, job_timeout_ms=30000, resource_limit=None)` returns `AssessmentResult`. Result includes eligibility/reasons, class statuses (`compatible`, `incompatible`, `unresolved`), retained geometry IDs and `retained_length_m` exact string, raw solver status, exact SMT2 problem, exact witness strings, problem hash, dependency versions, assumptions, open-boundary flag. Only reviewed eligible UNSAT classes are removed. UNKNOWN/resource failures remain retained. Readiness missing leaves mathematical results inspectable but prevents exclusions. Solver caps: 10s/class, 120s/job.

`plan(snapshot, action, timeout_ms=5000, resource_limit=None, assessment=None)` returns `PlanResult`: `conservative_bound_m` exact string or null when unavailable, `completed`, reason, tested subset count. All products reuse inference model through four McCormick inequalities with exact Fraction bounds. Descending weighted common-outcome subset feasibility uses QF_LRA; each class has independent hidden variables and common future outcome variables. Unresolved subsets conservatively retain weight. More than 16 classes returns unscored total instead of truncating. `witness_oracle` gives a sampled exact-SAT lower bound. `rank_actions` implements 100m/cost/reading-count/ID ties.

Inputs are strict extra-forbidden Pydantic v2 models in `contracts.py`. Scientific quantities use finite decimal strings. `Interval` requires lower, upper, unit, method, source, validity_scope, data_origin, reviewer. Snapshot fields: network, readings, backgrounds, instruments (optional tuple), waters (optional tuple), load, episode, protocol_version, readiness, dependencies (string version map), data_origin, bound_mode. No context/AI/truth fields. All units are explicit ASCII canonical units: `uS/cm`, `degC`, `m3/s`, `1`, `1/degC`, `(uS/cm)*(m3/s)`.

Network stations reference nodes; `split_reach` inserts station nodes without dropping length and makes the changed network unreviewed. Directed splits, cycles, tidal edges, unreviewed connectivity/mixing/stations, and unknown boundary treatment block localization. Reach geometry IDs are preserved in class membership. Open boundaries prevent finite whole-source planner claims.

Raw readings require temperature, calibration ref, noise, temperature_noise, visit_effect, water_group. Shared gain/offset/temp bias use calibration scope; visit uses visit ID; residual uses station/epoch; water alpha defaults independent unless evidence supports sharing. Direct enclosures cannot also apply included instrument errors. Undocumented meter SC25 stays history-only. `Background` defaults full empirical range residual and zero credited shared drift; joint drift/residual needs evidence.

## Current verification and remaining work

The first scientific test run was RED: 11 expected failures for absent modules/fixtures. `.venv` now has required pinned dependencies. Use `.venv/Scripts/python.exe -m pytest tests/engine -q -p no:cacheprovider`.

Written: strict contracts, graph/signatures, canonical snapshot serialization, independent Fraction oracle, exact/relaxed expression graph, readiness, solver, conservative planner. Not yet GREEN. `fixtures/networks.py` still being written; currently imports from scientific tests will fail. Next implement synthetic fixture constructors `network1`, `network2`, `unsupported_networks`, `network1_snapshot(branch=None|'high'|'low')`, `b2_action(uncertainty='5')`, `interval`.

Next: run canonical tests and fix real failures; add raw-compensation/sharing regression fixtures, Hypothesis generated-truth retention/monotonicity/McCormick/oracle tests; implement background propagation, chronology/Wilson evaluation, paired exogenous scenario evaluation, precision bracket diagnostics and benchmark evidence. Verify strict decimal canonicalization does not round long decimals. Remove temporary test_bootstrap.py once substantive tests run. Validate duplicate and irrelevant reading scopes. Explanations currently list full named constraint dependencies, not deletion-minimized conflicts. No independent proof certificate is claimed.

Parent owns pyproject/dependencies, API, database, web, integration and release ledger. Engine agent owns only packages/engine, fixtures, tests/engine and this document. Do not claim E01–E27/J05–J07 passed until commands actually run. All example bounds must remain synthetic; no live protocol auto-seeding.
