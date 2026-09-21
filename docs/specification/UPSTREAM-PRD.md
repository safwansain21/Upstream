# Upstream — complete product requirements and build contract
Version 1.0 · 21 September 2026 · Authoritative implementation specification

## 0. Read this first

Build a complete, persistent, responsive **web application**, not a clickable mockup. Upstream turns a citizen's stream observation into a coordinated, reviewable investigation: establish what is known, identify useful next evidence, assign a feasible task, revise the investigation when evidence changes, and share a traceable assessment.

This document and its companion `SCIENTIFIC-ENGINE.md` are one specification. The engine companion is mandatory. `ACCEPTANCE.md` defines release gates. `START-HERE.md` is the implementation handoff. Do not require the original conversation or Claude's proposals.

**Authority, in order:** (1) this specification and the scientific companion; (2) the two primary hybrid UI images; (3) the three secondary page-layout images; (4) implementation judgment for nonmaterial details. A screenshot is not an authority for scientific numbers, geography, status semantics, input requirements, or permissions.

Previous ideas involving rivers represented as patients, diagnosis probabilities, disease predictions, conductivity-based pollutant identification, guaranteed localization, invented detection probabilities, and automatic source confirmation are explicitly superseded. Previous unverified arithmetic is not a golden test. No feature may quietly reintroduce those claims.

### 0.1 Required handoff files

| File | Purpose |
|---|---|
| `UPSTREAM-PRD.md` | Product, UX, architecture, operations, delivery |
| `SCIENTIFIC-ENGINE.md` | Mathematical, measurement, mapping and planning contract |
| `ACCEPTANCE.md` | Observable end-to-end release gates |
| `START-HERE.md` | Copyable implementation instruction and build order |
| `references/01-hybrid-landing.png` | **Primary:** public brand, palette, typography, photography, flowing section boundaries |
| `references/02-hybrid-investigation.png` | **Primary:** signed-in shell, active case, curved map/panel shapes and timeline |
| `references/03-directory-layout.png` | Secondary: investigation directory content and desktop composition |
| `references/04-evidence-layout.png` | Secondary: revision comparison and decision content |
| `references/05-report-layout.png` | Secondary: desktop contribution form content |

Use orange and ice blue with the hybrid's organic river-like edges throughout. Do not reintroduce the plum palette, previous dark cinematic concepts, cobalt/lemon theme, generic card-dashboard styling, or telephone device mockups. Apply the primary hybrid's curves to the secondary layouts. Images are references, not background screenshots to put underneath fake controls.

### 0.2 Delivery boundary

Everything described as required must work in local development and the deployed app. Real-world scientific validation, land access, a monitoring partner, instrument provisioning, a production domain, email credentials, and external API accounts cannot be fabricated by software. Provide explicit setup, health indicators, and honest unavailable states for missing external configuration. The full synthetic reference workspace must operate without paid map, AI, routing, or email services.

No subscription billing, social follower economy, public leaderboard, native mobile app, clinical patient records, pollution diagnosis, unrestricted chatbot, or general-purpose geographic-information-system editor is in scope. A responsive/installable web experience is in scope.

## 1. Purpose, audience and success

### 1.1 Product promise

**See a change. Follow it upstream.**

People can report a change even when a stream has no official name, no mapped line, no established monitoring stations, and no prior case. Where evidence and a suitable local model exist, Upstream helps choose observations that distinguish candidate source reaches. Where they do not, it coordinates the work needed to establish them and clearly explains the limitation.

The differentiated loop is:
**report → verify readiness → choose useful evidence → collect → review → revise → share**.

An excluded reach is incompatible under stated assumptions, not proven clean. A retained reach is worth considering, not proven responsible. An accepted observation is approved for a defined use, not guaranteed true.

### 1.2 Intended users

| Role | Need | Main workspace |
|---|---|---|
| Visitor | Understand the product and explore a clearly labelled example | Landing, how it works, public example |
| Contributor | Report what they observed and see what happened next | Observation form, own reports, contribution receipt |
| Trained monitor | Find feasible assigned tasks and record traceable measurements | My tasks, task detail, reading workflow |
| Coordinator | Triage reports, organize local mapping, assign work, manage readiness | Directory, case workspace, task board |
| Expert reviewer | Evaluate evidence, assumptions, inspection recommendations and revisions | Evidence review, decision view |
| Organization administrator | Manage membership, qualifications, instruments, protocols and integrations | Organization settings |
| Recipient | Read a shared package and acknowledge a specific revision notice | Recipient portal |

Roles are organization-scoped capabilities, not globally interchangeable personas. An administrator does not automatically acquire scientific-review qualification. A monitor needs an active qualification for the requested task type. An expert may also be a coordinator through separate membership capabilities.

### 1.3 Outcomes to measure

Instrument these events without collecting report contents in analytics:
report draft started/completed; form validation failure; task offered/accepted/declined/completed; reading accepted/suspect/excluded; readiness blocker resolved; assessment retained-length change; uninformative contribution; revision acknowledged; offline operation synchronized; navigation or upload failure.

Report funnel completion, median task completion time, accessibility findings, fraction of cases with incomplete readiness, and assessment-level incorrect-exclusion rates in synthetic/independently characterized evaluation. Do not define success as maximum exclusions or minimum time to close.

### 1.4 Hackathon alignment

Primary track: AI-Supported Assessment. AI assists description and explanation, with confirmation and source references; deterministic scientific code handles compatibility; qualified humans authorize consequential decisions. Demonstrate:
- Mission: citizens contribute to urban freshwater investigations; contextual public access, animal access and habitats inform review.
- Innovation: useful-next-observation selection plus reversible conclusions and evidence dependencies.
- Architecture: durable records, reproducible engine, validated exports and reliable offline synchronization.
- UX: an exceptional, accessible web interface for both novices and trained people.
- Scale: reports on unmapped waterways, local network onboarding, organizations, adapters, and explicit readiness limits.

These are design objectives, not claims about guaranteed judging outcomes or actual field performance.

## 2. Nonnegotiable product rules

R-01 A report never requires selecting an existing river, station, or case.
R-02 A case exists before a conductivity anchor exists.
R-03 Source-area localization requires the readiness gate in the scientific companion.
R-04 Missing uncertainty, missing background, unknown connectivity, or unavailable instruments never become zero uncertainty or confirmed readiness.
R-05 AI/photo interpretation cannot change source compatibility or approve a case.
R-06 A solver timeout retains possibilities; it never rules them out.
R-07 Synthetic/replayed/real origin remains visible in records, maps, exports and receipts.
R-08 New evidence may expand the area. All affected outputs and assignments must reflect revisions.
R-09 No task is assigned automatically merely because the planner ranked it first.
R-10 Human/animal access layers influence attention and recipient suggestions, never physical source compatibility.
R-11 Every displayed scientific value comes from a versioned engine result or clearly labelled observation; none is copied from a mockup.
R-12 Authentication, authorization, storage and network failures must not be disguised as success.
R-13 Low bandwidth, keyboard navigation, reduced motion and unmapped locations are first-class paths.
R-14 No unlicensed map assets, invented data partners or silent export to external organizations.
R-15 The frontend cannot approve an assessment, declare training, or mark network connectivity verified by changing local state.

## 3. Definitive visual system

### 3.1 Art direction: flowing field atlas

Combine the visual strength of orange/ice blue with the gentle non-straight boundaries of the plum exploration. The application should resemble a carefully designed field atlas with a contemporary digital interface.

Keep information in aligned readable columns. Curves belong to major surfaces and transitions: navbar lower edge, hero photo mask, map frame, case action panel, large section transitions, evidence timeline. Do not make every input, cell, tooltip and button an irregular blob.

Actual geographic layers are generated from spatial data. Decorative river photography belongs to the landing page or explicitly illustrative example art; it must not masquerade as satellite imagery of a real case.

### 3.2 Tokens

| Token | Value / rule |
|---|---|
| Canvas | #F7F6F2 |
| Surface | #FFFFFF |
| Ink | #222524 |
| Secondary text | #525B60; verify contrast on actual fill |
| Ice surface | #D8E8F1 |
| Pale ice | #EDF4F7 |
| Brand orange, decorative | #EE5634 |
| Action orange, white text | #B83A21; verify WCAG contrast before release |
| Strong link orange | #A8321D |
| River line | #397E98 |
| Candidate hatch | #397E98 with a distinct diagonal pattern |
| Excluded under bounds | #7E8B91, dashed/muted; never green/clean |
| Review warning | #8B5500 on #FFF0D3 |
| Accepted state | #25614B on #E6F3EB; always add text/icon |
| Error | #A92727 on #FDECEC |
| Focus | 3px #145CCB outline, 3px offset, not clipped |
| Borders | #C9D4D8, 1px; selected control 2px |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48, 64, 96px |
| Functional radius | inputs 10px, buttons 10px, small panels 16px |
| Shadows | two restrained levels; no huge fuzzy grey shadows |
| Max editorial width | 1440px; operational workspace may use full width |
| Desktop page gutters | 32px at 1440; 24px at 1024; 16px below 768 |
| Touch target | 44×44px minimum for standalone interactive controls |

Typography: self-host **Barlow Condensed** 600/700/800 for display headings and station emphasis; **Source Sans 3** 400/500/600/700 for all body, forms, navigation and tables; **IBM Plex Mono** 400/500 only for instrument IDs, hashes, code and technical exports. Store licenses. Do not horizontally distort type or use the narrow display face for paragraphs or critical measurements.

Sizes: landing H1 clamp(52px, 7vw, 100px), desktop case H1 52–64px, operational page H1 36–48px, H2 28–32px, H3 20–24px, body 16px/1.5, secondary labels 14px/1.4, noncritical metadata minimum 12px. On mobile H1 32–40px. Use tabular numbers for readings and comparison totals.

### 3.3 Reusable curve vocabulary

Implement named SVG/CSS masks as reusable components with normalized viewBox coordinates:
- `RiverDivider`: one long S-shaped wave, height 20–48px desktop, 12–20px mobile.
- `RiverPanel`: a broad single concavity on its decorative outside edge; content inset at least 32px.
- `AtlasMapFrame`: gentle asymmetrical upper/lower curves; all controls remain within safe rectangular insets.
- `RiverPhotoMask`: organic bank silhouette for editorial photography.
- `EvidenceFlowLine`: smooth connector through discrete chronological markers.

Use at most two pronounced curved boundaries in an operational viewport. Softer background curves may repeat at low contrast. Rounded-rectangle fallbacks apply at narrow widths and in print. Never clip text, focus rings, popovers, map attribution or controls. Keep tab order independent of the shapes.

### 3.4 Components to implement

BrandMark, AppHeader, RoleBadge, OriginBadge, CaseStatus, SearchFilterBar, InvestigationRow, RiverPanel, MapViewport, NetworkDiagram, StationMarker, ReachLegend, ReadinessChecklist, NextActionPanel, ObservationCard, MeasurementRow, QualityBadge, EvidenceTable, RevisionCompare, CaseTimeline, ContributionReceipt, TaskAssignmentDialog, EmptyState, InlineError, OfflineStatus, SyncQueuePanel, NotificationCenter, ExportDrawer, RecipientAcknowledgment, MotionSettings.

Specify loading, empty, disabled-with-reason, error, focus, hover and selected states for every interactive component. Disabled items explain the missing prerequisite in nearby text; do not hide the product's main capability behind an unexplained grey button.

### 3.5 Image-use contract

Use the primary hybrid images for visual identity and broad composition, not pixel-for-pixel fake controls. In the mockups, station positions, dates, map areas and imagery are illustrative. In the application:
- Dynamic map geometry and station labels come from the network version.
- Map attribution remains visible.
- Anonymous example imagery is labelled illustrative.
- No generated face is represented as a real contributor.
- Do not reuse narrow form typography or inconsistent scientific labels from secondary images.
- Do not require satellite tiles to obtain a polished map: the default contour-style/vector map must look finished.
- The observation form's stepper reflects the actual current step; do not mark observation and location complete prematurely.
- No forced assertion that a report was made from permitted land; show field guidance without making a checkbox a barrier to reporting.

## 4. Motion specification

Motion must explain navigation, change and causality. It must never imply that an observation proves a conclusion before the server and reviewer have done so.

Use `motion/react` for component/layout transitions and CSS for simple hover/focus. Do not depend on experimental React/Next view-transition features for essential behavior. Optional browser-native transitions may be an enhancement behind feature detection after the baseline is complete. No canary React requirement. Avoid two simultaneous route-animation systems.

### 4.1 Motion tokens

| Name | Duration | Easing |
|---|---:|---|
| Instant feedback | 100ms | ease-out |
| Control hover/focus | 140ms | cubic-bezier(.2,.8,.2,1) |
| Panel/tab reveal | 180ms | cubic-bezier(.2,.8,.2,1) |
| Route entrance | 260ms | cubic-bezier(.22,1,.36,1) |
| Shared photo/list-detail | 320ms | cubic-bezier(.22,1,.36,1) |
| Evidence reach change | 420ms | cubic-bezier(.22,1,.36,1) |
| Map fit to selected extent | 450ms maximum | ease-out |
| Landing introduction | 600ms maximum | cubic-bezier(.22,1,.36,1) |

### 4.2 Required interactions

M-01 Initial landing: title opacity + 12px rise, photo reveal through a stationary river mask, CTA appears 80ms later. Total sequence under 700ms; navigation/CTA usable immediately. No splash/loading animation.
M-02 River process section: reveal the connecting stroke once on first intersection over 500ms. Do not loop or bind scrolling speed to animation.
M-03 Page navigation: preserve header; new main content fades in with at most 8px translation. Forward list→case may use 16px horizontal motion; browser back uses inverse if direction is known, otherwise fade.
M-04 Case list→detail: shared transition for case thumbnail/title only when both are ready; otherwise normal entrance. Do not snapshot or morph a live WebGL map.
M-05 Tabs: 140ms underline movement and 120–180ms content fade. No directional slide for unrelated tabs.
M-06 Investigation row hover/focus: 1px border emphasis, 2px maximum lift, arrow translates 3px. No 3D tilt or mouse-following.
M-07 Buttons: background/foreground transition; arrow translates 3px on hover, press scale .985 maximum; identical visible focus feedback.
M-08 Station selection: one 350ms ring expansion and persistent selected outline; card opens with 180ms fade/8px movement. Never pulse indefinitely.
M-09 Map location selection: animate camera only after explicit selection; do not recenter on every incoming reading or steal user pan.
M-10 Assessment update: wait for a complete immutable server result. Crossfade old/new reach overlays over 420ms on the same geometry. Shrink and expansion have equal visual importance. Announce actual before/after length in a polite live region once.
M-11 Numeric totals: crossfade final values; do not count through invented intermediate measurements.
M-12 Revision comparison: synchronized pan/zoom and an optional user-controlled slider. Default side-by-side with clear previous/draft labels. Do not autoplay or overwrite the approved version.
M-13 Evidence timeline: reveal a new marker once; when exclusions expand the area, briefly connect the relevant record to the changed overlay. A static explanation is always available.
M-14 Task drawer: 220ms slide/fade, focus trap, Escape close, focus restored. Desktop drawer 440px, mobile full-width sheet.
M-15 Form steps: preserve inputs; 180ms crossfade and 8px forward/back translation; focus the step heading after transition. Errors move focus to error summary immediately.
M-16 Upload: show actual transferred bytes where available; server-processing indicator is indeterminate and labelled. Never simulate a percentage.
M-17 Submit success: one subtle checkmark stroke, 250ms; then stable receipt with next step. No confetti for suspected environmental harm.
M-18 Filter/list reorder: retain keyed row identity and animate layout 180ms; maintain focus on active control. Background data refresh does not replay route entrances.
M-19 Skeletons: matched dimensions, subdued opacity shimmer only when motion allowed; no large pulsating blocks. Show delayed skeleton after 150ms to avoid flicker.
M-20 Offline→sync: status icon changes, completed queue items settle out over 160ms, polite summary once. Do not interrupt input with modal celebration.
M-21 Popover/tooltip: opacity+2px movement over 100ms, delayed tooltip 400ms; no essential content exclusively in hover.
M-22 Full-screen image viewer: 240ms shared photo transition; Escape closes; keyboard controls and caption available.

### 4.3 Accessibility, performance and truth

Honor `prefers-reduced-motion` plus persistent user setting System/Reduced/Full. Reduced mode disables camera flights, translations, shared morphs, draw-on paths, parallax, shimmer and automatic illustrative motion; use immediate state changes or ≤80ms opacity. Also offer separate "Simplify map visuals" setting.

Animate transform/opacity wherever possible. Do not continuously morph large SVG clip paths or re-render the map during animation. Pause all decorative animation offscreen and when the tab is hidden. No scroll hijacking, custom cursor, sound autoplay, perpetual bouncing, looping flowing-river particles, or motion required to understand state.

For every animation, the final state must be correct when animation is interrupted, a route changes twice, a request fails, or reduced motion activates mid-session.

## 5. Information architecture and routes

All routes support direct load, refresh, browser back and meaningful document titles. Organization ID is explicit in signed-in URLs. The last selected organization may redirect `/app`; it never changes authorization.

| Route | Purpose / access |
|---|---|
| / | Public landing |
| /how-it-works | Participation, role boundaries, responsible interpretation |
| /example | Public read-only example chooser |
| /example/[scenario] | Fully labelled interactive synthetic walkthrough |
| /sign-in, /auth/callback | Email login/verification |
| /onboarding | Display name, language, organization join/create |
| /app/[org]/investigations | Search/filter/map/list directory |
| /app/[org]/investigations/[case] | Case overview and next step |
| /app/[org]/investigations/[case]/observations | Record list, version details |
| /app/[org]/investigations/[case]/tasks | Case task board |
| /app/[org]/investigations/[case]/map-setup | Local network and station readiness |
| /app/[org]/investigations/[case]/evidence | Assessments and current review |
| /app/[org]/investigations/[case]/history | Immutable case activity |
| /app/[org]/investigations/[case]/decision | Expert inspection/escalation decision and context |
| /app/[org]/investigations/[case]/exports | Packages, recipients, revision acknowledgments |
| /report/new, /report/[draft]/edit | Three-step draft workflow, guest drafting allowed |
| /app/[org]/reports/[report] | Own report and contribution receipt |
| /app/[org]/tasks, /app/[org]/tasks/[task] | Assigned/available qualified work, capture |
| /app/[org]/evidence | Review queue, experts/coordinators |
| /app/[org]/community | Local contribution opportunities and organization information |
| /app/[org]/notifications | In-app updates |
| /app/[org]/settings/profile | Language, privacy, motion, offline drafts |
| /app/[org]/settings/organization | Membership and organization details |
| /app/[org]/settings/instruments | Meters, calibration and verification |
| /app/[org]/settings/protocols | Versioned protocol/background/transport records |
| /app/[org]/settings/integrations | Imports, recipients, provider readiness |
| /share/[token] | Recipient/public scoped package view |
| /privacy, /accessibility, /terms | Plain-language operational policies |
| /status | Non-sensitive service availability only |

Case tabs use the same shell and retain case identity. Hide unauthorized controls, but also enforce every permission server-side. An unavailable route shows 403 or privacy-preserving 404, not a broken blank page.

## 6. Page specifications

### 6.1 Landing

Use primary landing reference. Header, hero, actual working example/report CTAs, flowing orange band, three-step process, example investigation preview, short "What Upstream can and cannot tell you", community invitation, footer.

Hero copy: "See a change. Follow it upstream." Supporting copy: "Turn local observations into a coordinated investigation." Include "No mapped stream nearby? You can still report an observation."

The lower capability explanation says reports support investigation; measurements and expert review are needed for interpretation; no photo-based water safety assessment. Do not add fabricated trust logos, user counts or testimonials. "Explore an example" opens a read-only seeded scenario with conspicuous Example data badge. The public demo never mutates shared production records.

### 6.2 Investigation directory

Use secondary directory composition in hybrid styling. Search by name/local alias/place/case number; status, assigned-to-me, readiness and data-origin filters; Map/List toggle; optional Near me permission initiated by click. Geolocation refusal leaves search and manual map selection usable.

Rows: title, locality, workflow state, readiness summary, latest meaningful update, own involvement, small photo, Open link. Do not present total observations as independent event count. Default sort most recently updated, with Needs my review available to experts. Pagination 25 rows, cursor-based. Empty state offers Report an observation; no "nothing exists here" claim based only on empty application records.

Map/list selection synchronizes without unnecessary camera motion. Unmapped reports appear as points/uncertainty circles, not fabricated river polylines. Public snapshots generalize precise locations. Provide a list alternative to every map interaction.

### 6.3 Citizen observation workflow

Step 1 Observation: optional 0–5 photographs; structured multiple selections (unusual foam, colour change, odour noticed without deliberate exposure, dead wildlife, visible discharge, habitat/access concern, other); free text 0–2000 characters; observation date/time/timezone; default now, editable. At least one structured category or 10-character description required; image never mandatory.

Step 2 Location: use GPS with consent, place a pin, search locality, or supply landmark text. River name optional; existing-waterway suggestions optional and rejectable. Offer "This stream is not on the map". Store GPS accuracy, location method and confirmation. If only landmark text exists, submit with location_precision=unresolved and map confirmation needed. A map-drag never silently snaps to a different waterway.

Step 3 Review: original photos, report description, time, location confidence, publication choice (private to assigned organization by default), explicit AI-suggestion acceptance if used. Clear primary Submit report, secondary Save draft. Guest must verify email before durable server submission; preserve draft during authentication. A deployment intake organization accepts reports with no chosen local organization into an unassigned triage queue. Do not invent a promise that a local authority has received it.

Image validation: JPEG/PNG/WebP and server-converted HEIC, 15MB each, maximum 5. Reject invalid signature or excessive decoded dimensions >40 megapixels. Client creates preview and optional ≤2400px upload derivative; preserve original privately if consented. Remove EXIF GPS from public/AI derivatives; keep volunteered location as separate protected data. Failed individual upload can retry/remove without deleting the draft. Text-only submission remains possible.

On submission: client-generated UUIDv7 idempotency key; pending local, uploading, server accepted are distinct. Server creates report+case or attaches to a coordinator-confirmed existing case transactionally. Receipt: "Your report has been received for review. The cause is not established." If pending offline: "Saved on this device. Not submitted yet."

Duplicate suggestions use nearby reports and time, but citizen may choose "This is a new observation"; no automatic destructive merge. Coordinator later merges with an immutable redirect and preserves both report IDs/attribution.

### 6.4 Contribution receipt / own report

Show submitted content, processing state, related case and follow/unfollow. Display what the contribution actually changed: recorded for triage, clarified location/access, informed a task, changed retained length, or no change under current assumptions. Do not attribute an entire result to one person when multiple dependencies were needed.

A receipt derived from assessment V3 shows "Based on assessment 3" and updates to "This assessment was revised" with a link after supersession. Previous text remains in history. User may propose a correction, withdraw public visibility, or request personal-data deletion; record correction rather than overwrite an accepted measurement.

### 6.5 Case overview

Use primary investigation reference. Header: case/local stream name, locality, origin, workflow state, cause unconfirmed. Main map and task panel, local tabs, progress timeline, readiness drawer.

Before localization eligibility, replace "5.3 km" with "Investigation area not yet established". The action panel shows the actual next prerequisite: confirm location, review mapping, establish background, obtain measurements, or expert review. Do not display a cosmetic empty source-search map.

Once eligible: show retained length, number of disjoint retained segments, compatible/unresolved breakdown, model and evidence status, assessment timestamp/version. Map detail reveals the assumptions and evidence supporting exclusion. Retained segments can be disconnected and must never be visually joined into a single area.

Next task panel explains proposed purpose, feasibility, qualification, instrument, access state and model-bound limitations. Review task opens assignment dialog; proposed recommendations are not live assignments. Recomputing displays a timestamped previous assessment with "Updating", never a fabricated intermediate result.

### 6.6 Local mapping and readiness

Create a local investigation area from a report. Import candidate linework from a configured geospatial dataset or draw a proposed local stream segment. Sources carry attribution, retrieval time, license, resolution and verification status. No network upload to OpenStreetMap or an authority occurs automatically.

Editing tools are bounded: add/move node, trace/split a reach, propose confluence, set/flag flow direction, add station/access point, mark boundary inflow, flag culvert/unknown connection, attach supporting evidence, undo before publishing. Editing produces a draft network version. Review diff shows additions/removals/direction changes; qualified coordinator publishes after documented verification. No "verify all" based on an imported file.

Readiness displays separate checks for location precision, network connectivity, supported flow regime, station accessibility, trained capacity, instrument quality, backgrounds, transport intervals, anchor/persistence and comparability. Each row explains what is missing and offers an appropriate task. Mapping is not a magic unlock for missing calibration or background.

Unknown branches that could change relevant flow pathways block source-area exclusion, even if visible mapped branches look connected. A verified local domain may be used only with explicitly modelled boundary inflows and documented domain completeness. A failure outside that domain does not become a statement about the whole river.

### 6.7 Tasks and assignment

Task types: location_confirmation, mapping_verification, access_confirmation, repeat_imagery, baseline_reading, anchor_reading, conductance_reading, coordinated_pair, instrument_check, expert_review.

List tabs My tasks / Available to me / Coordinating. Each task includes case, purpose, location, estimated task time, access notes, qualification, equipment, deadline/window, sync state and rationale version.

State machine: proposed → assigned → accepted → in_progress → submitted → completed. Alternatives: declined (reason), cancelled (reason), expired, blocked, needs_revision. Only a coordinator assigns; monitor can accept/decline own assignment. Available-to-me claim uses an atomic server check. Completion requires acceptance of the submitted evidence or a documented nonmeasurement outcome. No outcome is lost when task expires.

Assignment dialog: choose eligible person and available verified instrument; show travel estimate source or "Travel time not established"; record meeting/time window for pairs; confirm access status; display scientific rationale and what would make it obsolete. Estimate errors never turn into fictitious walking routes. Refusal to enter inaccessible/private/unsafe terrain is a valid blocked outcome.

If an access report says path closed, provisionally block tasks using it until coordinator resolves. Re-plan feasible candidates. Distinguish operational usefulness from a mathematical narrowing guarantee.

### 6.8 Measurement capture web workflow

Responsive task page, not a separate native app. Show station identity/location, task/protocol version, instrument serial, active calibration/verification, approved sampling instructions supplied by organization, and return-to-task link.

Capture each replicate separately: raw conductivity, unit, measured water temperature, timestamp, instrument, visit ID, compensation mode/coefficient if applicable, meter-reported SC25 if available, quality notes. Do not let a user supply only "452" without saying what it represents. Instrument display photo optional. An AI transcription remains a draft requiring confirmation.

Protocol controls required cadence, replicate count, measurement range and required precision; interface explains timing. Timers help record cadence but never prove independence or plateau. Store missed cadence honestly. Temperature compensation is a computation, not hidden UI shorthand.

Submit may produce received/pending QC rather than accepted. Invalid units/ranges cause field errors; surprising but possible values offer confirm-with-note, not silent clamping. Unknown calibration or missing uncertainty retains record as not inference-eligible. No expert-approved calibration invented by clicking a checkbox.

### 6.9 Observations and instruments

Evidence table filters quality, station, time, visit, contributor, origin, accepted-for-assessment. Rows open details: original, proposed correction, versions, calibration snapshot, compensation method, uncertainty components, acceptance rationale, dependency use and source files.

Instrument registry: serial, make/model, measurement ranges, manual/spec attachment, accuracy-bound expression, temperature sensor specification, owner, availability, last calibration and verification events. Calibration events are immutable, signed by actor, effective at a measurement time, with pass/fail/indeterminate and protocol. A pass added later is not backdated silently.

### 6.10 Evidence review and decision

Use secondary review content with hybrid curves and readable body type. Review queue filters new assessment, changed assumptions, suspect instrument, mapping change, no compatible classes, recipient acknowledgment overdue.

Revision screen compares the last approved assessment and draft. Lock map geometry/scale when comparable; if topology changed, show a topology diff and explain why length comparison may not be like-for-like. Each excluded/retained class shows engine status, contributing record IDs and assumptions. Missing compute results are explicit.

Reviewer actions: approve assessment; request more evidence; reject draft with rationale; recommend inspection of named retained segments; escalate; close insufficient/no anomaly after review. Approval requires current dependency snapshot, no unresolved review hold, and explicit rationale. Inspection recommendation and localization state are separate. No automatic "source found".

Decision view keeps three statements distinct: environmental observations; potential exposure/access opportunities; no health outcome established. Layers: public access, animal access, habitat, each sourced or labelled synthetic. Expert chooses recipients and purpose; software suggests relevant organizations from configured jurisdiction records only. Closing no anomaly is a bounded conclusion about investigated evidence/time, not a water safety certification.

### 6.11 History, revisions and retraction

Timeline shows submissions, QC, mapping/protocol changes, analyses, assignments, reviews, package deliveries and acknowledgment. Filter by record type/actor/time. Links resolve exact versions.

Later instrument verification failure: mark affected readings suspect and dependent approved assessments under_review; flag dependent tasks. Reviewer determines affected interval and exclusions. Recompute creates a new draft; old approved record persists with a visible warning. Approval supersedes prior assessment. Never quietly erase prior map or keep sending its obsolete rationale.

Calibration expiry after a reading does not invalidate that reading. Failed/expired calibration at measurement time is handled according to protocol. A later verification failure does not automatically prove every prior reading wrong.

Supersession notices go to actual prior recipients; delivery and acknowledgment are different fields. Retry failures; coordinator sees who has not acknowledged. A withdrawn package remains retrievable by an authorized previous recipient with its warning and link to replacement, unless a privacy takedown requires content removal with a tombstone.

### 6.12 Community, notifications, settings

Community is local opportunities, organization contact/about, contribution history and published case updates. No public ranking by number of samples or pollution discoveries.

Notification types: report receipt, more detail requested, assignment, task change/cancellation, new review, own contribution effect, assessment superseded, delivery failed, revision acknowledgment needed. In-app is always available; optional email preference per type; default no marketing. Coalesce repetitive updates and never email precise private location/media without explicit publication scope.

Profile: language, display name, privacy, motion, map simplification, download/clear offline data, notifications. Organization: member capabilities/invites, training expiry, instruments, protocol versions, intake coverage, integrations. Integration settings visibly show configured/unavailable/last verified; never ask ordinary citizens for API keys.

## 7. Mapping coverage and equitable onboarding

Do not require a pre-logged waterway. The concern applies to small urban channels, seasonal streams, drains and informal settlements in any country. Global data is a starting point, not proof of completeness. HydroRIVERS uses extraction thresholds and cannot guarantee every small stream is represented [S1].

Store reports independently of the waterway registry. Waterway association is nullable and versioned. A locally named or unnamed provisional waterway can later be reconciled with an external identifier without changing report IDs.

Three separate capabilities:
1. **Report and coordinate:** available with description/approximate location; no river database requirement.
2. **Build local readiness:** proposed mapping, flow/connectivity verification, access/stations, baseline/instrument/transport work.
3. **Model-supported localization:** available only for the reviewed local domain and evidence satisfying scientific prerequisites.

Do not present these as a promised automatic progression. Some cases remain useful coordination records and never become localizable. The planner's next useful task may be "confirm this connection" rather than "take a better reading".

Required unmapped case experience: person drops a pin beside an unnamed stream; case opens; no plausible preexisting stream is found; local alias recorded; coordinator organizes mapping; each link's status is visible; initial reading is stored but excluded from localization eligibility until background/comparability exist; after verified evidence, eligibility changes. Display "Map verification needed", not "Unsupported country".

Low-resource support: photo-optional reports, landmark location, manually entered coordinates, offline drafts, cached assigned tasks, compressed imagery, manual baseline CSV import with preview, translation-ready interface, no mandatory paid map token, no personal instrument requirement for citizens. Trained monitoring still needs real instruments and protocols. Do not disguise that deployment dependency.

This is a material product requirement, not a new claim that AI can reliably infer river connectivity from a photograph. Community mapping has real precedents [S2], but Upstream does not claim a partnership with those projects.

## 8. States, invariants and permissions

### 8.1 Independent state dimensions

Case workflow: reported, triage, confirmation, localization_active, inspection_recommended, escalated, closed_no_anomaly, closed_insufficient, archived. Eligibility is derived, not a manually editable enum masquerading as evidence. Reopen requires authorized reason.

Assessment compatibility: not_run, several_retained, one_class_retained, no_modeled_class, computation_unresolved.
Model applicability: not_assessed, supported_under_assumptions, uncertain, unsupported.
Evidence consistency: insufficient, consistent_under_model, conflicting, under_review.
Next step: collect_evidence, establish_mapping, establish_background, inspect_candidate_area, review_assumptions, escalate, no_feasible_task.
Assessment publication: draft, approved, under_review, superseded, withdrawn.
Task state and quality state are independent.

Measurement quality: submitted, accepted, suspect, excluded, superseded_record. Record validity and scientific inclusion are separate; preserve why a record was excluded. Reference a specific reading version in every assessment.

### 8.2 Permission matrix

| Operation | Contributor | Monitor | Coordinator | Expert | Admin |
|---|---|---|---|---|---|
| Own report/draft and receipt | yes | yes | yes | yes | yes |
| Publish someone else's report | no | no | scoped consent only | no by default | no by default |
| Complete assigned nonmeasurement task | yes | yes | yes | yes | yes |
| Submit protocol measurement | no unless qualified | own qualified task | if separately qualified | if separately qualified | if separately qualified |
| Assign/cancel tasks | no | no | yes | if coordinator | if coordinator |
| Propose network correction | yes, draft evidence | yes | yes | yes | yes |
| Publish verified network | no | no | if verification-qualified | if verification-qualified | not by admin alone |
| Accept/exclude scientific evidence | no | no | QC only within policy | yes | not by admin alone |
| Approve inspection/assessment | no | no | no | yes | not by admin alone |
| Manage members/integration secrets | no | no | no | no | yes |
| View private case evidence | own submissions only | assigned need-to-know | organization scope | organization scope | administrative metadata; evidence via explicit capability |
| Acknowledge recipient package | scoped recipient | scoped recipient | scoped recipient | scoped recipient | scoped recipient |

Use capabilities in code, not client-selectable role labels. Cross-organization access requires explicit membership or recipient grant. No public role-switcher outside isolated synthetic example sessions.

### 8.3 Concurrency rules

All version-sensitive writes carry expected_version/If-Match. Reject stale mutation with 409 and latest version metadata, preserving unsaved input. Approval transaction recomputes dependency hash and fails if anything changed. Two workers cannot independently approve the same draft or assign one exclusive instrument to overlapping bookings. Duplicate offline submissions return original result for the same user/idempotency key.

## 9. Scientific behavior and AI boundaries

Implement `SCIENTIFIC-ENGINE.md` completely. The engine is a separate pure domain package with no model-provider or UI dependency. Protocol configuration has explicit bounded units and traceable sources. The synthetic fixture never becomes a production default protocol.

Do not narrow by a threshold-only complement rule. Unknown source magnitude is shared across comparable readings. Approximate conductance mixing, background uncertainty, calibration, temperature compensation, discharge and persistence are all visible assumptions. No hardcoded precision target is promoted from an earlier draft without independently reproduced inputs.

### 9.1 AI-assisted description

A server-side optional vision/text adapter proposes only observable descriptions from supplied text/images:
foam_visible, colour_change_visible, debris_visible, visible_discharge_feature, wildlife_visible, image_quality_issue, location_detail_needed.
Odour is user-reported, not image-inferred. No sewage, pesticide, pathogen, drinking-safety or source-location diagnosis.

Structured output: schema_version, model_id, observation_candidates[{code, description, input_reference}], suggested_questions[{code, text}], abstained, reasons. Strict validation, no arbitrary extra keys or frontend HTML. User reviews and accepts/edits each suggestion. Store original AI draft separately from final contribution.

### 9.2 AI summaries and explanations

Use retrieved case-specific records and deterministic engine explanation objects. Output short summary and explicit supporting record IDs. Resolve each reference against allowed case/version records before display. Unsupported claim or invented reference rejects the whole answer and falls back to deterministic templates. No percentage confidence badge.

AI cannot mutate quality statuses, assignments, assessments, recipient settings, networks or protocols. It cannot access secrets, cross-tenant evidence or hidden simulator truth. Prompt-injection text in reports/images is data; provider has no tools for database writes or external actions.

Optional provider configuration: server-only AI_API_KEY, AI_MODEL, AI_BASE_URL restricted to configured allowlist. Ship one production adapter for the OpenAI Responses API with structured output, and a deterministic disabled adapter. Model ID is configured and capability-tested rather than guessed. If no key, all core work remains functional and UI says "AI assistance is unavailable; you can continue manually." No canned generated response presented as live AI. Timeout 20 seconds; stop duplicate requests; no AI call blocks submission or offline drafting. Photo processing requires an explicit opt-in per report before external transfer.

## 10. Technical architecture

### 10.1 Chosen stack

| Layer | Required implementation |
|---|---|
| Web | Next.js App Router, TypeScript strict, React stable, Node 24 LTS |
| Styling | Tailwind CSS plus explicit design tokens; accessible Radix primitives where useful; custom Upstream components |
| Motion | motion/react and CSS, reduced-motion support |
| Forms/data | React Hook Form + Zod, TanStack Query for interactive server data |
| Maps | MapLibre GL JS for geographic view; SVG network schematic sharing selection/state; no paid provider dependency for examples |
| Offline | service worker app shell plus IndexedDB via Dexie |
| Auth/storage/database | Supabase Auth, private object storage, PostgreSQL + PostGIS |
| Domain API | Python 3.12+, FastAPI, Pydantic strict schemas |
| Scientific engine | Python exact decimal/rational input; Z3 exact real-arithmetic solver and conservative planner, per companion |
| Durable jobs | PostgreSQL jobs table and Python worker using atomic claiming; no in-memory queue as durable authority |
| Exports | JSON, GeoJSON, HTML/PDF via server Playwright print, validated FHIR R4 adapter |
| Testing | Vitest/Testing Library, Playwright/axe, pytest/Hypothesis, database policy tests |
| Local environment | Supabase local stack, web/API/worker, mail catcher, test recipient via documented container setup |
| Production | containerized web/API/worker behind HTTPS, managed Supabase; provider-neutral deployment instructions |

At implementation start select current security-patched stable package releases compatible with this stack and pin lockfiles/container digests. No unbounded "latest" in deployed containers. Use current official docs to resolve API changes. No Next experimental viewTransition requirement [S3].

### 10.2 Repository structure

```
apps/web/                 routes, components, map, forms, service worker
services/api/             authentication, HTTP contracts, domain orchestration
services/worker/          analyses, exports, AI jobs, notifications, imports
packages/engine/          graph, measurements, exact model, solver, planner
packages/contracts/       OpenAPI artifacts, generated TS types, JSON schemas
supabase/migrations/      schema, constraints, RLS, transactional RPCs
supabase/seed/            isolated reference workspace
fixtures/                 scenarios and evidence generators
tests/e2e/                browser workflows
tests/security/           role and tenant boundaries
tests/engine/             independent oracles and property tests
exports/fhir/             local profiles/extensions and validator configuration
docs/                     scientific limits, deployment, operations, asset licenses
public/brand/             fonts, river masks, photography derivatives
```

The frontend calls same-origin /api/v1 proxy routes; the API validates the authenticated user and organization capabilities on every request. Supabase JWT verification uses configured issuer/audience and rotating JWKS; never trust a user ID supplied in a body. Database requests use user-scoped credentials and restricted transactional RPCs. Privileged service credentials are limited to internal worker/admin maintenance and never sent to a browser.

Heavy solver/AI/export work runs asynchronously. UI receives 202 job ID, reads status, and subscribes to authenticated case event updates. Provide polling fallback if streaming is unavailable. The engine accepts an immutable input snapshot and returns an immutable result; it cannot send notifications.

### 10.3 Required local commands

Provide scripts with these exact outcomes:
- `pnpm setup:local`: checks tools/env, starts local dependencies, applies migrations, prints local URLs; no production changes.
- `pnpm seed:example`: idempotently seeds only the development/example workspace.
- `pnpm dev`: starts web/API/worker via the documented process manager.
- `pnpm test`: web/unit/contract checks.
- `pnpm test:engine`: Python engine and property suite.
- `pnpm test:e2e`: seeded browser suite.
- `pnpm test:security`: RLS/authorization/recipient tests.
- `pnpm verify:fhir`: pinned official validator against exported fixtures.
- `pnpm build`: production builds/typechecks.
- `pnpm verify:release`: all mandatory acceptance gates, with external-provider smoke tests reported separately.
- `pnpm reset:example`: reset example-only data with environment and workspace guards.

No script silently installs a system dependency, resets a production database, or sends real email to make tests pass.

## 11. Data model

### 11.1 Conventions

Identifiers UUIDv7 generated client-side for offline-capable records; database uniqueness still authoritative. Use timestamptz UTC plus original IANA timezone on observations. Geometry SRID 4326; spatial calculations use geography/geodesic or an explicitly chosen projected CRS. Measurement values and bounds are numeric/decimal strings; JSON numbers must not introduce binary rounding into the engine. Durations seconds; lengths integer millimetres in scientific fixtures and numeric metres in persisted geometry records. No unsupported precision implied in presentation.

Every organization-owned row has org_id. All versioned scientific records have stable entity_id, immutable version integer, created_at/by, supersedes_version, change_reason, data_origin and canonical content hash. Revision rows are append-only; mutable pointers point to current versions. Deleting an account pseudonymizes retained evidence according to policy rather than breaking foreign keys.

### 11.2 Required entities

Common fields are not repeated below. SQL migrations must implement real foreign keys, check constraints, indexes and policies; do not store the entire application in one JSON blob.

| Entity | Required domain fields and relations |
|---|---|
| organizations | name, slug, locale, timezone, intake_enabled, contact, geographic intake policy |
| profiles | auth_user_id, display_name, locale, motion_preference, privacy defaults |
| memberships | org_id, user_id, status; unique pair |
| member_capabilities | membership_id, capability, granted_by, expires_at |
| qualifications | membership_id, task_type, evidence_document, reviewed_by, validity interval |
| reports | reporter_id nullable after erasure, case_id, original client_id, structured categories, description, observed_at, timezone, location point nullable, landmark, precision/radius, optional waterway_id, public_visibility |
| report_versions | immutable submitted content and corrections, predecessor and rationale |
| media_assets | private key, derivative keys, owner/report, MIME, hash, bytes, dimensions, consent flags, scan state |
| waterways | local name nullable, aliases, external_ids, provisional status; independent of case |
| cases | title, workflow, domain pointer, assigned coordinator, intake org, public snapshot pointer, current approved assessment, review_hold |
| case_reports | links preserving merged-report membership and origin |
| case_events | ordered bigint sequence, event_type, actor, object/version refs, occurred_at, redacted public payload |
| network_versions | domain ID, source/license metadata, review status, geometry CRS, completeness/flow-regime declarations, evidence refs |
| network_nodes | network_version, stable node ID, kind, point, boundary designation |
| network_edges | version, stable edge ID, from/to, line geometry, length, flow/connectivity status, evidence refs |
| stations | stable station ID, network version association, point/edge-position, local code, proposed/approved status, access record |
| access_records | location/station, observed access status, time, contributor, evidence, reviewer, validity window |
| context_features | kind public_access/animal_access/habitat, geometry, source/license, verification, sensitivity/public precision |
| instruments | serial unique per org, model, capabilities, availability, specification refs |
| calibration_events | instrument, effective interval/check time, status, bounds, certificate, reviewer |
| protocol_versions | scope, measurement ranges, units, cadence, repetitions, applicability, trigger, bound-mode configuration, signatory |
| background_versions | station, flow/season/temp domain, construction method, true-SC25 enclosure, uncertainty provenance, samples, chronological evaluation |
| transport_versions | station/edge scope, discharge/velocity intervals, mixing assumption, study provenance, applicability windows |
| visits | task, station, instrument, time window, operator, shared effect group |
| reading_versions | raw/SC25 mode, all values/bounds, measured/received times, instrument/calibration/visit, water group, quality and inclusion decisions |
| quality_decisions | exact reading version, disposition, reviewer, reason, affected interval, effective_at |
| water_condition_groups | coefficient interval, temperature domain, justification/source for shared scope |
| task_proposals | assessment/mapping prerequisite source, action, feasibility, predicted bound, rationale and dependency hash |
| tasks | proposal ID nullable for manual task, type/state, assignee, station(s), schedule, equipment, access snapshot, optimistic version |
| task_submissions | task, report/reading refs, submitter, outcome, rejection/acceptance explanation |
| instrument_bookings | instrument, task, time range, exclusive status |
| analysis_jobs | immutable input hash, purpose, state, progress stage, retry/lease metadata |
| assessments | case, revision, snapshot hash, statuses, retained lengths/classes, engine/planner versions, publication state |
| assessment_dependencies | assessment, entity_type/id/version/hash, reason used |
| class_results | assessment, identifiability class, status, length, member edges, solver reason/witness metadata |
| recommendations | assessment, action, score bound/status, operational constraints, rationale |
| expert_decisions | assessment, actor/capability, action, rationale, named segments, context/recipient choices |
| ai_runs | purpose, consent, provider/model, prompt/schema versions, input refs/hashes, validated output, reviewed disposition |
| evidence_packages | assessment, immutable manifest/artifact keys/hashes, signing status, supersedes_package_id |
| recipients | org-controlled destination, delivery method, verified status, scopes, pinned key/integration metadata |
| deliveries | package+recipient unique logical delivery, attempt history, sent/delivered/failed, transport response |
| revision_notices | prior/new package, recipient, delivery state, acknowledgment actor/time/token hash |
| share_grants | hashed token, package/public snapshot, scope, expiry, revocation |
| notifications | user, type, object/version, read_at, dedupe key |
| follows | user+case unique, notification preferences |
| import_jobs | format/source, original hash, mapping config, preview/validation status, accepted record IDs |
| idempotency_keys | actor+operation+key unique, request hash, stored response/status, expiry |
| outbox_jobs | event type, payload ref, dedupe key, availability, lease, attempts, last error |
| audit_log | append-only security/action record, actor, scope, object, outcome, request ID; excludes secrets |

### 11.3 Database safeguards

- RLS on every exposed table; deny by default; both USING and WITH CHECK for permitted writes.
- Only narrow public snapshot functions are anonymous-readable. Never expose private tables merely because some cases are public.
- Membership/capability changes occur through authorized RPCs, never self-insert policies.
- Security-definer functions have fixed search_path, explicit identity/capability checks, and revoked unnecessary execution grants.
- Cross-org relationships enforced using composite org_id/id references or equivalent transactional checks backed by constraints.
- Index foreign keys, org+state+updated_at, station+measured_at, task+assignee+state, case event sequence, dependency lookup, outbox availability, and spatial GiST.
- Immutable records cannot be edited by ordinary roles. Audit writes are generated server-side.
- Instrument overlap prevention uses a PostgreSQL exclusion constraint on active booking time ranges.
- No cascade deletion of scientific history when a user or organization member leaves.
- Worker jobs are unique by purpose+snapshot hash, leased with SKIP LOCKED, heartbeat, bounded retry and dead-letter state.

## 12. HTTP and event contracts

Versioned JSON API `/api/v1`. OpenAPI is generated from server schemas; generate frontend types and fail CI on drift.

Success envelope: {data, meta:{request_id, version?}}. Error envelope: {error:{code,message,field_errors?,retryable,request_id}}. Never leak SQL, secrets or another tenant's IDs.

Codes: AUTH_REQUIRED 401; FORBIDDEN 403; NOT_FOUND 404; VERSION_CONFLICT 409; DEPENDENCY_CHANGED 409; IDEMPOTENCY_MISMATCH 409; VALIDATION_FAILED 422; READINESS_REQUIRED 422; RATE_LIMITED 429; PROVIDER_UNAVAILABLE 503; COMPUTE_LIMIT is an assessment outcome, not an HTTP "source excluded" error.

| Endpoint group | Required operations |
|---|---|
| /reports | create, own list/detail, correction version, publication preference, duplicate suggestions |
| /uploads | signed upload intent, confirm/process, status, remove own unused upload |
| /cases | create/list/detail, transition, merge/reopen, follow, public snapshot |
| /cases/:id/readiness | derived checklist, blocker task proposals |
| /cases/:id/network | draft import/edit/validate/publish, version diff |
| /stations, /access-records | scoped create/propose/review |
| /tasks | propose/assign/claim/accept/decline/start/submit/review/cancel |
| /readings | submit replicate set, exact version details, propose correction, QC/review |
| /instruments | registry, booking, calibration/verification events |
| /protocols, /backgrounds, /transport | create draft, validate, approve immutable version |
| /cases/:id/analyses | enqueue by snapshot, status/result |
| /assessments/:id | detail, dependencies, compare, approve/request/reject |
| /cases/:id/decisions | inspection/escalation/closure with rationale |
| /exports | create package job, artifacts/verification, permitted delivery |
| /recipient-notices/:id | scoped acknowledge exact replacement |
| /imports | CSV/GeoJSON preview, field mapping, validate, commit |
| /ai/describe, /ai/summarize | consented asynchronous request, reviewed result |
| /notifications, /sync | in-app events, per-operation sync results |
| /events | authorized SSE with Last-Event-ID; polling equivalent |
| /settings | profile/org/role/integration endpoints with specific capabilities |

List pagination default 25, max 100; bbox filtering bounded; file upload max limits in §6.3; import default max 10MB/10,000 rows with larger batches rejected clearly. Commands that produce effects require idempotency key. PATCH mutation requires expected_version. Read and accepted mutation responses carry server timestamps; client times never authorize transitions.

Write transactions append audit/domain events and outbox records together. A transaction rollback must not deliver a notification. Outbound workers act only on committed events.

## 13. Offline, loading and failure behavior

Cache public app shell/fonts and explicitly selected task packets. Do not bulk-cache all private case media. IndexedDB separates drafts by authenticated account; explicit local unlock is not encryption. Explain that drafts are stored on this device and offer clear/download controls.

Offline allowed: draft reports, attach local photos, record assigned task observations, review cached instructions and last synchronized case snapshot. Offline prohibited: approve/exclude evidence, publish topology, assign/claim shared resources, deliver packages, modify permissions, or claim server submission succeeded.

Queue each operation with client ID, account scope, base version, payload hash, dependency operation IDs, attempts and status. Upload media before submitting its references. On reconnect refresh session and permissions first. If membership was revoked or task cancelled, preserve draft and explain why automatic submission stopped. Never resubmit under another account.

Conflict resolution:
- Duplicate same key/body → original response.
- Same key/different body → reject and preserve both drafts.
- Edited server draft → show comparison, user chooses new version.
- Changed task/protocol → hold reading as historical submission for review; do not relabel it compliant.
- Network changed → retain original location/network version; request association review.
- Storage quota → text draft preserved when possible, indicate image not saved and allow download.
- Browser cannot provide reliable background sync → visible foreground retry; no false "will definitely sync" promise.

Loading maps use sized placeholders and cached schematic fallback. Provider failure switches to a labelled schematic, never a blank rectangle. Slow analysis shows named stage and elapsed time without invented percent; cancel request stops further queued work without deleting completed records. Service worker upgrades prompt when unsent drafts exist; do not force refresh.

## 14. Privacy, security and responsible operation

Private by default. Exact field coordinates, contributor contact and private photos remain organization-scoped. Public case snapshot includes only authorized sanitized fields; locations generalize to an approximately 1km grid unless explicitly approved for finer display. Sensitive habitat features remain coarse regardless of a contributor's choice. Do not infer contributor home or display live volunteer tracking.

Email authentication through Supabase; email verification required for submission; sessions use secure cookies per supported SSR integration. Enforce origin checks/CSRF defenses on mutations, CSP with required map worker allowances, safe Markdown/plain text rendering, HTTPS, rate limits and file signature validation. No secrets or service-role keys in client bundles.

Default abuse controls per authenticated user: 20 reports/hour, 100 requests/minute general API, 10 AI requests/hour, 5 export jobs/hour; organization admins can adjust within documented server caps. Exceeded limits offer draft saving. Test limits without targeting real services.

No arbitrary outbound URL fetching from report text, imported metadata or AI output. Recipient webhooks restricted to administrator-configured HTTPS destinations, with SSRF/private-address protections, DNS revalidation and signed delivery. Local test receiver exception only in development. Rendering exported HTML must not fetch arbitrary remote URLs.

Retention defaults: unsubmitted local drafts 30 days with reminder before purge; server abandoned uploads 7 days; routine diagnostic logs 30 days; published evidence retained under organization policy shown on setup. Personal-data deletion request disables account/public identity promptly, removes nonessential media/contact, and preserves pseudonymized evidence/audit where policy requires. Do not claim universal legal compliance. Provide export/deletion workflows and documented administrator review.

No claims that an on-screen area is safe to enter or water is safe to drink. Field tasks use organization-approved instructions and access; persistent "Use approved access points" guidance. Reports of immediate danger can show configured local emergency contact guidance without pretending the app is monitored as an emergency service.

## 15. Imports, interoperability and evidence packages

### 15.1 Imports

CSV readings import accepts documented template with station, instrument, measured_at/timezone, raw/SC25 mode, unit, temperature, compensation metadata, replicate/visit, quality and origin. Preview identifies unit/time/station errors per row. Uncertain associations require review; no nearest-station auto-accept. Commit is idempotent by import+row source key, preserves original file hash and attribution.

GeoJSON network import preserves source IDs, provenance and geometry but defaults links to mapped_unverified. Validate coordinates, direction, crossings/confluences and unsupported topology. Importing does not establish hydrological truth.

OneAquaHealth compatibility is a documented CSV/JSON mapping adapter, not a claimed live integration unless an official API and authorization are actually configured.

### 15.2 Package contents

A reviewed package contains report.pdf, report.html, assessment.json, observations.json, evidence.geojson, optional bundle.fhir.json, manifest.json and manifest.jws when signing configured. JSON/GeoJSON are primary environmental outputs; FHIR is an adapter with explicit recipient agreement.

Human report: case scope; observation period; origin; reviewed conclusion; retained segments and length; unknowns; model limitations; maps/legend; evidence versions and QC; protocol/background/transport/network versions; who reviewed; supersedes information; next action; verification instructions. Do not include private contributor names by default.

Every artifact's bytes have SHA-256 in manifest. Manifest is serialized once with documented canonical JSON rules, signed externally using detached JWS with Ed25519; include algorithm/key ID and public-key fingerprint. Manifest excludes its own signature and does not hash itself. Verification script must detect changed artifacts, replaced manifest, wrong key and broken supersession link. An unsigned package says unsigned; no fake signature image or "verified" badge. Signing proves package integrity/key origin, not scientific correctness.

### 15.3 FHIR R4 adapter

Use R4 4.0.1, collection Bundle, Location stations, Device meters/exporting software, Organization, Observation, Provenance and DocumentReference only when semantically needed. No Patient, RelatedPerson, Practitioner, Condition or clinical CarePlan fiction.

Observation.subject may reference station Location; Device reference identifies instrument; actual raw vs compensated measurements use separate observations linked via derivedFrom where appropriate. Temperature is a measured component or linked observation consistently per profile. Publish local CodeSystem for environmental measurements rather than invent a LOINC code. UCUM conductivity unit uS/cm, temperature Cel. Quality/inclusion and compensation semantics are documented extensions. Background referenceRange text says empirical/conditional, not healthy range. Do not put a patient-normal interpretation code on environmental readings.

DocumentReference.subject does **not** accept Location in R4; omit it and use context.related for relevant Locations/observations [S4]. Published supersession uses replaces relationship and current/superseded status in the adapter's latest metadata; archived package bytes stay immutable.

Provenance agent uses Organization/Device where true; retain pseudonymous individual attribution in package and a documented extension, not fake clinical identities. Include exact versioned target references and reference resolvability inside bundle/package. Optional profile URLs use a configured canonical base; do not imply HL7 endorsement.

Run official validator with pinned R4 package and local profiles; zero error-level validation issues. Document any remaining warnings individually. Also validate meaning with assertions; schema validity alone is not proof of interoperability. Do not build a full FHIR server or claim arbitrary hospital ingestion.

### 15.4 Delivery and recipient view

User explicitly selects configured recipients and approves sending. Outbox signs requests, retries at 1m, 5m, 30m, 2h, 12h, then marks failed; administrator can retry. Retry preserves logical delivery ID and never regenerates package bytes. HTTPS response indicates transport receipt only. Human acknowledgment requires authenticated recipient or scoped expiring token action tied to package+revision.

Recipient sees current/superseded/under-review banner, readable package, download/verify, replacement link, acknowledgment control. Expired/revoked grants show neutral access-expired page. Recipient cannot edit evidence or browse organization records.

## 16. Synthetic reference workspace and fixtures

All examples visibly synthetic. Enable read-only public examples and isolated authenticated example sessions; no shared mutable demo role-switcher in production organizations. Switching example roles changes only that isolated session.

Seed cases:
1. **Mill Brook — useful evidence:** reviewed network and deliberately specified synthetic protocol permitting valid narrowing; exact values from engine fixture.
2. **Mill Brook — precision limited:** same topology with wider compensation/background bounds; no guaranteed narrowing; useful next step is better characterization, not invented confidence.
3. **Mill Brook — revised evidence:** accepted B2 observation → later instrument-check issue → suspect/review → excluded → candidate area expands → replacement task.
4. **Unnamed stream — mapping needed:** citizen pin/landmark with no registry entry; case/coordination works while localization locked.
5. **Confluence class:** only unresolvable confluence group remains, multiple separate segments shown as one observational class.
6. **Tidal channel:** case works; steady directed-tree engine marked unsupported.
7. **Access blocked:** citizen access update invalidates a proposed task; planner ranks available options or says none feasible.
8. **Delivery revision:** synthetic recipient receives package and separately acknowledges supersession.

Include network 1 two-tributary 8.5km fixture from companion, network 2 deeper branching fixture, network 3 invalid-for-v1 rejoining/tidal fixture. No fabricated real-world partner or independent validation event. Demonstration buttons call normal APIs with synthetic records and actual computation, not alternate hardcoded assessment logic.

## 17. Performance, accessibility and responsive design

### 17.1 Target viewports

Desktop: 1440×900 primary and 1920×1080; laptop 1280×800; tablet 1024×768/768×1024; phone 390×844 and 320px width. Below 1024 stack map and decision; below 768 switch full nav to accessible menu, map minimum 320px tall, task action visible before long evidence, forms single-column. No horizontal page scrolling. Evidence tables may use an explicitly labelled horizontal scroll region with row detail alternative.

Installable PWA is optional convenience; every function works in a browser. Do not design screens as phone-in-browser illustrations. Local cache functions on supported browsers without installation.

### 17.2 Accessibility release requirements

WCAG 2.2 AA target [S5]. Complete keyboard workflows, visible focus, skip links, correctly labelled controls, semantic headings, dialog focus restoration, errors tied to inputs, live-region restraint, 200% zoom, 320px reflow and text alternatives for map decisions. Do not use color alone. Provide a station/reach list with the same selection/action capability as the map. Announce revision expansion as well as reduction. Native date/time inputs or accessible alternatives retain timezone clarity.

Use normal-width numeric glyphs for measurements. Use icons plus text for accepted/excluded/pending. Decorative contours/photo masks are hidden from assistive technology. Image descriptions explain content without asserting contaminants.

### 17.3 Performance budgets and telemetry

On reference tests at 1440px and mobile throttled profile: public LCP ≤2.5s, CLS ≤0.1; interactive mutation feedback ≤100ms local; cached route response visible ≤300ms; ordinary API read p95 <500ms on seeded 10k-record workspace excluding map-provider latency; long analysis async. No guarantee that all nonlinear solves finish within a fixed latency; respect companion budgets and unresolved outcome.

Keep initial public JS under 250KB gzip excluding deferred map/AI tools. Lazy-load MapLibre/editor/exports, self-host subset fonts, responsive AVIF/WebP derivatives, reserve media sizes. Operational page avoids large photographic payload by default in low-bandwidth mode. Test map performance with 500 visible features and directory with 10k records; virtualize long lists, avoid DOM marker explosion.

Structured logs: request/job/case IDs, stage, latency, error code, origin; redact raw photos, text, coordinates and personal data. Health checks distinguish API, database, storage, worker, map provider, AI and email. Provider unavailable is a feature state, not total outage.

## 18. Deployment and operations

Local and production environment templates document every variable, secret/public classification and consequence of absence:
APP_URL, API_INTERNAL_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (worker only), DATABASE_URL, AUTH_JWKS_URL, STORAGE_BUCKET, MAP_STYLE_URL optional, GEOCODER_BASE_URL optional, AI_API_KEY/AI_MODEL/AI_BASE_URL optional, EMAIL_PROVIDER configuration optional, EXPORT_SIGNING_KEY_ID/PRIVATE_KEY optional, FHIR_CANONICAL_BASE, INTAKE_ORG_ID, EXAMPLE_MODE, LOG_LEVEL.

Production startup validates required values and refuses development example credentials. Optional integrations visibly degrade. Provide docker-compose development orchestration and production Dockerfiles/health checks. Web/API/worker use least-privilege accounts, nonroot containers, bounded memory and graceful shutdown.

Migrations run as a release step with backups, never opportunistically on every user request. Test fresh database and upgrade from prior schema fixture. Managed database daily backup; document point-in-time recovery availability if configured and test restore to isolated environment. Object storage backup/export policy is separate from database backup.

Outbox leases survive process restart. Failed jobs expose retry without data duplication. Engine upgrades do not silently rewrite approved assessments; new version triggers explicit reanalysis proposal with audit. Source-data license changes and revoked map providers are tracked in configuration/assets manifest.

Deliver a production runbook: provision services, apply migrations, create intake org/admin, configure auth redirect origins/email, configure allowed public map providers, set optional AI/signing/recipients, smoke test, backup/restore, rotate keys, rollback web/API, retry queue, investigate solver limits. No invented live URL or deployment claim.

## 19. Completion and implementation sequence

This sequence is dependency-based, not a schedule. Each stage must leave real working behavior and tests.

1. Domain contracts, enums, authority hierarchy, design tokens, native SVG brand/curve components.
2. Database/auth/capabilities, storage, audit, idempotency, immutable versions and local setup.
3. Report workflow including unmapped location, draft persistence, receipt, directory.
4. Network/station/protocol/instrument readiness, imports and mapping review.
5. Scientific model, exact solver, conservative planning and independently checked fixtures.
6. Task assignment, measurement capture, offline sync and correction/QC.
7. Case map, evidence comparison, retraction dependencies and expert decisions.
8. AI assistance with consent/confirmation and deterministic fallback.
9. Packages, validator, signing, recipient delivery/acknowledgment.
10. All routes, responsive refinement, hybrid styling and complete motion system.
11. Failure/permission/accessibility/load testing, deployment, documentation and release verification.

Do not mark the product complete after stage 3 because the landing page looks polished. Do not hide missing engine work behind a seeded JSON response. Do not trade away the agreed visual quality after backend implementation.

Required final deliverables: runnable repository; pinned dependencies; migrations; fixture generators; test suite; supplied/generated licensed assets; docs; accessible pages; environment templates; CI; reproducible local commands; deployment/runbook; factual completion report naming any unavailable externally configured capability.

## 20. Sources and interpretation

The requirements above are product decisions. The sources below support specific technical or domain constraints; they do not validate Upstream's field accuracy or endorse the product.

[S1] HydroRIVERS product scope and thresholds: https://www.hydrosheds.org/products/hydrorivers
[S2] Humanitarian OpenStreetMap Team, community/field mapping of the Sherni River basin: https://website.hotosm.org/en/projects/mapping-for-sherni-river-museum-project/
[S3] Next.js experimental viewTransition status: https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition
[S4] FHIR R4 Observation, DocumentReference and Provenance definitions: https://hl7.org/fhir/R4/observation.html ; https://hl7.org/fhir/R4/documentreference.html ; https://hl7.org/fhir/R4/provenance.html
[S5] WCAG 2.2: https://www.w3.org/TR/WCAG22/
[S6] Supabase SSR authentication: https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs
[S7] Motion reduced-motion guidance: https://motion.dev/docs/react-accessibility
[S8] Z3 real arithmetic and nonlinear decision support: https://microsoft.github.io/z3guide/docs/theories/Arithmetic/
[S9] User-supplied IEEE OneAquaHealth Global Hackathon challenge/rubric, supplied in this conversation; no inferred scoring weights.

## 21. Definition of done

The application is complete only when every required gate in ACCEPTANCE.md passes, every primary route has all meaningful states, scientific unknowns stay unknown, synthetic data is labelled, external integration states are honest, and visual inspection at the specified viewports matches the hybrid direction. The PRD specifies a software product; successful tests do not establish environmental-model validity at an unstudied real site.

