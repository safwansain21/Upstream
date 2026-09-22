# Policy evaluation (J05, J07)

Synthetic experiment on canonical Network 1, produced by `fixtures/evaluation.py`, 2026-09-22:

```
PYTHONPATH=".;packages/engine" .venv/Scripts/python.exe -m fixtures.evaluation 60
```

These numbers describe this experiment only. They are not field performance, and no real events were used.

## Design

- **Simulator and engine are separate.** The simulator (`fixtures/evaluation.py`) knows the true source reach, load (10-40 (uS/cm)*(m3/s)), backgrounds, discharges and noise. It turns them into ordinary true-SC25 enclosure readings (+/-5 uS/cm). The engine gets only the documented snapshot, and snapshots with extra truth fields are rejected (`test_engine_never_receives_truth`).
- **Paired exogenous values.** Each value is a hash of (seed, episode, station, visit, kind), not a draw from a shared random stream. Every policy therefore gets the identical reading at a station, whatever order it visits in.
- **Same inference, eligibility and stopping for every policy.** All policies run through `run_episode`: two outlet anchor readings, then at most 3 visits. An episode stops when one class is left, the assessment is ineligible, or no stations remain. Only the choice of the next station differs.
- **Policies:**
  - `planner`: the conservative worst-case bound plus `rank_actions`.
  - `outlet_first`: a fixed upstream route (C, A3, B3, ...).
  - `random`: a paired hash order.
- **Scenarios:**
  - `nominal`: all truth lies inside the protocol bounds.
  - `biased_background`: the true B2 background is 30 uS/cm above its protocol upper bound. This misspecification is deliberate.

## Results (60 episodes per scenario)

| Scenario | Policy | Contained (incl. unresolved) | 95% Wilson | Exact compatible | Incorrect exclusions | Unresolved episodes | Model conflicts | Mean retained m | Visits | Readings | Volunteer min |
|---|---|---|---|---|---|---|---|---|---|---|---|
| nominal | planner | 60/60 | 0.94-1.00 | 60 | 0 | 0 | 0 | 2637 | 174 | 294 | 4350 |
| nominal | outlet_first | 60/60 | 0.94-1.00 | 60 | 0 | 0 | 0 | 2940 | 172 | 292 | 4300 |
| nominal | random | 60/60 | 0.94-1.00 | 60 | 0 | 0 | 0 | 3712 | 173 | 293 | 4325 |
| biased_background | planner | 50/60 | 0.72-0.91 | 50 | 10 | 0 | 8 | 2333 | 166 | 286 | 4150 |
| biased_background | outlet_first | 60/60 | 0.94-1.00 | 60 | 0 | 0 | 0 | 2940 | 172 | 292 | 4300 |
| biased_background | random | 48/60 | 0.68-0.88 | 48 | 12 | 0 | 8 | 3018 | 169 | 289 | 4225 |

"Contained" means the true source class is not excluded; this includes unresolved classes. "Exact compatible" means the solver returned SAT for the true class. The Wilson interval is the 95% score interval for the containment rate over the episodes in this experiment. Volunteer time is 25 synthetic minutes per visit.

## Reading the results

- **Nominal:** no policy wrongly excluded the source, which is what exact inference guarantees when every bound holds. The planner kept the least channel (mean 2637 m, against 2940 m for the fixed route and 3712 m for random) with the same effort.
- **Biased background:** effort must be read together with errors. The planner and random policies visited B2 and then wrongly excluded the true source in 10 and 12 of 60 episodes. In 8 episodes each, the model flagged a conflict. The planner's lower retained length in this scenario is partly the result of stopping wrong. The fixed route never visits B2 within 3 visits, so it avoided the biased bound by luck, not by design.
- **Model conflict is not a reliable alarm.** It caught some misspecified episodes, not all of them. Detection is never universal.
- **Sample size:** 60 episodes is a pilot size, chosen to keep the run time short. It does not validate anything.
