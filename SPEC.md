# Specification: report generation progress and safe retry

<!-- REHEARSAL: facilitator-authored specification used to exercise capture; not an observed learner answer. -->

## Problem and evidence

The panel in `src/client/reports/ReportPanel.tsx` waits for `POST /api/inspections/:id/report` and, on failure, sets an error but never resets `isGenerating` (the catch branch omits `setIsGenerating(false)`). The user sees `Report generation failed. Try again.` with a disabled button. `tests/baseline/screens.spec.ts` [BASE-02] only asserts the message, so it passes on the defect; the baseline stage's `BASE-02-STRONG` diagnostic fails on `not.toHaveText('Generating report…')`.

## Intended behavior

Generate starts a run through `POST /api/inspections/:id/report-runs` and returns immediately with a run ID. The panel shows `Requesting report…`, then `Report queued`, then `Generating report…`, then `Report ready` with `Open report` to `/reports/<runId>`. Reloading resumes the active run. Failure shows the error, leaves generating, and offers `Retry report`, which calls `POST /api/report-runs/:runId/retry` and follows the child attempt.

## Failure cases

Missing object body → 400. Unknown inspection/run → 404. Retry of pending/running/completed/legacy → 409 `RUN_NOT_RETRYABLE`, no new run. Retry while another attempt is active → 409 `ACTIVE_RUN_EXISTS`. Status lookup network failure → `Could not check report status.` with `Check again`; no new attempt. A late status response for a previous run or inspection is ignored.

## Constraints

Report contents are defined by `src/server/reports/buildReport.ts` and pinned by `fixtures/expected-reports.json`; unchanged. Handlers call `src/server/reports/reportJobs.ts` only (SYS-02). Protected files unchanged (SYS-03). The legacy route stays available. No persistence, queue, database or auth changes.

## Acceptance criteria

| ID | Example | Expected result | Planned check |
| --- | --- | --- | --- |
| AC-01 | Manual mode; click Generate | 202 with pending run and Location; panel shows queued then generating; ready only after finish | tests/acceptance/api.test.ts, journeys.spec.ts |
| AC-02 | Click Generate twice; 8 concurrent POSTs | one run ID; second POST 200 reused; button disabled; reload resumes | api.test.ts, journeys.spec.ts |
| AC-03 | Finish attempt for insp-001 and insp-002 | Open report shows the fixture document | api.test.ts, journeys.spec.ts |
| AC-04 | Fail next; generate; finish | error text, no generating, enabled Retry, no Open report | journeys.spec.ts, new regression spec |
| AC-05 | Retry after revision bump; retry twice | one child, attempt 2, revision 1, error cleared, 200 reused on repeat | api.test.ts, journeys.spec.ts |
| AC-06 | Start A, open B, finish A | B shows nothing of A; legacy and job documents equal | journeys.spec.ts, api.test.ts |

## Scope

Included: `ReportPanel.tsx`, `reportApi.ts`, `routes/reports.ts`, one new spec under `tests/acceptance/`. Excluded: persistence, multi-process, PDF, deployment, changes to the service.

## Open decisions

Whether a fresh Generate should also be offered beside Retry after a failure; the sheet leaves it to the engineer. Implementation does not depend on it.
