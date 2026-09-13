# M4 — Implement the first increment and inspect a reusable review (20 minutes)

**Claude Code capability:** a skill with explicit invocation and a separate execution context.
`/workshop-review` runs with `context: fork` and the read-only investigator agent. It does **not** see
your conversation; you supply the target, spec, diff and check evidence in a file.

**Opening:** Implement progress and correct completion. Use the supplied review skill to check your
actual change against your specification.

## Do

1. Implement increment A from `PLAN.md`: the three handlers in `src/server/routes/reports.ts` calling
   the job service, the request functions in `reportApi.ts`, and the panel states `Requesting report…`,
   `Report queued`, `Generating report…`, `Report ready` with `Open report`.
2. Run `npm run check -- --stage m4 --json workshop/evidence/m4-check.json`. Correct using its output.
3. Save the diff: `git diff <starter-sha> -- src > workshop/evidence/m4-diff.txt`.
4. Write `workshop/evidence/m4-review-context.md` with: target (own increment, commit SHA), acceptance
   IDs (AC-01–AC-03), spec path, diff path, source paths, check output path.
5. Invoke `/workshop-review workshop/evidence/m4-review-context.md`. Read its most consequential
   finding. Verify it against the code and the check output **before** changing anything. Correct if
   justified; otherwise record why the finding is unsupported or the acceptance is supported.

## Submit

The first working increment, the check result, the review-context file and the **M4** entry in
`EVIDENCE.md`. Commit and push.

## How M4 is graded (5 method points)

| Level | Looks like |
| --- | --- |
| 0 | A bare skill invocation, or a review finding acted on without verification. |
| 2.5 | Useful procedure use with material missing context or verification. |
| 5 | Explicit context supplied, and a verified finding or a supported acceptance on the first increment. |

The application's behavior points are calculated separately from the submitted code. A correct first
attempt does not require a manufactured defect.

## If you fall behind

The trainer can supply a private increment-A snapshot. Its hash and time are recorded; only your work
after that point earns method credit.
