# Product decisions (shared answer sheet)

These are the product owner's answers for the workshop assignment. Everyone gets the same sheet.
Use them to resolve the ticket's ambiguities. Do not invent additional company rules; if a question is
not answered here, record it as an open decision in SPEC.md.

All rules describe the fictional teaching application. They are not any company's production policy.

## What the user sees

| Situation | Decision |
| --- | --- |
| Generation requested | The panel shows `Requesting report…` until the server answers, then `Report queued` while the attempt is waiting, then `Generating report…` while it runs. Show which attempt this is (for example "Attempt 1"). |
| Attempt completes | The panel shows `Report ready` and an `Open report` link to that attempt's report. |
| Attempt fails | The panel shows the error `Report generation failed. Try again.`, leaves the generating state, and offers an enabled `Retry report` button. It never claims success and never shows an `Open report` link for the failed attempt. |
| Retry requested | The panel shows `Requesting retry…` until the server answers, then follows the **new** attempt (queued → generating → ready). The old error disappears once the retry has been accepted. |
| Status lookup fails (network) | The panel shows `Could not check report status.` with a `Check again` button that re-reads the same attempt. It does not start another attempt. |
| Page reloads while an attempt is active | The panel resumes showing the active attempt; it does not start a new one. |
| User switches to another inspection | The panel immediately shows the other inspection's own state. It never shows the previous inspection's attempt or report. |

## Rules about attempts

| Question | Decision |
| --- | --- |
| Can two attempts for the same inspection run at once? | No. Requesting generation while an attempt is pending or running returns the same attempt. The button is disabled while an attempt is active. |
| Can two different inspections run at once? | Yes. |
| What does Retry retry? | The failed attempt, using the same inspection data that attempt captured. If the inspection was revised since, the retry still uses the original data. |
| What if Retry is clicked twice? | The second click must not create a second attempt. The server returns the same retry attempt; the UI sends one request. |
| What can be retried? | Only a failed attempt from the new run-based path. Pending, running and completed attempts, and reports produced by the older synchronous path, cannot be retried. |
| After a completed attempt, can the user generate again from scratch? | Yes. A new generation (not Retry) uses the current inspection data. After a failed attempt the panel's recovery action is Retry; whether a fresh Generate is also offered there is the engineer's choice, as long as Retry is present and enabled. |
| Where does the "one active attempt" rule live? | In the prepared server-side job service. The new route handlers call the service and pass its answer through; they do not reimplement the rule. |

## What must stay the same

- Report contents for the same inspection input are unchanged. The existing builder defines them.
- The older synchronous generation route stays available for comparison.
- Report contents never include an attempt identifier or a timestamp of generation.

## Out of scope

Persistence across server restart, several server processes, external queues, authentication changes,
PDF output, worker crash recovery, and deployment. Do not build any of these.
