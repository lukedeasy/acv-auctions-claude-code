# M6 — Test a peer, revise and decide readiness (20 minutes)

**Claude Code capability:** an independent review context. Reuse `/workshop-review` on someone else's
saved commit with their spec, diff and checks supplied explicitly; verify Claude's claim; then verify
your own final version after corrections.

**Opening:** Test the assigned failure/retry journey on another engineer's saved submission. Use
Claude's review assistance, verify the result and give the author useful evidence.

## Do (7 minutes review)

1. Open the prepared review copy for your assignment. Confirm the displayed target SHA matches.
2. Follow `workshop/review-instructions.md`: reset, manual mode, fail next, generate, begin/finish,
   check failure state, retry, check the child, open the report, run the repeat-retry check.
3. Invoke `/workshop-review` with the peer's review-context file. Verify the finding you rely on by
   executing the journey or a small test in the review copy. Never edit the author's branch.
4. Submit a supported failure, a supported acceptance, or `unable_to_verify` with the cause.

## Do (7 minutes corrections, 4 minutes decision)

5. Return to your own workspace. For each received finding record `accepted_fixed`,
   `accepted_unresolved` or `disputed_with_evidence` (a dispute cites source or check output).
6. Commit your corrections. From that clean, committed checkout run
   `npm run check -- --stage m6 --json workshop/evidence/m6-check.json`. The result names the code
   commit it tested.
7. Write the **M6** entry in `EVIDENCE.md` from that result: `Tested commit` is the commit you just
   checked, `Final checks` cites `workshop/evidence/m6-check.json`, `Readiness` is `ready_for_merge`
   only if every required check passed, otherwise `changes_required` with the unresolved items named.
8. Run `npm run check -- --stage evidence`. It verifies the entry against the cited result (same tested
   commit, readiness consistent with the checks). Then commit and push: that later commit is your M6
   submission; it does not need to contain its own SHA. Upstream `main` stays unchanged; nothing is
   merged during class.

## How M6 is graded

- **Outgoing review, 20 points:** validity 8, evidence 8, usefulness 4. "Looks good" is 0. A supported
  acceptance of a clean candidate can earn all 20. An unverified Claude claim earns no validity or
  evidence credit.
- **M6 method, 5 points:** your handling of received findings with evidence, explained final scope,
  and checks on the final submitted commit. An accurately reported unresolved failure can earn method
  credit; it does not pass the behavior gate.

Outgoing review is scored once. It is not counted again as task quality.

## If your peer is unavailable

The facilitator assigns the prepared target `fallback-failure-retry-v1` under the same criteria.
