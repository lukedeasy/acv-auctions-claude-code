# Evidence examples: insufficient, adequate, strong

Fictional examples so everyone knows the standard before scoring. They are not observed sessions.

## M1 context/model decision

- **Insufficient (0):** "Used Opus. Claude said the button is disabled because of a bug." No path, no
  reproduction, no check of the claim.
- **Adequate (2.5):** Reproduced with the failure control; cited `ReportPanel.tsx` where `isGenerating`
  is set to `true` but never reset in the catch path; did not look at what `[BASE-02]` asserts.
- **Strong (5):** The above plus: "`tests/baseline/screens.spec.ts` [BASE-02] asserts only the alert
  text, so it passes with the button disabled; `BASE-02-STRONG` in the baseline output fails on
  `not.toHaveText('Generating report…')`. Kept the default model at default effort: reading three files
  and reproducing one click did not justify more. Corrected Claude's first claim that the server
  returns 500; the route returns 503 `SIMULATED_GENERATION_FAILURE` (`src/server/errors.ts:…`)."

## M2 clarification

- **Insufficient (0):** SPEC.md generated in one prompt, no question asked, "retry should be robust".
- **Adequate (5):** Claude asked whether Retry re-runs the failed attempt or starts fresh; answered
  from the sheet (same snapshot); but the spec does not say what happens when Retry is clicked twice or
  what "one active attempt" means for the button.
- **Strong (10):** Same question and answer; the spec states the retry-vs-start distinction, the
  double-click rule, the 409 cases, the preserved-content rule with the oracle file, exclusions, and one
  genuinely open item recorded as such.

## M4 review skill use (labeled supplied failure example)

A labeled example of a hook/check failure, for inspecting the failure branch when your own change
passes first time:

```
[check-report-change] src/server/routes/reports.ts changed → fast checks FAILED.
  - SYS-02 fail: New handlers use the job service; no direct builder/store import — 1/3 tagged tests failed: routes/reports.ts imports src/server/reports/buildReport.ts (log: .check-output/fast/vitest.log)
Use the check output above to correct the change. Re-run: npm run check -- --stage fast
```

- **Insufficient (0):** "/workshop-review said it looks fine."
- **Strong (5):** Review-context file listed; the skill's finding "Location header missing on the
  reused 200 response" verified against `reports.ts` and the AC-02 test output; corrected; m4 rerun
  attached.

## Outgoing review (20)

- **0:** "Looks good, nice work."
- **Validity 8 / Evidence 0 / Usefulness 4 = 12:** A real defect described correctly, with a sensible
  fix, but no SHA, no steps and no output that lets the author reproduce it.
- **20:** Verified failure or acceptance at the assigned SHA, reproducible steps with output or a
  screenshot, a bounded correction or clearly stated limits.
