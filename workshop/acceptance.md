# Acceptance rules and what the checks look for

Contract `inspection-desk-1.0`. These six cases are the published behavior standard. The trainer's
checks may use different fixture values and request orderings within these rules; they never add an
unpublished requirement. Each case earns its points only when every assertion for it passes.

| ID | Points | Required behavior |
| --- | ---: | --- |
| AC-01 | 6 | Starting generation returns an attempt identity before generation finishes. The UI shows `Report queued`, then `Generating report…`, and never `Report ready` early. |
| AC-02 | 6 | Repeating Start for an inspection with a pending/running attempt returns the same attempt (HTTP 200, `reused: true`). Concurrent Start requests observe one identity. Different inspections can run at once. The UI prevents duplicate active requests and resumes an active attempt after reload. |
| AC-03 | 8 | A completed attempt shows `Report ready` and `Open report` opens `/reports/<attempt id>` with the expected document for that inspection. Checked for both fixture inspections. |
| AC-04 | 6 | A forced failure shows `Report generation failed. Try again.`, removes the generating state, offers an enabled `Retry report` button and no `Open report` link. The server run is `failed` with the documented error and no report. |
| AC-05 | 6 | Retry creates one new attempt (child) linked to the failed parent, using the parent's original inspection snapshot even if the inspection was revised. The UI follows the child, clears the old error, and shows the child's attempt number. Repeated and concurrent retry requests return the same child (200, reused). Retrying a pending, running, completed or legacy record returns 409 `RUN_NOT_RETRYABLE`; retrying while another attempt is active returns 409 `ACTIVE_RUN_EXISTS`; neither creates anything. A double-click on Retry sends one request. |
| AC-06 | 8 | Modern and legacy documents are identical for the same snapshot and contain no run ID or generation time. Switching to another inspection never shows the previous inspection's attempt or report, even when a delayed status response arrives after navigation. |

## HTTP contract for the three learner endpoints

| Method and path | Body | Success |
| --- | --- | --- |
| `POST /api/inspections/:id/report-runs` | `{}` | 202 `{run, reused:false}` new pending attempt; 200 `{run, reused:true}` existing active attempt. Both set `Location: /api/report-runs/<id>`. 404 `INSPECTION_NOT_FOUND`; 400 without an object body. |
| `GET /api/report-runs/:runId` | — | 200 `{run}` in any state; 404 `RUN_NOT_FOUND`. |
| `POST /api/report-runs/:runId/retry` | `{}` | 202 `{run, reused:false}` new child; 200 `{run, reused:true}` already-linked child. 409 `RUN_NOT_RETRYABLE` / `ACTIVE_RUN_EXISTS`; 404 `RUN_NOT_FOUND`. |

`run` is the `RunView` type in `src/shared/reportTypes.ts`. Error envelope: `{"error":{"code":"…","message":"…"}}`.

## Visible strings and controls the browser checks use

The checks find elements by role and accessible name, and read the status region by test ID.
Keep these exact:

- Status region: `data-testid="report-status"` with `role="status"` inside `data-testid="report-panel"`.
  Texts: `No report generated.`, `Requesting report…`, `Report queued`, `Generating report…`,
  `Report ready`, `Requesting retry…`, `Could not check report status.`
- Error: an element with `role="alert"` inside the panel containing `Report generation failed. Try again.`
- Buttons by accessible name: `Generate report`, `Retry report`, `Check again`.
- Link by accessible name: `Open report` → `/reports/<attempt id>`.
- Attempt identity: the panel text includes `Attempt <n>` for job attempts (legacy records say `Legacy`).
- The inspection page root has `data-testid="inspection-page"` and `data-inspection-id="<id>"`.
- Report page: `data-testid="report-page"`, `data-testid="report-revision"`, `data-testid="report-finding-<finding id>"`, `data-testid="report-json"`.

## System checks that gate awards

| ID | Rule |
| --- | --- |
| SYS-01 | `npm run build` succeeds and the built app serves `/api/health` and a client deep link. |
| SYS-02 | `src/server/routes/reports.ts`, and any helper it imports, do not import or reference the report builder or the runtime store. Call the job service. |
| SYS-03 | Protected files (fixtures, expected reports, lockfile, supplied service modules, supplied tests, check runner and configuration) match the starter manifest. Add tests in new files; do not edit the supplied ones. |

A failing system check cannot be offset by qualitative points.

## Commands

```
npm run check -- --stage baseline   # starter health; expected green before you begin
npm run check -- --stage fast       # type check + service + structure, no browser (the hook uses this)
npm run check -- --stage m4         # fast + AC-01..AC-03 HTTP-level
npm run check -- --stage m5         # everything incl. browser journeys and hook tests
npm run check -- --stage m6         # m5 + final evidence structure
```

Add `--json <path>` to write the machine-readable result. Exit 0 pass, 1 a check failed, 2 tooling problem.
The public checks give feedback. The trainer reruns a private copy of the same checks on your captured
commit; that private run is the official result.
