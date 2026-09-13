# Plan: two reviewable increments

<!-- REHEARSAL: facilitator-authored plan used to exercise capture; not an observed learner answer. -->

## Kind of change

New behavior on the client and thin server wiring, plus a defect correction (stuck state). Verification: regression case that fails on the starter, then AC-01–AC-06.

## Alternatives considered

Replace `reportJobs.ts` with a client-side timer model: rejected because the service already owns run identity, the one-active-run rule and retry validation, and SYS-02/SYS-03 forbid bypassing or changing it. Reuse chosen.

## Increment A — start work and show progress (M4)

1. `src/server/routes/reports.ts`: implement the three handlers by calling `service.start`, `service.get`, `service.retry`; 202/200 with Location.
2. `src/client/reports/reportApi.ts`: `startReportRun`, `getReportRun`, `retryReportRun`.
3. `src/client/reports/ReportPanel.tsx`: observe a run, poll every 500 ms while pending/running, resume on entry. Check: `npm run check -- --stage m4`.

## Increment B — recover from failure (M5)

1. Failed state exits generating and shows `Retry report`; retry follows the child and clears the error.
2. Token guard so stale responses are ignored; abort on unmount.
3. `tests/acceptance/stuck-state-regression.spec.ts`. Check: `npm run check -- --stage m5`.

## Acceptance mapping

| ID | Increment | File(s) | Check |
| --- | --- | --- | --- |
| AC-01 | A | routes/reports.ts, reportApi.ts, ReportPanel.tsx | m4 api + m5 browser |
| AC-02 | A | routes/reports.ts, ReportPanel.tsx | m4 api + m5 browser |
| AC-03 | A | routes/reports.ts, ReportPanel.tsx | m4 api + m5 browser |
| AC-04 | B | ReportPanel.tsx, stuck-state-regression.spec.ts | m5 |
| AC-05 | B | routes/reports.ts, ReportPanel.tsx | m5 |
| AC-06 | B | ReportPanel.tsx | m5 |

## Change estimate

- Application code: 180–260 lines
- Tests: 20–60 lines
- Files expected to change: src/server/routes/reports.ts, src/client/reports/reportApi.ts, src/client/reports/ReportPanel.tsx, tests/acceptance/stuck-state-regression.spec.ts
- Anything outside the suggested area and why: none

## Subagent investigation

- Question: which inputs and tests define the report contents we must preserve?
- Tools: Read, Grep, Glob (from `.claude/agents/report-investigator.md`; no shell)
- Model: inherit (default session model)
- Finding: `src/server/reports/buildReport.ts` builds the document from inspection + vehicle; `fixtures/expected-reports.json` pins both documents; `tests/service/buildReport.test.ts` asserts equality and canonical JSON; `tests/acceptance/api.test.ts` AC-03/AC-06 compare the job report with the fixture.
- Verification: opened `tests/service/buildReport.test.ts` and confirmed the `toEqual(expected)` assertion; ran `npm run check -- --stage fast`.
- Effect on plan: no builder or fixture edits anywhere; increment B compares the modern report with the legacy document rather than re-deriving it.
