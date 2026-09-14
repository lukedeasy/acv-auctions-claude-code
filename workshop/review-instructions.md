# Peer review: the common failure/retry journey

Every reviewer tests the same bounded journey on the assigned author's frozen M5 commit. Review the
assigned acceptance path only: **AC-04** and **AC-05**.

## Before you start

- Confirm the target SHA printed by the review copy matches your assignment.
- Read AC-04 and AC-05 in `workshop/acceptance.md` and the matching rows in the author's `SPEC.md`.
- The review copy is isolated: its own ports and its own in-memory state. Nothing you do there changes
  the author's branch.

## Steps

1. Click **Reset data**. Select **Manual** scheduling. Tick **Fail next generation**.
2. Open vehicle STK-20811 → **Open inspection** (`/inspections/insp-001`).
3. Click **Generate report**. In the Operations panel the new attempt is selected; click **Begin selected
   attempt**, then **Finish selected attempt**.
4. Check: the panel shows `Report generation failed. Try again.`, does **not** show `Generating report…`
   or `Report ready`, offers an enabled **Retry report**, and shows no **Open report** link.
5. Click **Retry report**. Check: the panel follows a new attempt (`Attempt 2`), the old error is gone,
   status is `Report queued`.
6. **Begin** and **Finish** the child. Check `Report ready`, click **Open report**, confirm the report is
   for insp-001 revision 1 with its two findings.
7. Repeat-retry check. Either run the supplied HTTP check
   (`npm run check -- --stage m5 --json out.json` in the review copy and read the AC-05 entry), or send
   the same retry request twice and confirm the second answer is `200` with the same `run.id`:

   ```sh
   curl -s -X POST http://127.0.0.1:<api-port>/api/report-runs/<failed-parent-id>/retry -H 'content-type: application/json' -d '{}'
   ```

8. Use `/workshop-review <peer review-context file>` for a second opinion. Verify any finding you
   rely on by executing it. Claude's claim alone is not evidence.

## Submit

Write `review.json` in the review packet (fields below) or paste the same fields in the review form:

```
reviewId, assignmentId, reviewerId, authorId, targetSubmissionId, targetSha,
acceptanceIds ["AC-04","AC-05"], verdict (pass | fail | unable_to_verify),
expected, steps[], observed, evidencePaths[], sourceLocations[],
recommendedAction, limitations, submittedAt
```

Short prose. Attach command output or a screenshot where it helps. Never attach a personal transcript.

**Supported failure example:** "After the retry completes, the report opens but the previous failure
alert remains. Target SHA …; steps 1–6; screenshot …; `src/client/reports/ReportPanel.tsx:<line>`
keeps the old error. Clear the error when following the child attempt and add a regression assertion."

**Supported acceptance example:** "The assigned failure/retry journey passed at SHA …. Failure enabled
Retry; one child was created; completion removed the error and opened inspection insp-001 revision 1.
Attached check output and UI evidence. I did not test restart persistence, which is excluded."

If execution is prevented (the copy will not start, ports clash), report `unable_to_verify` with the
cause and tell the facilitator.
