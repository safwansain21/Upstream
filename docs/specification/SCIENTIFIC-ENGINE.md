# Upstream — scientific engine and readiness contract
Version 1.0 · Mandatory companion to UPSTREAM-PRD.md

## 1. Authority and scope

Implement this contract, not earlier conversational pseudocode. The default scientific claim is conditional compatibility with a single nonnegative effective-conductance input in a reviewed, directed, non-tidal local stream network during a comparable sustained event. It is not pollutant identification, laboratory chemistry, source responsibility, water safety, or empirical validation.

The exact solver below replaces the earlier proposed hand-written Fourier–Motzkin/nonlinear branch-and-bound implementation. It makes the measurement equation explicit and uses a maintained exact-real-arithmetic solver. The conservative planner below replaces informal interval-overlap/corner rules. No unproved convexity or Helly shortcut is required.

A full implementation must include exact status semantics, a conservative planner, independent simple-case arithmetic, uncertainty propagation, dependency versioning, and failure behavior. Software cannot establish site-specific bounds without evidence.

## 2. Inputs and validation

All numeric scientific inputs are base-10 strings parsed to Decimal/Fraction; serialize exact rational constants into the solver. No binary floating-point epsilon decides compatibility. Floating-point is permitted for map projection, display and approximate visualization only.

Every interval includes lower, upper, unit, method, source, validity scope, data_origin and reviewer. Require lower ≤ upper and finite endpoints where a bounded algorithm needs them. A missing value is null/unknown, never 0. Actual timestamps retain timezone and measured/received distinction.

Required per accepted reading:
- stable reading ID/version; station; visit; instrument and calibration interval; contributor pseudonym;
- raw conductivity x in µS/cm and measured temperature t in °C, OR explicitly declared meter-SC25 mode;
- raw noise bound and instrument offset/gain bounds, with their accounting convention;
- temperature bias/random bounds; nominal compensation settings if meter output used;
- water-condition coefficient interval and sharing scope, if compensation applies;
- time/flow/episode/comparability metadata; QC/inclusion decision;
- origin real/synthetic/replayed; file and protocol references.

Do not double count manufacturer total accuracy and its already included constituent errors. Either use the complete declared bound or a justified decomposition into offset/gain/noise; record which. Bounds from display resolution include quantization as specified by the instrument protocol.

Meter-SC25-only records are not automatically eligible. If the compensation algorithm is documented and invertible, reconstruct a raw interval including display rounding. If a reliable true-SC25 enclosure has been established directly, use that explicit mode. Otherwise retain the record for history and request missing metadata; no assumed 2% coefficient.

Validation rejects negative conductance, nonpositive discharge or gain, invalid units, an uncompensated value silently labelled SC25, impossible interval order, or a compensation denominator that can be nonpositive. A scientifically unusual but physically possible input may require review rather than forced rejection.

## 3. Graph and mapping

The source-location unit is a reach between meaningful nodes/stations. Store directed edges, stations on edges, confluences, boundary inflows, verified flow direction, access information and source provenance.

Relations between source reach and station: downstream_connected, upstream_connected, separate_branch, boundary_or_colocated, unknown. Only the first predicts a positive increment under this model. Unknown is never treated as separate_branch.

Split an edge at a station before computing signatures. A point source exactly at a station belongs to the immediately upstream reach by the fixture convention; real colocated outfall/station ambiguity must be recorded and can block that local comparison.

Under this steady source-independent transport model, group reaches with identical downstream-station signatures into **topological identifiability classes**. Retain each member segment's geometry; total class length is the sum of disjoint members. The floor is relative to the currently approved station inventory and model, not a universal claim that no conceivable experiment can distinguish the locations. New stations or a different validated transient model can change it.

Unknown upstream inflow is an explicit boundary-source alternative. Do not claim a complete source area inside the map while an outside-domain source remains possible. Display "X km within the mapped domain; upstream extent unresolved". Such a class has an open-ended extent flag; do not score it as zero kilometres or count it as conclusively localized. The primary fixture closes this issue using an explicit synthetic boundary assumption, not a production default.

Supported v1 topology: directed acyclic converging network, no bidirectional/tidal edges, no split-and-rejoin pathways affecting the modeled domain. A cycle, ambiguous connection, missing potentially relevant tributary, undocumented diversion or unsupported mixing regime blocks quantitative localization. The case/report/task workflow remains available.

Length is geometric channel length, not straight-line distance or number of database rows. Preserve length under row subdivision. A new network version invalidates dependent classes/assessments.

## 4. Case readiness and event comparability

A report opens a case immediately. A coordinator can triage, request location/access evidence and escalate without any measurement model.

Localization readiness requires:
1. A reviewed local network/domain, supported flow regime and explicit boundary treatment.
2. Approved station positions and source/station relations.
3. Accepted measurements with calibrated uncertainty bounds and supported compensation.
4. Background intervals applicable to the station/flow/temperature/time conditions.
5. Applicable discharge intervals and mixing assumption at measurement stations.
6. An anchor compatible with a sustained event, reviewed persistence assumption and comparability grouping.
7. At least one scientifically supported candidate configuration; otherwise report conflict rather than choose the last row.
8. Protocol/task prerequisites sufficient for proposed new readings.

Operational trigger merely opens review. It is not a likelihood, healthy threshold or exclusion rule. An anchor requires at least two appropriately spaced readings and review of the persistence evidence. Agreement is "consistent with a sustained signal", not proof of plateau.

For two stations to share one event load, the protocol must support persistence across measurement times plus the maximum relevant travel time. Compute travel interval from all relevant path lengths and velocity bounds; record path uncertainty. Two nearby timestamps cannot establish it. Unknown transport/persistence means comparability pending. Continuous anchor logging can support the assumption but never removes the need to document it.

Partition evidence into comparable episodes. One assessment constrains one episode load. Do not force unrelated episodes to share a load. If an anchor is removed, preserve the mathematical compatibility result for inspection but suspend localization eligibility and recommendations until re-established.

## 5. Background and uncertainty

### 5.1 Default bound mode

Decision-changing intervals are protocol bounds with declared provenance. Worst-case components are added conservatively unless a justified shared-variable model represents them. Repeating a reading does not shrink a hard error bound by sqrt(n). A visit effect is shared among that visit's replicates; calibration effects are shared over the instrument's calibration interval.

Coverage/standard-uncertainty calculations may be displayed as a separate experimental report, but do not drive production exclusions in v1. Never infer a probability of correctness from k=3. Reconsidering this default requires a new reviewed protocol and evaluation, not a UI toggle.

### 5.2 Constructing background enclosures

A background model is a domain-conditioned empirical description, not a seasonal baseline from one month. The default label is:
"Empirical background range. Future-observation coverage has not been established for this site and protocol."

Construct the background in true-SC25 enclosure coordinates. For each historical sample, propagate its raw measurement, temperature, compensation, gain, offset and repeatability bounds through the same measurement equations. Independent interval arithmetic can conservatively enclose each sample; all divisors must be positive. The range spanning these enclosures forms the empirical background interval. Record chronology, original samples, conditions and transformation assumptions.

For a simple background interval [b_lo,b_hi], set m=(b_lo+b_hi)/2, E=(b_hi-b_lo)/2 and shared drift D=0. This does NOT assert the environment has zero drift; it assigns the full observed background uncertainty to a station residual without unearned cross-station cancellation.

If paired background studies justify a shared drift model, record the joint domain and use D/E decomposition from that study. Do not reduce E merely because a user wants pairs to be informative. No automatic sharing by nearby temperature, same nominal coefficient, same brand of meter, or similar timestamps.

Chronological held-out evaluation: freeze model using records before cutoff; evaluate later independent events within scope; report count contained/total and a Wilson interval with method. No automatic upgrade to validated from low autocorrelation. Display observed performance, not a universal guarantee.

### 5.3 Compensation sharing

Default: independent coefficient variable per reading/water-condition group, with an appropriate conservative mixture interval. Shared coefficients require independently documented conditions supporting that equality. A downstream mixture is not automatically identical in composition to the background or source.

The v1 default background enclosure loses some potential calibration/compensation cancellation between historical and event readings. This is an explicit conservative relaxation. Do not restore that cancellation unless a separately specified validated joint historical-sample model is implemented. The application must work and honestly retain more area under the conservative default.

A shared scale does not automatically cancel against arbitrary fixed external load bounds. Any invariance test must scale all affected quantities/bounds consistently or establish that the unscaled bounds are inactive.

## 6. Explicit measurement and transport equations

For hypothesis h and reading r at station s, define:
- L ≥ 0: episode-level effective conductance load, units (µS/cm)·(m³/s).
- q_r > 0: discharge for this observation in its interval.
- a_hs ∈ {0,1}: fixed reviewed downstream connectivity.
- d_e: shared environmental drift in an approved epoch/group, bounded ±D.
- e_se: station residual, shared by readings at station s in epoch e, bounded ±E_s.
- B_se = m_s + d_e + e_se ≥ 0: true background conductance.
- z_r ≥ 0: event increment; if a_hs=0 set z_r=0; otherwise q_r*z_r=L.
- C_r=B_se+z_r: true SC25.
- g_i>0 and o_i: gain and raw-conductivity offset shared per instrument/calibration interval.
- v_k: raw-conductivity visit effect shared by replicates in visit k.
- n_r: per-reading raw noise within its documented bound.
- t_r*=t_observed + temperature_bias_i + temperature_noise_r.
- alpha_w: temperature coefficient for the approved water-condition group.
- f_r=1+alpha_w*(t_r*−25), constrained positive.
- x_r = g_i*C_r*f_r + o_i + v_k + n_r.

All terms have documented units. A fixed known quantity is represented as a point interval. Raw numeric observations x_r are fixed constants in assessment mode. For a future planner action they become hypothetical outcome variables y_r.

For direct true-SC25-enclosure mode, replace the raw instrument equation with C_r ∈ [c_lo,c_hi]. Do not also add already included raw-instrument errors. Sharing absent from this enclosure is not credited.

The transport approximation assumes conductance increments are additive under full mixing and a steady effective load. Conductance is not conserved solute mass in general. Discharge is independent per observation in v1: a declared outer relaxation of a more constrained hydrological model. Do not describe L as pollutant mass or transfer it across sites as a chemical fingerprint.

Protocol L_min defaults to 0. L_max can be a justified finite protocol bound or a conservative upper bound derived from the accepted anchor and all applicable uncertainties. If no finite justified bound can be obtained, prediction requiring finite outcomes is unavailable. Never impose an arbitrary cap merely to obtain a narrow result.

Temperature/coefficients, gain, offset, background, discharge and load have finite justified bounds before the bounded planner runs. The UI can explain missing requirements without accepting invented defaults.

## 7. Exact compatibility engine

### 7.1 Implementation

Use a pinned Python Z3 real-arithmetic solver with rational constants, using a supported QF_NRA/nonlinear-real tactic for the explicit polynomial constraints above. Positive denominators are eliminated through products as above, not divided symbolically without domain constraints.

SAT → compatible, retain class. Store exact witness representation (which may contain algebraic values), canonical problem hash and solver version. Human display may round a witness but that is not the calculation.

UNSAT → incompatible under stated model/bounds; remove only for the reviewed eligible assessment. Preserve exact problem, inputs, solver result and explanation dependencies. Do not advertise a independently verified proof certificate unless one is actually generated and verified.

UNKNOWN/timeout/resource failure → unresolved, retain class, explicit reason. No fallback to floating-point infeasibility, last-candidate guessing, probability ranking or threshold elimination.

Per-class default wall budget 2 seconds and assessment budget 30 seconds; configurable server caps 10 seconds/class and 120 seconds/job. Deterministic resource limits and pinned solver settings used in tests. Limits affect completeness, not the soundness requirement. Cache exact input hashes. Cancellation retains last completed assessment with its timestamp, never a half-published map.

Before nonlinear solve, optional rational linear outer-relaxation UNSAT may establish incompatibility; a SAT relaxation alone cannot establish exact compatibility. Keep these distinct in logs.

### 7.2 Explanations

Build explanations from named constraints and dependency records. Example:
"Under protocol 2, this reach cannot produce the downstream reading while remaining compatible with A3's reading."
Include reading IDs/versions and bounds with "Why?" expansion. A simplified conflicting constraint subset may be obtained by deletion tests; it must reproduce UNSAT. Never claim the subset is unique or minimum unless proven.

No compatible class means evidence and model do not fit. List possible explanations neutrally: transient event, several inputs, unsuitable background, instrument problem, incorrect mapping, missing source alternative. No diagnosis of the failure cause.

Retained_length includes compatible AND unresolved class members once each. A no-compatible-but-unresolved result is not a model contradiction. Distinguish "no modeled fit found; computation incomplete" from all classes proven incompatible.

## 8. Planner

### 8.1 Objective and eligibility

Evaluate action candidates that are actually available: approved station, qualified participant, suitable verified instrument, permissible access, timing/comparability, supported background and transport.

Actions: one protocol visit (with its required replicates), repeat visit, coordinated pair of visits. Repeats retain shared systematic bounds. Pairs use the same equations and shared-variable structure as inference; no covariance gain invented in the planner. Pair operational value can exist without source-discrimination gain.

Rank by a conservative upper bound on the worst-case **model-compatible retained channel length** across all model-permitted outcomes, including ambiguous outcomes. Never optimize only "decisive" outcomes or count database rows. For open-ended boundary alternatives, show outside-domain unresolved and rank topology/readiness tasks separately; no finite whole-source-area guarantee.

If scores are within 100m, break ties by actual assigned participant travel+task time when known, then fewer total readings, then stable station/action ID. Unknown travel is not zero and excludes the action from a cost-based tie win against otherwise equal known-cost options. No probability of ambiguity without a probability model.

### 8.2 Conservative convex outcome model

For each retained h, take the exact constraint graph including existing evidence and hypothetical new outcome vector y. Introduce auxiliaries for nonlinear products and replace each product w=x*z over finite bounds [lx,ux],[lz,uz] with all four McCormick inequalities:
w ≥ lx*z + lz*x − lx*lz
w ≥ ux*z + uz*x − ux*uz
w ≤ ux*z + lz*x − ux*lz
w ≤ lx*z + uz*x − lx*uz

Compute intermediate bounds with outward exact rational interval arithmetic; recursively introduce products of more than two factors. Preserve affine equalities, positivity, variable sharing and all bounds. The resulting rational polyhedron is an **outer relaxation**, not the exact nonlinear prediction. Its projection into y contains every exact feasible outcome. A SAT relaxation can be spurious and must not be called a feasible physical witness.

A unit test must show each generated exact configuration satisfies the relaxation. Missing finite bounds prevent this planner mode rather than inventing caps.

### 8.3 Worst-case subset search, no corner shortcut

For a subset S of retained classes, test whether one common y is consistent with every class's relaxed constraints. Each class has its own copy of hidden parameters; only the future observed y is shared. This represents alternative explanations of the same observations, not several simultaneous physical sources.

Use exact rational linear feasibility. Enumerate subsets in descending sum of class lengths for ≤16 classes. A SAT highest-weight subset, after all heavier subsets are proven UNSAT, gives the relaxed worst-case length. If any heavier test is unresolved, its weight remains an upper bound. At budget expiration return the largest weight not proven impossible; default to total retained length if no tighter bound was established.

Default 5 seconds/action, maximum 30 seconds/action; whole planner job 120 seconds default, 300 seconds max. For >16 classes, bounded branch-and-bound with the same upper-bound invariant is permitted; exhaustion returns conservative unscored/total-length result. Do not truncate candidates until a nicer number appears.

The score is exact only for the declared relaxed model when search completes. It is an upper bound on the physical model's worst-case feasible length. Its user label is "Conservative model bound", not guaranteed success of a field task. Future solver-limit retention may be greater; the app must say no narrowing result is available if the later inference remains unresolved. It must never remove unresolved classes to honor a prediction.

The action's task purpose includes this limitation. A zero guaranteed reduction is a legitimate result. An expert can still request evidence for verification or operational reasons; label that basis.

### 8.4 Oracle and precision diagnostics

Independent planner oracle samples candidate outcome vectors and uses exact SAT witnesses per class. Sum only classes proven SAT at that outcome; UNKNOWN must not increase the oracle lower bound. Grid maximum is a lower bound, never a validated probability. Assert lower bound ≤ planner upper bound.

Precision diagnostics may vary one justified bound while holding other inputs/sharing fixed and recompute the planner. Use bisection to a specified tolerance and return a **bracket**, not an exact decimal threshold. If search or solver limits prevent bracketing, say unavailable. Do not recommend extra replicates for a systematic compensation error.

Stop/reason dimensions: structural station-resolution limit; no guaranteed one-step reduction; measurement precision limited; background characterization needed; mapping incomplete; unsupported flow model; operationally blocked; budget reached; comparability lost; computation limit. Inspection recommendation is a separate expert decision that can coexist with any reason.

## 9. Canonical fixtures and independent arithmetic

### 9.1 Network 1

| Reach | km | Downstream stations |
|---|---:|---|
| A headwater→A1 | 1.20 | A1,A2,A3,C,O |
| A1→A2 | .90 | A2,A3,C,O |
| A2→A3 | 1.10 | A3,C,O |
| A3→junction | .05 | C,O |
| B headwater→B1 | 1.50 | B1,B2,B3,C,O |
| B1→B2 | .80 | B2,B3,C,O |
| B2→B3 | 1.00 | B3,C,O |
| B3→junction | .05 | C,O |
| junction→C | .50 | C,O |
| C→O | 1.40 | O |

Total 8.50km; eight classes; three confluence segments form .60km class. Fixture source domain is explicitly closed; a separate boundary-inflow fixture tests open extent.

Nominal station discharges A1 .06, A2 .08, A3 .10, B1 .10, B2 .14, B3 .18, C .28, O .32 m³/s, each ±15% in the simple fixture. Velocity [.15,.45]m/s is a synthetic assumption. These are not real measurements.

Use direct true-SC25-enclosure mode for the **independent arithmetic test only**, zero shared drift/offset, known measurement-unit transformation and background A3 [395,445], O [440,480], B2 [405,455]. Protocol L range [0,100]. Anchor O=520±5. Exact:
L ∈ [.272*(515−480), .368*(525−440)] = [9.52,31.28].
A3=440±5 gives A-side L_hi=.115*(445−395)=5.75, so the three upper A classes are incompatible. Retained length 5.30km.
Without an anchor, L=0 through 5.75 remains possible for those A classes; A3 alone does not exclude them.
B2=600±5 yields [16.66,32.20], intersecting anchor; non-downstream B2 hypotheses cannot explain the reading. Retained upper B length 2.30km.
B2=452±5 yields L_hi=.161*(457−405)=8.372, incompatible with anchored 9.52 for upper B classes. Retained length 3.00km.
Removing the B2=600 reading restores 5.30km; adding a valid replacement can restore 2.30km.
These two B2 examples are alternative episodes/branches of a fixture, not simultaneous accepted observations.

Under this simple independent-interval fixture, minimum B2 increment=9.52/.161≈59.13043478. A width-50 background and future symmetric uncertainty U separate only when 2U<59.13043478−50. Threshold is 105/23≈4.56521739; equality is ambiguous. This is not a universal instrument recommendation. At U=5, ambiguous outcomes preserve all 5.30km.

Compensation regression: nominal alpha=.020, T=15, nominal difference 440−420=20. Shared true alpha in [.018,.022] gives difference [20*.8/.82,20*.8/.78]=[19.51219512…,20.51282051…]. Independent event/background scales must be treated independently and may retain classes. Do not paste earlier 3.4602 or .0017329 thresholds into UI; the full inputs/model supporting them differ and are not normative here.

### 9.2 Network 2

Deeper converging synthetic topology, lengths km:
Phead→P1 .4; P1→P2 .6; P2→J1 .1; Qhead→Q1 .7; Q1→J1 .1; J1→R1 .2; R1→J2 .8; Shead→S1 .9; S1→J2 .1; J2→T1 .3; T1→O .8.
Stations P1,P2,Q1,R1,S1,T1,O. Total 5.0km. P2→J1/Q1→J1/J1→R1 merge by signature (.4km); R1→J2/S1→J2/J2→T1 merge (1.2km). Verify signatures programmatically; no handwritten class IDs in algorithm.

### 9.3 Network 3

Two variants: directed split into two branches that rejoin, and a bidirectional tidal edge. Import succeeds as a proposed map; localization applicability is unsupported. Reports, access tasks, measurements and expert review still work. Do not force a tree by deleting offending edges.

### 9.4 Synthetic generator boundary

Simulator may know true source, load, discharge, background, bias, onset and duration. Production engine receives only documented input snapshot. Separate packages/types, no imports from simulator into engine. Tests assert truth fields are rejected at API boundary. Scenario controls create real synthetic records and recompute; they do not feed desired results into the engine.

## 10. Required scientific verification

Property tests over generated supported graphs and bounded configurations:
- An in-bounds generated truth is never classified incompatible; SAT or unresolved both retain it.
- Relaxing any bound cannot turn a previously feasible exact model infeasible.
- Removing evidence cannot remove a feasible class; eligibility changes are tested separately.
- Reordering/deduplicating immutable reading versions does not change exact semantics.
- Reach subdivision preserves signatures, total length and planner ranking with deterministic ties.
- Unknown connectivity never predicts zero by convenience.
- A shared calibration/visit error is one variable at its declared scope.
- Background/reading independent compensation never gains unjustified cancellation.
- Exact witnesses satisfy original equations; approximate printouts are not used as verification.
- Every exact configuration satisfies the planner relaxation.
- Planner bound is never below the witness-based oracle.
- Time/resource limits cannot cause exclusions or increase a claimed narrowing guarantee.
- Context layers do not change compatibility.
- A changed relevant dependency invalidates analysis publication/approval.
- Source boundary uncertainty is never converted into a finite whole-source extent.
- Network 1/2/3 and all simple arithmetic above pass an independent Fraction implementation.
- Multi-source, transient, biased and misconnected scenarios can fail to identify a violation; report that limitation honestly, never claim universal detection.

Report evaluation by scenario and independent event. Inference and selection experiments are separate. All selection policies share the same engine, eligibility and stopping logic. Use paired exogenous event/noise processes indexed by episode/station/time/visit rather than draw-order-dependent random streams. Report containment including unresolved, exact compatible containment, incorrect exclusions, retained length, unresolved frequency, task/reading counts and volunteer time. Do not make a stopped-wrong policy look efficient.

Confidence intervals/sample sizes describe the experiment, not environmental truth. Pilot to choose episode counts and precision; no "4,600 proves validity". No field-performance claims without independently characterized real events.

## 11. Dependency and reproducibility output

Every assessment snapshot includes network/stations, all reading versions and QC decisions, calibration, instrument spec, background/transport/water groups, protocol, context-routing snapshot (separate from scientific inputs), engine/planner build, solver version, bound mode and origin.

Canonical hash uses sorted explicit IDs/versions and canonical decimal strings; retain serialized bytes. Context-only changes trigger decision/routing refresh, not changed compatibility. Scientific-input changes trigger new analysis, affected task review and publication warning.

A reviewable output contains statuses by class, retained geometry IDs/lengths, exact problem hashes, solver limits/status reasons, model assumptions, dependency graph, ranked action bounds with relaxation labels, recommended prerequisite tasks and deterministic plain-language explanation objects.

Real readiness values may remain unknown. That is a valid product state. Filling them with fixture numbers to obtain an impressive shrinking map is a release-blocking defect.

