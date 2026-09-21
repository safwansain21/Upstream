# Specification audit and implementation rulings

Date: 2026-09-21. All three normative documents and all five images read before implementation. The repository initially contains only README and .gitignore.

## Contradictions resolved by the supplied authority hierarchy

1. Evidence screenshot says approval shares the assessment. PRD §15.4 and F16 require separate explicit sending: approval publishes internally; delivery is a separate action.
2. Report screenshot requires permitted-land assertion and implies location already selected. PRD §6.3/B15 override both: guidance without a required assertion; location may be unresolved; steps represent actual progress.
3. Workspace screenshot recommends B2 as useful discrimination. The exact fixture at U=5 admits ambiguity (E08). Show its computed conservative bound and no promised narrowing; operational evidence collection remains possible.
4. Illustrative satellite geography, example dates, confluence positions and secondary typography do not define the app. Geometry and numbers come from versioned data; body text uses Source Sans 3; default maps use self-created vector layers.
5. Finite source lengths are conditional on reviewed closed boundaries. Unknown boundary alternatives remain open-ended and disable finite whole-area planner claims.
6. Readiness requires at least one supported configuration, but mathematical results must survive evidence removal. Compute compatibility separately from localization eligibility; missing anchor suspends recommendations without inventing exclusions.
7. Approval immutability and later under-review/superseded status coexist through append-only publication events/current pointers. Signed snapshot bytes never change.
8. Production defaults cannot inherit the synthetic bounds. Fixture constructors live outside the engine and only seed explicitly marked example organizations.
9. Public examples are read-only; authenticated demonstrations use isolated example organizations and normal APIs. No shared mutable role selector on production records.
10. Source strings are preserved as provenance, not fetched as arbitrary URLs. Configured outbound integrations have explicit allowlists and SSRF protection.

## Architecture and workflow

Use the required stack without substituting SQLite, browser-only records, canned scientific results or a different auth system. Next.js App Router provides public and operational routes; FastAPI validates identity and capabilities; Supabase PostgreSQL/PostGIS/Auth/storage supplies durable authority. A leased PostgreSQL worker executes immutable engine snapshots, exports and delivery. The pure Python engine knows no AI or simulator truth.

Report → readiness → qualified task → individual readings → exact analysis → expert review → immutable package → explicit delivery → independent acknowledgment. Revision events propagate to assessment warnings, tasks, receipts and prior recipients.

Implementation is inline on a new branch in a dedicated clone. The supplied design is already approved by the request; routine skill approval gates do not override the explicit instruction to build continuously. All acceptance IDs are tracked individually.

## Environment findings

- Node 24.14.1 and Python 3.12.14 available through documented runtime environment.
- Git repository cloned; initial revision 1304efb. Commit identity uses existing user configuration, no fabricated attribution or history.
- GitHub CLI is not authenticated; Git transport read access works. Push will be attempted at the first checkpoint.
- Docker, local PostgreSQL and WSL are absent. Asked user to enable Docker Desktop/WSL2 or supply an existing development host. This blocks execution of required local Supabase integration checks, not independent implementation. Such checks remain FAIL until run.
- No production deployment, email, AI or signing account is assumed. Missing optional providers remain visibly unavailable.

## Review focus

- Revoked membership during offline sync must preserve drafts and reject submission.
- A dependency change racing approval must yield conflict, never stale approval.
- Instrument reservations must reject overlapping time ranges atomically across processes.
- Unknown topology and solver resource exhaustion must retain possibilities.
- Changed signed artifacts or a predecessor mismatch must fail verification.
