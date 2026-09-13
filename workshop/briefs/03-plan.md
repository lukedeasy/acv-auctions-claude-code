# M3 — Plan and delegate a bounded investigation (25 minutes)

**Claude Code capability:** Plan Mode; a subagent with its own tools, model and context; verifying a
delegated finding before using it.

**Opening:** Plan the modernization before implementation. Reuse the supplied service, estimate the
change and give a separate Claude assignment one question that improves the plan.

## Do

1. Enter Plan Mode. Starting prompt:

   > In Plan Mode, compare reusing reportJobs with replacing it. Use report-investigator for the narrow
   > question: which inputs and tests define the report contents we must preserve? Supply explicit
   > paths and require citations. Check the result. Plan two reviewable increments with acceptance
   > checks and estimated changed-line ranges. Do not implement yet.

2. Inspect `.claude/agents/report-investigator.md` (`/agents`). It has Read, Grep and Glob only and no
   shell. Give it the builder, fixture and test paths. Read its citations yourself; accept, correct or
   reject its finding.
3. Increment A: request/status/progress (AC-01–AC-03). Increment B: failure/retry plus a regression
   case that exposes the stuck-state defect (AC-04–AC-06 as needed).
4. Challenge any proposal to add a database, a queue, or a report redesign. The service already owns
   run identity, the one-active-run rule and retry validation.
5. Leave Plan Mode before authorizing edits. Complete `PLAN.md`. No application changes in this module.

## Submit

`PLAN.md` and the **M3** entry in `EVIDENCE.md` with the delegated question, tools, model, the
returned finding and your decision about it. `npm run check -- --stage m3` verifies structure and that
every AC maps to an increment, file and check.

## How M3 is graded (10 method points)

| Level | Looks like |
| --- | --- |
| 0 | A screenshot of an agent invocation, or an unbounded implementation proposal. |
| 5 | A useful plan and delegation with a material missing scope, check or source link. |
| 10 | Bounded delegation with suitable tools/model, a verified finding, and a reasoned two-increment plan with acceptance/check mapping. |

Exact line estimates and fewer lines earn no bonus. A larger change can score fully when its scope is
explained and split into checkable increments.

## If you fall behind

Partial file map: `src/client/reports/ReportPanel.tsx`, `src/client/reports/reportApi.ts`,
`src/server/routes/reports.ts`, a new test under `tests/acceptance/`. Investigator question: "Which
file builds the report document and which test compares it with `fixtures/expected-reports.json`?"
Record that these were supplied.
